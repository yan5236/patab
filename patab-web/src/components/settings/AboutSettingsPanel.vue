<script setup lang="ts">
/**
 * AboutSettingsPanel —— 关于信息面板
 * 展示 PaTab 的静态说明，不参与设置草稿与持久化。
 */
import { ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// TODO: 产品上线前请把以下占位链接替换为实际的线上地址
const ABOUT_LINKS = [
  { key: 'settings.about.privacy', href: '' },
  { key: 'settings.about.terms', href: '' },
  { key: 'settings.about.changelog', href: '' },
] as const

function handleLinkClick(href: string) {
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-base font-semibold text-neutral-800">PaTab</h3>
    <div class="rounded-xl bg-white/45 p-4 text-sm leading-6 text-neutral-700">
      <p>{{ t('settings.about.description1') }}</p>
      <p>{{ t('settings.about.description2') }}</p>
    </div>

    <div class="space-y-2">
      <a
        v-for="link in ABOUT_LINKS"
        :key="link.key"
        :href="link.href"
        class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3 text-sm text-neutral-700 transition-colors hover:bg-white/65"
        :class="{ 'pointer-events-none opacity-60': !link.href }"
        @click.prevent="handleLinkClick(link.href)"
      >
        <span>{{ t(link.key) }}</span>
        <ChevronRight class="h-4 w-4 text-neutral-400" />
      </a>
    </div>
  </div>
</template>
