<script setup lang="ts">
/**
 * CustomComponentImportButton —— 组件商店中的本地归档选择入口。
 * 只负责触发浏览器文件选择与转交 File，不读取内容、不解析 ZIP，也不直接写入组件仓库。
 */
import { ref } from 'vue'
import { FileArchive, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ select: [file: File | undefined] }>()
const inputRef = ref<HTMLInputElement>()
const { t } = useI18n()

/** 打开只接受 PaTab 本地 ZIP 的原生文件选择器；用户取消时浏览器不会触发 change，现有状态自然保持。 */
function openFilePicker(): void {
  inputRef.value?.click()
}

/** 提取用户选择的第一个文件，并清空 input 以允许随后选择同一文件重试。 */
function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('select', input.files?.[0])
  input.value = ''
}
</script>

<template>
  <section class="theme-surface flex flex-col gap-3 rounded-[1.5rem] border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 items-center gap-3">
      <span class="theme-card-icon-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl theme-text">
        <FileArchive class="h-5 w-5" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.importTitle') }}</p>
        <p class="mt-0.5 text-xs leading-5 theme-muted">{{ t('modals.componentStore.importHint') }}</p>
      </div>
    </div>
    <button
      type="button"
      class="theme-subtle-button flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-medium"
      @click="openFilePicker"
    >
      <Plus class="h-4 w-4" />
      {{ t('modals.componentStore.importAction') }}
    </button>
    <input
      ref="inputRef"
      class="sr-only"
      type="file"
      accept=".zip,.patab.zip,application/zip"
      @change="onFileChange"
    >
  </section>
</template>
