<script setup lang="ts">
/**
 * GeneralSettingsPanel —— 通用设置面板
 * 只负责通用设置项的展示与双向绑定，不直接读取或保存 store。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocaleCode } from '@/i18n/language'
import type { ThemeMode } from '@/types'
import AppDropdown from '@/components/common/AppDropdown.vue'

const { t } = useI18n()

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
  </div>
</template>
