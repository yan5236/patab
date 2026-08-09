<script setup lang="ts">
/**
 * CustomComponentImportStatus —— 展示不可信归档的可取消解析状态与经过脱敏的错误提示。
 * 错误信息只使用稳定码和安全路径，绝不展示 Worker、IndexedDB 或归档正文中的原始异常。
 */
import { computed } from 'vue'
import { AlertTriangle, LoaderCircle, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: 'error' | 'idle' | 'installing' | 'parsing' | 'review'
  sourceName?: string
  errorCode?: string
  errorPath?: string
}>()
const emit = defineEmits<{ cancel: []; dismiss: [] }>()
const { t } = useI18n()

const errorMessageKey = computed(() => {
  const code = props.errorCode ?? ''
  if (code === 'FILE_TYPE_INVALID') return 'fileType'
  if (code.startsWith('ZIP_')) return 'archive'
  if (code.startsWith('MANIFEST_')) return 'manifest'
  if (code.startsWith('PACKAGE_')) return 'packageFiles'
  if (code.startsWith('INTEGRITY_')) return 'integrity'
  if (code.startsWith('SIGNATURE_')) return 'signature'
  if (code === 'COMPONENT_ALREADY_INSTALLED') return 'alreadyInstalled'
  if (code === 'REQUIRED_PERMISSION_NOT_GRANTED') return 'requiredPermission'
  return 'unknown'
})

/** 只允许展示 Manifest JSON Pointer 或经归档校验的相对路径，拒绝把恶意路径或本机目录带进界面。 */
function safeErrorPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  if (/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(path)) return path
  if (/^(?:patab\.manifest\.json|integrity\.json|signature\.json|assets\/[A-Za-z0-9._/-]+|surfaces\/[A-Za-z0-9._/-]+)$/.test(path)) return path
  return undefined
}

const displayedErrorPath = computed(() => safeErrorPath(props.errorPath))
</script>

<template>
  <section
    v-if="status === 'parsing' || status === 'installing'"
    class="theme-surface flex items-center gap-3 rounded-2xl border p-4"
    role="status"
  >
    <LoaderCircle class="h-5 w-5 shrink-0 animate-spin text-sky-500" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium theme-heading">
        {{ status === 'parsing' ? t('modals.componentStore.parsingTitle') : t('modals.componentStore.installingTitle') }}
      </p>
      <p v-if="sourceName" class="mt-0.5 truncate text-xs theme-muted">{{ sourceName }}</p>
    </div>
    <button
      v-if="status === 'parsing'"
      type="button"
      class="theme-subtle-button h-9 shrink-0 cursor-pointer rounded-xl px-3 text-xs"
      @click="emit('cancel')"
    >
      {{ t('modals.componentStore.cancelImport') }}
    </button>
  </section>

  <section v-else-if="status === 'error'" class="flex gap-3 rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4" role="alert">
    <AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.importErrorTitle') }}</p>
      <p class="mt-1 text-sm leading-5 theme-muted">{{ t(`modals.componentStore.importErrors.${errorMessageKey}`) }}</p>
      <p v-if="displayedErrorPath" class="mt-1 break-all font-mono text-xs theme-faint">
        {{ t('modals.componentStore.errorField', { path: displayedErrorPath }) }}
      </p>
    </div>
    <button
      type="button"
      class="theme-subtle-button h-8 w-8 shrink-0 cursor-pointer rounded-full"
      :title="t('modals.componentStore.dismissError')"
      @click="emit('dismiss')"
    >
      <X class="mx-auto h-4 w-4" />
    </button>
  </section>
</template>
