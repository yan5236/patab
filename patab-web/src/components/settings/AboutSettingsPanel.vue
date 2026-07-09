<script setup lang="ts">
/**
 * AboutSettingsPanel —— 关于信息面板
 * 展示 PaTab 的静态说明，不参与设置草稿与持久化。
 */
import { ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const ABOUT_LINKS = [
  { key: 'settings.about.privacy', href: 'https://patab-introduction.nanhaiblog.top/privacy' },
  { key: 'settings.about.terms', href: 'https://patab-introduction.nanhaiblog.top/user-agreement' },
  { key: 'settings.about.changelog', href: '' },
] as const

function handleLinkClick(href: string) {
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="theme-heading text-base font-semibold">PaTab</h3>
    <div class="theme-surface rounded-xl p-4 text-sm leading-6">
      <p>{{ t('settings.about.description1') }}</p>
      <p>{{ t('settings.about.description2') }}</p>
    </div>

    <div class="space-y-2">
      <a
        v-for="link in ABOUT_LINKS"
        :key="link.key"
        :href="link.href"
        class="theme-surface flex cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-sm transition-colors"
        :class="{ 'pointer-events-none opacity-60': !link.href }"
        @click.prevent="handleLinkClick(link.href)"
      >
        <span>{{ t(link.key) }}</span>
        <ChevronRight class="theme-faint h-4 w-4" />
      </a>
    </div>
  </div>
</template>
