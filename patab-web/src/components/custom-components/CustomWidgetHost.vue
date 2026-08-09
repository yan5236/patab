<script setup lang="ts">
/**
 * CustomWidgetHost —— 第三方组件的主屏宿主外壳。
 *
 * 宿主只读取已验证 Manifest 静态元数据，负责 1×1 图标、WidgetShell、菜单、焦点与 Runtime 生命周期；
 * 第三方内容仅在大尺寸时进入 sandbox 容器，永远不能获得宿主 DOM、拖拽或图块管理控制权。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Expand, Maximize2, PackageOpen, Settings2, SlidersHorizontal, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { WidgetTileSize } from '@patab/widget-sdk'

import type { WidgetBrokerSession } from '@/custom-components/runtime/capabilityBroker'
import { getCustomComponentRuntime, subscribeRuntimeAutoDisabled } from '@/custom-components/runtime/runtimeHost'
import type { SandboxRuntimeHandle } from '@/custom-components/runtime/sandboxRuntime'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { requestWidgetSurface, requestWidgetVariantPicker } from '@/custom-components/runtime/surfaceHost'
import CustomWidgetPlaceholder from '@/components/custom-components/CustomWidgetPlaceholder.vue'
import WidgetShell from '@/components/widgets/WidgetShell.vue'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import type { CustomWidgetTile, MenuItem } from '@/types'
import { tileSize } from '@/utils/grid'

const props = defineProps<{ tile: CustomWidgetTile }>()

const customComponents = useCustomComponentStore()
const componentSafety = useCustomComponentSafetyStore()
const launcher = useLauncherStore()
const ui = useUiStore()
const { locale, t } = useI18n()
const runtimeContainer = ref<HTMLElement | null>(null)
const iconUrl = ref<string>()
const runtimeFailed = ref(false)
let runtimeHandle: SandboxRuntimeHandle | undefined
let startAttempt = 0
let unregisterRuntimeAutoDisabled: (() => void) | undefined

/** 从 Store 的安全目录获取当前包 Manifest；组件本身不访问 IndexedDB 或 package HTML。 */
const catalogEntry = computed(() => customComponents.installedCatalog
  .find((entry) => entry.component.componentId === props.tile.componentId))
const manifest = computed(() => catalogEntry.value?.manifest)
const size = computed(() => tileSize(props.tile))
const isIcon = computed(() => size.value.w === 1 && size.value.h === 1)
const selectedVariant = computed(() => manifest.value?.variants?.find((item) => item.id === props.tile.variantId))
const supportedSizes = computed(() => selectedVariant.value?.supportedSizes ?? manifest.value?.sizes ?? [])
const supportsCurrentSize = computed(() => supportedSizes.value.some((item) => item.w === size.value.w && item.h === size.value.h))
const canRunSurface = computed(() => !!manifest.value
  && !componentSafety.globalSafeMode
  && !props.tile.disabled
  && !isIcon.value
  && supportsCurrentSize.value)
const componentTitle = computed(() => {
  const text = manifest.value?.name
  return text ? text[locale.value as 'zh-CN' | 'en-US'] ?? text.default : props.tile.componentId
})
const hasDetailSurface = computed(() => !!manifest.value?.surfaces.detail)
const hasSettingsSurface = computed(() => !!manifest.value?.surfaces.settings)
const hasVariantPicker = computed(() => (manifest.value?.variants?.length ?? 0) > 1)

/** 由已验证的静态元数据构造仅供宿主 UI 使用的身份；它不会创建 MessagePort 或伪造 Broker 会话。 */
function createHostIdentity(): WidgetBrokerSession | undefined {
  const componentVersion = catalogEntry.value?.component.activeVersion
  if (!componentVersion) return undefined
  return {
    componentId: props.tile.componentId,
    componentVersion,
    instanceId: props.tile.instanceId,
    sessionId: `host-ui:${props.tile.id}`,
  }
}

/** 请求宿主打开 detail/settings modal；只有 Manifest 已声明的入口会显示在此菜单。 */
function openSurface(surface: 'detail' | 'settings'): void {
  const identity = createHostIdentity()
  if (identity) requestWidgetSurface(identity, surface)
}

/** 打开与 Broker 共用的原生类型选择器，选项只来自静态 Manifest。 */
function openVariantPicker(): void {
  const identity = createHostIdentity()
  if (identity) requestWidgetVariantPicker(identity)
}

/** 为 WidgetShell 组装宿主菜单项，第三方脚本不能注入标题、操作或任意菜单函数。 */
const widgetMenuItems = computed<MenuItem[]>(() => [
  ...(hasDetailSurface.value ? [{ label: t('modals.componentStore.openDetail'), icon: Maximize2, action: () => openSurface('detail') }] : []),
  ...(hasSettingsSurface.value ? [{ label: t('modals.componentStore.openSettings'), icon: Settings2, action: () => openSurface('settings') }] : []),
  ...(hasVariantPicker.value ? [{ label: t('modals.componentStore.switchVariant'), icon: SlidersHorizontal, action: openVariantPicker }] : []),
])

/** 1×1 图标形态的右键菜单；与内置小组件一样由宿主提供尺寸、移除和可用静态操作。 */
function onIconMenu(event: MouseEvent): void {
  ui.openContextMenu(event, [
    ...widgetMenuItems.value,
    { label: t('screen.menu.resizeTile'), icon: Expand, action: () => ui.enterTileResize(props.tile.id) },
    { label: t('widgets.remove'), icon: Trash2, danger: true, action: () => launcher.removeCustomWidget(props.tile.id) },
  ])
}

/** 读取 Manifest 已校验的图标 Blob；替换图标或销毁宿主时立即回收 URL，避免静态预览泄漏。 */
async function refreshIcon(): Promise<void> {
  if (iconUrl.value) URL.revokeObjectURL(iconUrl.value)
  iconUrl.value = undefined
  const nextManifest = manifest.value
  if (!nextManifest) return
  iconUrl.value = await customComponents.createStaticAssetUrl(props.tile.componentId, nextManifest.assets.icon)
}

/** 销毁当前 sandbox handle；Runtime 内部会注销 Broker、通道与 storage 订阅并移除 iframe。 */
function stopRuntime(): void {
  runtimeHandle?.destroy()
  runtimeHandle = undefined
}

/**
 * 只在大尺寸、有效包、未停用且当前 variant 支持该尺寸时启动 widget surface。
 *
 * 1×1 永远不会调用 Runtime；异步启动完成时再次确认当前请求仍有效，避免尺寸切换后遗留隐藏 iframe。
 */
async function refreshRuntime(): Promise<void> {
  const attempt = ++startAttempt
  stopRuntime()
  runtimeFailed.value = false
  if (!canRunSurface.value) return
  const tracksInitialStart = componentSafety.registerInitialStart()
  await nextTick()
  if (attempt !== startAttempt || !runtimeContainer.value) {
    if (tracksInitialStart) componentSafety.settleInitialStart()
    return
  }
  try {
    const handle = await getCustomComponentRuntime().start({
      componentId: props.tile.componentId,
      instanceId: props.tile.instanceId,
      surface: 'widget',
      container: runtimeContainer.value,
      context: {
        size: { w: size.value.w, h: size.value.h } as WidgetTileSize,
        ...(props.tile.variantId ? { variantId: props.tile.variantId } : {}),
      },
    })
    if (attempt !== startAttempt) {
      handle.destroy()
      return
    }
    handle.frameElement.title = componentTitle.value
    handle.frameElement.className = 'h-full w-full border-0 bg-transparent'
    runtimeHandle = handle
  } catch {
    if (attempt === startAttempt) runtimeFailed.value = true
  } finally {
    if (tracksInitialStart) componentSafety.settleInitialStart()
  }
}

/** 首次加载目录后读取安全图标；图块不以单独 IndexedDB 查询判断包是否可用。 */
onMounted(() => {
  unregisterRuntimeAutoDisabled = subscribeRuntimeAutoDisabled((event) => {
    if (event.componentId !== props.tile.componentId || event.instanceId !== props.tile.instanceId) return
    launcher.setCustomWidgetDisabled(props.tile.id, true)
    runtimeFailed.value = true
  })
  void customComponents.ensureInstalledComponentsLoaded()
})

watch(() => manifest.value?.assets.icon, () => {
  void refreshIcon()
}, { immediate: true })

watch(
  () => [canRunSurface.value, props.tile.componentId, props.tile.instanceId] as const,
  () => { void refreshRuntime() },
  { immediate: true, flush: 'post' },
)

/** 语言切换时同步 iframe 的无障碍标题；内容仍由 sandbox 接收 localeChanged 自行本地化。 */
watch(componentTitle, (title) => {
  if (runtimeHandle) runtimeHandle.frameElement.title = title
})

onBeforeUnmount(() => {
  startAttempt += 1
  stopRuntime()
  unregisterRuntimeAutoDisabled?.()
  unregisterRuntimeAutoDisabled = undefined
  if (iconUrl.value) URL.revokeObjectURL(iconUrl.value)
})
</script>

<template>
  <CustomWidgetPlaceholder
    v-if="tile.disabled || !manifest"
    :tile="tile"
  />
  <div
    v-else-if="runtimeFailed || (!isIcon && !supportsCurrentSize)"
    class="theme-surface flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-3xl border p-4 text-center"
    data-nodrag
  >
    <PackageOpen class="h-7 w-7 text-amber-500" />
    <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.tileStartFailedTitle') }}</p>
    <p class="max-w-xs text-xs leading-5 theme-muted">{{ t('modals.componentStore.tileStartFailedText') }}</p>
  </div>
  <button
    v-else-if="isIcon"
    type="button"
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :title="componentTitle"
    @click="hasDetailSurface && openSurface('detail')"
    @contextmenu="onIconMenu"
  >
    <span class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-md shadow-black/20 backdrop-blur-xl transition-transform duration-150 group-hover:scale-105">
      <img v-if="iconUrl" :src="iconUrl" :alt="componentTitle" class="h-full w-full object-cover">
      <PackageOpen v-else class="h-8 w-8 text-white drop-shadow" />
    </span>
    <span class="max-w-full truncate px-1 text-xs text-white drop-shadow">{{ componentTitle }}</span>
  </button>
  <WidgetShell
    v-else
    :tile-id="tile.id"
    :title="componentTitle"
    :menu-items="widgetMenuItems"
  >
    <template #actions>
      <button
        v-if="hasDetailSurface"
        type="button"
        class="theme-subtle-button cursor-pointer rounded p-1 transition-colors"
        :title="t('widgets.expand')"
        @click="openSurface('detail')"
      >
        <Maximize2 class="h-3.5 w-3.5" />
      </button>
      <button
        v-if="hasSettingsSurface"
        type="button"
        class="theme-subtle-button cursor-pointer rounded p-1 transition-colors"
        :title="t('modals.componentStore.openSettings')"
        @click="openSurface('settings')"
      >
        <Settings2 class="h-3.5 w-3.5" />
      </button>
    </template>
    <div ref="runtimeContainer" class="h-full min-h-0 w-full" data-nodrag />
  </WidgetShell>
</template>
