<script setup lang="ts">
/**
 * SearchEnginePicker —— 搜索栏圆形引擎选择器
 * 只负责弹出当前可用引擎列表，选中结果交给父组件持久化。
 */
import { onBeforeUnmount, ref } from 'vue'
import { Check } from '@lucide/vue'
import type { SearchEngine } from '@/types'
import { colorForName } from '@/utils/favicon'
import { siteFromSearchTemplate } from '@/utils/searchEngines'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{
  engines: SearchEngine[]
  selectedId: string
  disabled: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

/** 当前选中的搜索引擎；无匹配时回退第一项用于展示图标 */
function selectedEngine(): SearchEngine | undefined {
  return props.engines.find((engine) => engine.id === props.selectedId) ?? props.engines[0]
}

/** 打开或关闭引擎选择框，并在打开时监听外部点击 */
function togglePicker() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) document.addEventListener('pointerdown', closeOnOutside)
  else document.removeEventListener('pointerdown', closeOnOutside)
}

/** 点击外部区域时关闭选择框 */
function closeOnOutside(event: PointerEvent) {
  const root = rootRef.value
  if (!root || root.contains(event.target as Node)) return
  open.value = false
  document.removeEventListener('pointerdown', closeOnOutside)
}

/** 选择一个引擎并关闭弹层 */
function choose(id: string) {
  emit('select', id)
  open.value = false
  document.removeEventListener('pointerdown', closeOnOutside)
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutside)
})
</script>

<template>
  <div ref="rootRef" class="relative shrink-0">
    <button
      type="button"
      class="inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full align-middle transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
      :disabled="disabled"
      :title="selectedEngine() ? `当前引擎：${selectedEngine()?.name}` : '请至少添加一个搜索引擎'"
      @click="togglePicker"
      @keydown.escape="open = false"
    >
      <AppIcon
        :name="selectedEngine()?.name ?? '搜索'"
        :url="selectedEngine() ? siteFromSearchTemplate(selectedEngine()!.urlTemplate) : ''"
        :color="colorForName(selectedEngine()?.name ?? '搜索')"
      />
    </button>

    <Transition name="engine-picker">
      <div
        v-if="open"
        class="engine-picker-card absolute left-0 top-10 z-[80] w-56 rounded-2xl border border-white/55 bg-white/90 p-2 shadow-2xl backdrop-blur-xl"
      >
        <button
          v-for="engine in engines"
          :key="engine.id"
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sky-50"
          @click="choose(engine.id)"
        >
          <span class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
            <AppIcon
              :name="engine.name"
              :url="siteFromSearchTemplate(engine.urlTemplate)"
              :color="colorForName(engine.name)"
            />
          </span>
          <span class="min-w-0 flex-1 truncate text-sm text-neutral-800">{{ engine.name }}</span>
          <Check v-if="selectedId === engine.id" class="h-4 w-4 shrink-0 text-sky-500" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 搜索引擎选择框：轻量淡入和缩放，贴近设置弹窗的动效节奏 */
.engine-picker-enter-active,
.engine-picker-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.engine-picker-enter-from,
.engine-picker-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
</style>
