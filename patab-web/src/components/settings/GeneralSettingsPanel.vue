<script setup lang="ts">
/**
 * GeneralSettingsPanel —— 通用设置面板
 * 只负责通用设置项的展示与双向绑定，不直接读取或保存 store。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocaleCode } from '@/i18n/language'
import AppDropdown from '@/components/common/AppDropdown.vue'

const { t } = useI18n()

const language = defineModel<LocaleCode>('language', { required: true })
const hour12 = defineModel<boolean>('hour12', { required: true })
const showDate = defineModel<boolean>('showDate', { required: true })
const compact = defineModel<boolean>('compact', { required: true })

const languageOptions = computed(() => [
  { label: t('settings.language.zhCN'), value: 'zh-CN' },
  { label: t('settings.language.enUS'), value: 'en-US' },
])
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-base font-semibold text-neutral-800">{{ t('settings.tabs.general') }}</h3>

    <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">{{ t('settings.general.language') }}</span>
      <AppDropdown v-model="language" class="w-40" :options="languageOptions" />
    </label>

    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">{{ t('settings.general.hour12') }}</span>
      <input v-model="hour12" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">{{ t('settings.general.showDate') }}</span>
      <input v-model="showDate" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">
        {{ t('settings.general.compact') }}
        <span class="mt-0.5 block text-xs text-neutral-500">{{ t('settings.general.compactHint') }}</span>
      </span>
      <input v-model="compact" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>
  </div>
</template>
