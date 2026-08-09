<script setup lang="ts">
/**
 * CustomComponentCatalogItem —— 已安装第三方组件的商店目录卡片。
 * 卡片只接收 Store 投影的安全元数据，不读取 IndexedDB 文件、Blob 或第三方 HTML。
 */
import { PackageOpen, Plus, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  title: string
  description: string
  version: string
  enabled: boolean
}>()
const emit = defineEmits<{ add: []; uninstall: [] }>()
const { t } = useI18n()
</script>

<template>
  <article class="theme-glass-panel overflow-hidden rounded-[1.75rem] border">
    <div class="theme-card-preview flex h-32 items-center justify-center">
      <span class="theme-card-icon-bg flex h-16 w-16 items-center justify-center rounded-3xl theme-text shadow-sm">
        <PackageOpen class="h-8 w-8" />
      </span>
    </div>
    <div class="space-y-3 p-4">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-semibold theme-heading">{{ title }}</p>
          <p class="mt-1 line-clamp-2 text-sm leading-5 theme-muted">{{ description }}</p>
        </div>
        <span class="rounded-full px-2 py-1 text-[10px]" :class="enabled ? 'bg-emerald-500/15 text-emerald-700' : 'bg-neutral-500/15 theme-muted'">
          {{ enabled ? t('modals.componentStore.enabled') : t('modals.componentStore.disabled') }}
        </span>
      </div>
      <div class="flex items-center justify-between gap-2 text-xs theme-faint">
        <span>{{ t('modals.componentStore.thirdPartySource') }}</span>
        <span>{{ t('modals.componentStore.versionLabel') }} {{ version }}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="theme-subtle-button flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-2xl text-sm font-medium"
          @click="emit('add')"
        >
          <Plus class="h-4 w-4" />
          {{ t('modals.componentStore.addAnother') }}
        </button>
        <button
          type="button"
          class="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-red-500/15 text-sm font-medium text-red-600"
          @click="emit('uninstall')"
        >
          <Trash2 class="h-4 w-4" />
          {{ t('modals.componentStore.uninstall') }}
        </button>
      </div>
    </div>
  </article>
</template>
