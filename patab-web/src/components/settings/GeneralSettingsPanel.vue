<script setup lang="ts">
/**
 * GeneralSettingsPanel —— 通用设置面板
 * 通用设置项通过双向绑定交给父级即时同步；
 * 导入 / 导出配置不属于即时设置项，直接读写持久化存储并在导入后刷新页面。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocaleCode } from '@/i18n/language'
import type { LauncherState, ThemeMode } from '@/types'
import AppDropdown from '@/components/common/AppDropdown.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { useLauncherStore } from '@/stores/launcher'
import { getLauncherStorageKey } from '@/stores/launcherStorageEnvironment'
import {
  buildConfigBackupFilename,
  parseLauncherStateBackup,
  serializeLauncherState,
} from '@/utils/configTransfer'

const { t } = useI18n()
const launcher = useLauncherStore()

const language = defineModel<LocaleCode>('language', { required: true })
const themeMode = defineModel<ThemeMode>('themeMode', { required: true })
const hour12 = defineModel<boolean>('hour12', { required: true })
const showDate = defineModel<boolean>('showDate', { required: true })
const compact = defineModel<boolean>('compact', { required: true })

const languageOptions = computed(() => [
  { label: t('settings.language.zhCN'), value: 'zh-CN' },
  { label: t('settings.language.enUS'), value: 'en-US' },
])

const themeOptions = computed(() => [
  { label: t('settings.theme.system'), value: 'system' },
  { label: t('settings.theme.light'), value: 'light' },
  { label: t('settings.theme.dark'), value: 'dark' },
])

/* ---------- 导入 / 导出配置 ---------- */

const importFileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
/** 已通过校验、等待用户确认覆盖的备份状态 */
const pendingImport = ref<LauncherState | null>(null)

/** 把当前持久化状态序列化为 JSON 文件并触发下载 */
function exportConfig() {
  const state: LauncherState = {
    version: 1,
    screens: launcher.screens,
    dock: launcher.dock,
    todos: launcher.todos,
    todoLists: launcher.todoLists,
    settings: launcher.settings,
  }
  const url = URL.createObjectURL(new Blob([serializeLauncherState(state)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = buildConfigBackupFilename()
  link.click()
  URL.revokeObjectURL(url)
}

/** 读取所选备份文件，校验通过后进入覆盖确认 */
function onImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const parsed = typeof reader.result === 'string' ? parseLauncherStateBackup(reader.result) : null
    if (!parsed) {
      importError.value = t('settings.backup.importInvalid')
      return
    }
    importError.value = ''
    pendingImport.value = parsed
  }
  reader.onerror = () => {
    importError.value = t('settings.backup.importInvalid')
  }
  reader.readAsText(file)
}

/** 确认覆盖：写入持久化存储并刷新页面，由既有清洗逻辑完成恢复 */
function confirmImport() {
  if (!pendingImport.value) return
  localStorage.setItem(getLauncherStorageKey(), JSON.stringify(pendingImport.value))
  window.location.reload()
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="theme-heading text-base font-semibold">{{ t('settings.tabs.general') }}</h3>

    <label class="theme-setting-row flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3">
      <span class="theme-text text-sm">{{ t('settings.general.language') }}</span>
      <AppDropdown v-model="language" class="w-40" :options="languageOptions" />
    </label>

    <label class="theme-setting-row flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3">
      <span class="theme-text text-sm">{{ t('settings.general.theme') }}</span>
      <AppDropdown v-model="themeMode" class="w-40" :options="themeOptions" />
    </label>

    <label class="theme-setting-row flex cursor-pointer items-center justify-between rounded-xl px-3 py-3">
      <span class="theme-text text-sm">{{ t('settings.general.hour12') }}</span>
      <input v-model="hour12" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="theme-setting-row flex cursor-pointer items-center justify-between rounded-xl px-3 py-3">
      <span class="theme-text text-sm">{{ t('settings.general.showDate') }}</span>
      <input v-model="showDate" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="theme-setting-row flex cursor-pointer items-center justify-between rounded-xl px-3 py-3">
      <span class="theme-text text-sm">
        {{ t('settings.general.compact') }}
        <span class="theme-muted mt-0.5 block text-xs">{{ t('settings.general.compactHint') }}</span>
      </span>
      <input v-model="compact" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <div class="theme-setting-row rounded-xl px-3 py-3">
      <div class="flex items-center justify-between gap-3">
        <span class="theme-text text-sm">
          {{ t('settings.backup.title') }}
          <span class="theme-muted mt-0.5 block text-xs">{{ t('settings.backup.hint') }}</span>
        </span>
        <div class="flex shrink-0 gap-2">
          <button
            class="theme-subtle-button cursor-pointer rounded-xl px-3 py-1.5 text-sm transition-colors"
            type="button"
            @click="exportConfig"
          >
            {{ t('settings.backup.export') }}
          </button>
          <button
            class="theme-subtle-button cursor-pointer rounded-xl px-3 py-1.5 text-sm transition-colors"
            type="button"
            @click="importFileInput?.click()"
          >
            {{ t('settings.backup.import') }}
          </button>
        </div>
      </div>
      <p v-if="importError" class="mt-2 text-xs text-red-500">{{ importError }}</p>
    </div>
    <input ref="importFileInput" class="hidden" type="file" accept="application/json,.json" @change="onImportFileSelected">

    <BaseModal v-if="pendingImport" :title="t('settings.backup.confirmTitle')" @close="pendingImport = null">
      <p class="theme-muted text-sm leading-6">{{ t('settings.backup.confirmText') }}</p>
      <template #footer>
        <button
          class="theme-subtle-button h-10 cursor-pointer rounded-xl px-4 text-sm"
          type="button"
          @click="pendingImport = null"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-medium text-white"
          type="button"
          @click="confirmImport"
        >
          {{ t('settings.backup.confirmImport') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
