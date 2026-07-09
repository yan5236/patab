<script setup lang="ts">
/**
 * ComponentStoreItem —— 组件商店中的单个可添加条目
 * 上方展示组件预览，下方展示名称、简介和添加按钮；点击行为交给父组件处理。
 */
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  title: string
  description: string
  icon: Component
  added?: boolean
}>()

const emit = defineEmits<{ add: [] }>()
const { t } = useI18n()
</script>

<template>
  <article class="theme-glass-panel overflow-hidden rounded-[1.75rem] border">
    <div class="theme-card-preview flex h-48 items-center justify-center p-5">
      <slot name="preview" />
    </div>

    <div class="space-y-3 p-4">
      <div class="flex items-start gap-3">
        <span class="theme-card-icon-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl theme-text shadow-sm">
          <component :is="icon" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-base font-semibold theme-heading">{{ title }}</span>
          <span class="mt-1 block text-sm leading-5 theme-muted">{{ description }}</span>
        </span>
      </div>

      <button
        type="button"
        class="flex h-10 w-full cursor-pointer items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="added"
        @click="emit('add')"
      >
        {{ added ? t('modals.componentStore.added') : t('modals.componentStore.addToScreen') }}
      </button>
    </div>
  </article>
</template>
