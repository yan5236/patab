<script setup lang="ts">
/**
 * CustomComponentVariantPickerModal —— 第三方组件的宿主原生类型选择器。
 *
 * 首次添加和既有实例切换共用这一界面；名称、简介、图标和尺寸限制均来自已验证 Manifest，
 * 不加载 widget HTML，也不允许第三方代码绘制或控制选择项。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, PackageOpen } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import BaseModal from '@/components/common/BaseModal.vue'
import { getCustomComponentRuntime } from '@/custom-components/runtime/runtimeHost'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useLauncherStore } from '@/stores/launcher'
import type { CustomWidgetTile } from '@/types'
import { tileSize } from '@/utils/grid'

const props = defineProps<{
  componentId: string
  instanceId?: string
  screenId?: string
}>()
const emit = defineEmits<{ close: [] }>()

const customComponents = useCustomComponentStore()
const launcher = useLauncherStore()
const { locale, t } = useI18n()
const iconUrls = ref<Record<string, string>>({})

/** 从 launcher 轻量引用读取当前实例，首次添加模式没有 instanceId 且不创建临时实例。 */
const tile = computed<CustomWidgetTile | undefined>(() => {
  if (!props.instanceId) return undefined
  for (const screen of launcher.screens) {
    const found = screen.tiles.find((item) => item.type === 'widget'
      && item.widgetType === 'custom'
      && item.componentId === props.componentId
      && item.instanceId === props.instanceId)
    if (found?.type === 'widget' && found.widgetType === 'custom') return found
  }
  return undefined
})
const manifest = computed(() => customComponents.installedCatalog
  .find((entry) => entry.component.componentId === props.componentId)?.manifest)
const currentSize = computed(() => tile.value ? tileSize(tile.value) : manifest.value?.defaultSize)
const currentVariantId = computed(() => tile.value?.variantId ?? manifest.value?.defaultVariant)

/** 以当前 PaTab 语言选择已验证 Manifest 文本，语言缺失时严格回退 default。 */
function localize(text: { readonly default: string; readonly 'zh-CN'?: string; readonly 'en-US'?: string }): string {
  return text[locale.value as 'zh-CN' | 'en-US'] ?? text.default
}

/** 判断当前图块尺寸是否是候选 variant 静态支持的尺寸，阻止切换后产生非法持久化引用。 */
function supportsCurrentSize(variant: { readonly supportedSizes: readonly { readonly w: number; readonly h: number }[] }): boolean {
  const size = currentSize.value
  return !!size && variant.supportedSizes.some((item) => item.w === size.w && item.h === size.h)
}

/** 回收上一批 static icon URL，避免用户切换语言或目录刷新后留下 Blob URL。 */
function revokeIconUrls(): void {
  for (const url of Object.values(iconUrls.value)) URL.revokeObjectURL(url)
  iconUrls.value = {}
}

/** 读取已验证 variants 的静态图标，不读取 package surface 或插入任意第三方 HTML。 */
async function refreshIcons(): Promise<void> {
  revokeIconUrls()
  const nextManifest = manifest.value
  if (!nextManifest) return
  const resolved = await Promise.all((nextManifest.variants ?? []).map(async (variant) => [
    variant.id,
    await customComponents.createStaticAssetUrl(props.componentId, variant.icon),
  ] as const))
  if (manifest.value !== nextManifest) {
    for (const [, url] of resolved) if (url) URL.revokeObjectURL(url)
    return
  }
  iconUrls.value = Object.fromEntries(resolved.filter((entry): entry is readonly [string, string] => !!entry[1]))
}

/**
 * 提交用户选中的静态 variant。
 *
 * 首次添加才创建新 launcher 引用；既有实例只改 variantId 并通过页面共享 Runtime 广播 variantChanged，
 * 不重建 widget/modal session，也不会改动私有实例存储。
 */
function chooseVariant(variantId: string): void {
  const nextManifest = manifest.value
  const variant = nextManifest?.variants?.find((item) => item.id === variantId)
  if (!nextManifest || !variant || !supportsCurrentSize(variant)) return

  if (tile.value) {
    const previousVariantId = tile.value.variantId
    if (!launcher.updateCustomWidgetVariant(tile.value.id, variantId)) return
    if (previousVariantId !== variantId) {
      getCustomComponentRuntime().publishInstanceLifecycle(props.componentId, tile.value.instanceId, {
        event: 'variantChanged',
        payload: {
          ...(previousVariantId ? { previousVariantId } : {}),
          variantId,
        },
      })
    }
  } else if (props.screenId) {
    launcher.addCustomWidget(props.screenId, {
      componentId: props.componentId,
      variantId,
      size: { w: nextManifest.defaultSize.w, h: nextManifest.defaultSize.h },
    })
  } else {
    return
  }
  emit('close')
}

onMounted(() => {
  void customComponents.ensureInstalledComponentsLoaded()
})

watch(() => manifest.value?.variants, () => {
  void refreshIcons()
}, { immediate: true })

onBeforeUnmount(revokeIconUrls)
</script>

<template>
  <BaseModal :title="t('modals.componentStore.variantPickerTitle')" @close="emit('close')">
    <div v-if="manifest?.variants?.length" class="space-y-2">
      <button
        v-for="variant in manifest.variants"
        :key="variant.id"
        type="button"
        class="theme-surface-hover flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors"
        :class="supportsCurrentSize(variant) ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'"
        :disabled="!supportsCurrentSize(variant)"
        @click="chooseVariant(variant.id)"
      >
        <span class="theme-card-icon-bg flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm">
          <img v-if="iconUrls[variant.id]" :src="iconUrls[variant.id]" :alt="localize(variant.name)" class="h-full w-full object-cover">
          <PackageOpen v-else class="h-5 w-5 theme-text" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="theme-text flex items-center gap-1.5 text-sm font-semibold">
            {{ localize(variant.name) }}
            <Check v-if="currentVariantId === variant.id" class="h-4 w-4 text-sky-500" :aria-label="t('modals.componentStore.variantCurrent')" />
          </span>
          <span class="theme-muted mt-1 block text-xs leading-5">{{ localize(variant.description) }}</span>
          <span v-if="!supportsCurrentSize(variant)" class="mt-1 block text-[11px] text-amber-600">
            {{ t('modals.componentStore.variantSizeUnsupported') }}
          </span>
        </span>
      </button>
    </div>
    <div v-else class="theme-surface rounded-2xl p-5 text-center text-sm theme-muted">
      {{ t('modals.componentStore.tileUnavailableText') }}
    </div>
  </BaseModal>
</template>
