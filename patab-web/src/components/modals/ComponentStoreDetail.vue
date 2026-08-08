<script setup lang="ts">
/**
 * ComponentStoreDetail —— 组件商店详情视图
 * 顶部：返回按钮 + 图标 / 名称 / 版本 + 「添加到屏幕」按钮
 * 中部：组件各尺寸形态的手动走马灯（前后按钮、当前张数、缩略图，
 *       支持拖动滑动与键盘 ←/→ 切换，默认不自动播放）
 * 底部：简介、描述与开发者信息
 * 走马灯的单格像素尺寸随屏幕宽度自适应（移动端缩小）
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import { ArrowLeft, ChevronLeft, ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { WIDGET_SIZES } from '@/utils/grid'
import type { TileSize } from '@/types'

defineProps<{
  title: string
  version: string
  developer: string
  description: string
  detail: string
  icon: Component
  added?: boolean
}>()

const emit = defineEmits<{ back: []; add: [] }>()
const { t } = useI18n()

/** 展示用的组件尺寸形态（与小组件可调尺寸保持一致） */
const sizes = WIDGET_SIZES
const current = ref(0)
/** 当前展示的形态尺寸（sizes 非空，兜底取第一项） */
const currentSize = computed(() => sizes[current.value] ?? sizes[0]!)

/** 走马灯单格像素尺寸：桌面 72px，窄屏 52px */
const cell = ref(72)
const media = window.matchMedia('(min-width: 640px)')
function syncCell() {
  cell.value = media.matches ? 72 : 52
}

/** 某尺寸形态在舞台中的预览盒尺寸（传给 slide 插槽）；
    1×1 图标形态含图标+文字，高度自适应避免裁切 */
function boxStyle(size: TileSize): Record<string, string> {
  if (size.w === 1 && size.h === 1) {
    return { minWidth: `${cell.value}px`, minHeight: `${cell.value}px` }
  }
  return { width: `${size.w * cell.value}px`, height: `${size.h * cell.value}px` }
}

/** 缩略图按宽高比等比缩小，直观反映形态差异 */
function thumbStyle(size: TileSize) {
  return { width: `${size.w * 14}px`, height: `${size.h * 14}px` }
}

/** 切换到哪一张（首尾钳位，不循环） */
function go(index: number) {
  current.value = Math.min(Math.max(index, 0), sizes.length - 1)
}function prev() {
  go(current.value - 1)
}
function next() {
  go(current.value + 1)
}

/** 键盘 ←/→ 切换 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') prev()
  else if (event.key === 'ArrowRight') next()
}

/** 拖动 / 滑动手势：水平位移超过阈值即切换 */
const swipeX = ref<number | null>(null)
function onPointerDown(event: PointerEvent) {
  swipeX.value = event.clientX
}
function onPointerUp(event: PointerEvent) {
  if (swipeX.value === null) return
  const delta = event.clientX - swipeX.value
  if (delta <= -40) next()
  else if (delta >= 40) prev()
  swipeX.value = null
}

onMounted(() => {
  syncCell()
  media.addEventListener('change', syncCell)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  media.removeEventListener('change', syncCell)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="space-y-5">
    <!-- 头部：返回 + 图标 / 名称 / 版本 + 添加按钮 -->
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="theme-subtle-button shrink-0 cursor-pointer rounded-full p-2 transition-colors"
        :title="t('modals.componentStore.back')"
        @click="emit('back')"
      >
        <ArrowLeft class="h-5 w-5" />
      </button>
      <span class="theme-card-icon-bg flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl theme-text shadow-sm">
        <component :is="icon" class="h-6 w-6" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-semibold theme-heading">{{ title }}</p>
        <p class="mt-0.5 text-xs theme-muted">{{ t('modals.componentStore.versionLabel') }}：{{ version }}</p>
      </div>
      <button
        type="button"
        class="flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="added"
        @click="emit('add')"
      >
        {{ added ? t('modals.componentStore.added') : t('modals.componentStore.addToScreen') }}
      </button>
    </div>

    <hr class="theme-divider">

    <!-- 组件展示：手动走马灯 -->
    <section>
      <h3 class="mb-3 text-sm font-semibold theme-heading">{{ t('modals.componentStore.gallery') }}</h3>
      <div class="relative">
        <div
          class="theme-card-preview touch-pan-y select-none overflow-hidden rounded-[1.75rem]"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp"
          @pointercancel="swipeX = null"
        >
          <div
            class="flex transition-transform duration-300 ease-out"
            :style="{ transform: `translateX(-${current * 100}%)` }"
          >
            <div
              v-for="size in sizes"
              :key="`${size.w}x${size.h}`"
              class="flex h-56 w-full shrink-0 items-center justify-center"
            >
              <slot name="slide" :size="size" :box-style="boxStyle(size)" />
            </div>
          </div>
          <!-- 当前张数 -->
          <span class="theme-surface theme-muted absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs">
            {{ current + 1 }} / {{ sizes.length }}
          </span>
          <!-- 当前形态尺寸 -->
          <span class="theme-surface theme-muted absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs">
            {{ currentSize.w }}×{{ currentSize.h }}
          </span>
        </div>

        <!-- 前后按钮 -->
        <button
          type="button"
          class="theme-glass-panel theme-text absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-md transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="current === 0"
          :title="t('modals.componentStore.prevSlide')"
          @click="prev"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <button
          type="button"
          class="theme-glass-panel theme-text absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-md transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="current === sizes.length - 1"
          :title="t('modals.componentStore.nextSlide')"
          @click="next"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>

      <!-- 缩略图（容器加内边距，避免激活态 ring 被 overflow 裁切） -->
      <div class="mt-1 flex items-end justify-center gap-3 overflow-x-auto p-2">
        <button
          v-for="(size, index) in sizes"
          :key="`${size.w}x${size.h}`"
          type="button"
          class="flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl p-1.5 transition"
          :class="index === current ? 'theme-surface ring-2 ring-sky-400' : 'opacity-60 hover:opacity-100'"
          @click="go(index)"
        >
          <span class="flex h-8 items-end">
            <span
              class="theme-card-icon-bg block rounded-md border"
              :style="thumbStyle(size)"
            />
          </span>
          <span class="text-[10px] theme-muted">{{ size.w }}×{{ size.h }}</span>
        </button>
      </div>
    </section>

    <hr class="theme-divider">

    <!-- 简介 -->
    <section>
      <h3 class="mb-1.5 text-sm font-semibold theme-heading">{{ t('modals.componentStore.about') }}</h3>
      <p class="text-sm leading-6 theme-muted">{{ description }}</p>
    </section>

    <!-- 描述 -->
    <section>
      <h3 class="mb-1.5 text-sm font-semibold theme-heading">{{ t('modals.componentStore.descriptionLabel') }}</h3>
      <p class="text-sm leading-6 theme-muted">{{ detail }}</p>
    </section>

    <hr class="theme-divider">

    <!-- 开发者等信息 -->
    <section class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p class="text-xs theme-faint">{{ t('modals.componentStore.developerLabel') }}</p>
        <p class="mt-0.5 theme-text">{{ developer }}</p>
      </div>
      <div>
        <p class="text-xs theme-faint">{{ t('modals.componentStore.versionLabel') }}</p>
        <p class="mt-0.5 theme-text">{{ version }}</p>
      </div>
    </section>
  </div>
</template>
