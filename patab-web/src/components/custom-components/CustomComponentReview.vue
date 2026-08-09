<script setup lang="ts">
/**
 * CustomComponentReview —— 第三方组件安装前的纯静态审查页。
 * 页面只展示经文件集校验的文本与 Blob 图片，绝不创建 sandbox iframe、插入 HTML 或执行 package surface。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LocalizedText, WidgetNetworkDeclaration, WidgetPermission } from '@patab/widget-sdk'
import { ArrowLeft, BadgeCheck, PackageOpen, ShieldAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import type { CustomComponentPackageReview } from '@/stores/customComponents'
import type { ComponentUpdateGrantDiff } from '@/custom-components/updates/componentUpdateGrantPolicy'
import CustomComponentPermissionConfirmation from './CustomComponentPermissionConfirmation.vue'

const props = defineProps<{
  review: CustomComponentPackageReview
  permissionGrants: Partial<Record<WidgetPermission, boolean>>
  networkGrants: Readonly<Record<string, boolean>>
  canInstall: boolean
  installing: boolean
  updateDiff?: ComponentUpdateGrantDiff
  updatePending: boolean
}>()
const emit = defineEmits<{
  back: []
  install: []
  'permission-change': [permission: WidgetPermission, granted: boolean]
  'network-change': [network: WidgetNetworkDeclaration, granted: boolean]
}>()
const { locale, t } = useI18n()
const iconUrl = ref<string>()
const screenshotUrls = ref<readonly string[]>([])
const createdUrls = new Set<string>()

/** 按当前 PaTab 语言读取 Manifest 文本，缺失本地化时严格回退到开发者提供的 default。 */
function localize(text: LocalizedText): string {
  return text[locale.value as 'zh-CN' | 'en-US'] ?? text.default
}

/** 释放本页创建的 Blob URL，避免用户反复审查不同 ZIP 后保留静态图片内存。 */
function revokeStaticUrls(): void {
  for (const url of createdUrls) URL.revokeObjectURL(url)
  createdUrls.clear()
  iconUrl.value = undefined
  screenshotUrls.value = []
}

/** 仅从已经验证的静态 assets 创建展示 URL；surface HTML 即使存在于审查包中也永不转为可渲染资源。 */
function refreshStaticUrls(review: CustomComponentPackageReview): void {
  revokeStaticUrls()
  const blobsByPath = new Map(
    review.files
      .filter((file): file is { readonly path: string; readonly content: Blob } => file.content instanceof Blob)
      .map((file) => [file.path, file.content]),
  )
  const createUrl = (path: string): string | undefined => {
    const blob = blobsByPath.get(path)
    if (!blob) return undefined
    const url = URL.createObjectURL(blob)
    createdUrls.add(url)
    return url
  }
  iconUrl.value = createUrl(review.manifest.assets.icon)
  screenshotUrls.value = (review.manifest.assets.screenshots ?? [])
    .map(createUrl)
    .filter((url): url is string => url !== undefined)
}

/** 将签名验证状态映射为明确事实标签，避免使用会误导用户的笼统“安全”表述。 */
function signatureKey(status: CustomComponentPackageReview['signatureVerification']['status']): string {
  return status.replace(/-/g, '_')
}

const isBlockedBySignature = computed(() => {
  const status = props.review.signatureVerification.status
  return status === 'invalid' || status === 'publisher-key-changed'
})
const displayedSizes = computed(() => props.review.manifest.sizes.map((size) => `${size.w}×${size.h}`).join(' · '))
const isUpdateReview = computed(() => props.updateDiff !== undefined)

watch(() => props.review, refreshStaticUrls, { immediate: true })
onBeforeUnmount(revokeStaticUrls)
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="theme-subtle-button shrink-0 cursor-pointer rounded-full p-2 transition-colors"
        :title="t('modals.componentStore.back')"
        @click="emit('back')"
      >
        <ArrowLeft class="h-5 w-5" />
      </button>
      <span class="theme-card-icon-bg flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl theme-text shadow-sm">
        <img v-if="iconUrl" :src="iconUrl" :alt="localize(review.manifest.name)" class="h-full w-full object-cover">
        <PackageOpen v-else class="h-6 w-6" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-semibold theme-heading">{{ localize(review.manifest.name) }}</p>
        <p class="mt-0.5 text-xs theme-muted">{{ t('modals.componentStore.versionLabel') }}：{{ review.manifest.version }}</p>
      </div>
    </div>

    <section class="flex gap-3 rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4" role="alert">
      <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.thirdPartyWarningTitle') }}</p>
        <p class="mt-1 text-sm leading-5 theme-muted">{{ t('modals.componentStore.thirdPartyWarningText') }}</p>
      </div>
    </section>

    <section v-if="isUpdateReview" class="rounded-2xl border border-violet-400/50 bg-violet-500/10 p-4 text-sm">
      <p class="font-semibold theme-heading">{{ t('modals.componentStore.updateReviewTitle') }}</p>
      <p class="mt-1 leading-5 theme-muted">{{ t('modals.componentStore.updateReviewText') }}</p>
    </section>

    <section class="theme-surface grid gap-3 rounded-2xl border p-4 text-sm sm:grid-cols-2">
      <div>
        <p class="text-xs theme-faint">{{ t('modals.componentStore.developerLabel') }}</p>
        <p class="mt-1 break-words theme-text">{{ localize(review.manifest.developer) }}</p>
      </div>
      <div>
        <p class="text-xs theme-faint">{{ t('modals.componentStore.signatureLabel') }}</p>
        <p class="mt-1 flex items-center gap-1.5 theme-text">
          <BadgeCheck class="h-4 w-4" :class="review.signatureVerification.status === 'valid' ? 'text-emerald-500' : 'text-amber-500'" />
          {{ t(`modals.componentStore.signature.${signatureKey(review.signatureVerification.status)}`) }}
        </p>
      </div>
      <div class="sm:col-span-2">
        <p class="text-xs theme-faint">{{ t('modals.componentStore.supportedSizes') }}</p>
        <p class="mt-1 theme-text">{{ displayedSizes }}</p>
      </div>
    </section>

    <section>
      <h3 class="mb-1.5 text-sm font-semibold theme-heading">{{ t('modals.componentStore.about') }}</h3>
      <p class="text-sm leading-6 theme-muted">{{ localize(review.manifest.description) }}</p>
    </section>

    <section v-if="review.manifest.variants?.length" class="space-y-2">
      <h3 class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.variantsTitle') }}</h3>
      <div class="grid gap-2 sm:grid-cols-2">
        <div v-for="variant in review.manifest.variants" :key="variant.id" class="theme-surface rounded-2xl border p-3">
          <p class="text-sm font-medium theme-heading">{{ localize(variant.name) }}</p>
          <p class="mt-1 text-xs leading-5 theme-muted">{{ localize(variant.description) }}</p>
          <p class="mt-2 text-[11px] theme-faint">{{ variant.supportedSizes.map((size) => `${size.w}×${size.h}`).join(' · ') }}</p>
        </div>
      </div>
    </section>

    <section v-if="screenshotUrls.length" class="space-y-2">
      <h3 class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.gallery') }}</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <img
          v-for="(url, index) in screenshotUrls"
          :key="url"
          :src="url"
          :alt="t('modals.componentStore.screenshotAlt', { index: index + 1 })"
          class="theme-card-preview aspect-video w-full rounded-2xl object-cover"
        >
      </div>
    </section>

    <CustomComponentPermissionConfirmation
      :required-permissions="review.manifest.permissions?.required ?? []"
      :optional-permissions="review.manifest.permissions?.optional ?? []"
      :networks="review.manifest.network ?? []"
      :permission-grants="permissionGrants"
      :network-grants="networkGrants"
      :new-permissions="updateDiff?.newPermissions"
      :new-network-origins="updateDiff?.newNetworkOrigins"
      @permission-change="(permission, granted) => emit('permission-change', permission, granted)"
      @network-change="(network, granted) => emit('network-change', network, granted)"
    />

    <p v-if="!canInstall && !isBlockedBySignature" class="text-xs leading-5 text-amber-700">
      {{ t('modals.componentStore.installRequirements') }}
    </p>
    <p v-if="isBlockedBySignature" class="text-xs leading-5 text-red-600">
      {{ t('modals.componentStore.signatureBlocked') }}
    </p>
    <button
      type="button"
      class="flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="!canInstall || installing || isBlockedBySignature"
      @click="emit('install')"
    >
      {{ installing
        ? t('modals.componentStore.installingTitle')
        : updatePending
          ? t('modals.componentStore.confirmUpdate')
          : isUpdateReview
            ? t('modals.componentStore.updateAndKeep')
            : t('modals.componentStore.installAndAdd') }}
    </button>
  </div>
</template>
