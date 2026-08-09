<script setup lang="ts">
/**
 * CustomComponentSurfaceModal —— 第三方 detail/settings surface 的受控 BaseModal 外壳。
 *
 * 宿主决定标题、来源标识、尺寸、ESC、遮罩与焦点；组件只在容器内通过既有 Runtime 创建独立 sandbox iframe，
 * 关闭时销毁 iframe 和 Broker session，但不会触碰同实例已提交的私有存储。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PackageOpen, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { WidgetTileSize } from '@patab/widget-sdk'

import BaseModal from '@/components/common/BaseModal.vue'
import { getCustomComponentRuntime } from '@/custom-components/runtime/runtimeHost'
import type { SandboxRuntimeHandle } from '@/custom-components/runtime/sandboxRuntime'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { useLauncherStore } from '@/stores/launcher'
import type { CustomWidgetTile } from '@/types'
import { tileSize } from '@/utils/grid'

const props = defineProps<{
  componentId: string
  instanceId: string
  surface: 'detail' | 'settings'
}>()
const emit = defineEmits<{ close: [] }>()

const customComponents = useCustomComponentStore()
const componentSafety = useCustomComponentSafetyStore()
const launcher = useLauncherStore()
const { locale, t } = useI18n()
const runtimeContainer = ref<HTMLElement | null>(null)
const runtimeFailed = ref(false)
let runtimeHandle: SandboxRuntimeHandle | undefined
let startAttempt = 0

/** 在 launcher 轻量引用中定位当前实例；找不到或被停用时 modal 不得执行任何 surface。 */
const tile = computed<CustomWidgetTile | undefined>(() => {
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
const declaration = computed(() => manifest.value?.surfaces[props.surface])
const modalTitle = computed(() => {
  const title = declaration.value?.title
  return title ? title[locale.value as 'zh-CN' | 'en-US'] ?? title.default : t('modals.componentStore.tileStartFailedTitle')
})
const panelClass = computed(() => {
  const modalSize = declaration.value?.modalSize ?? 'medium'
  if (modalSize === 'small') return '!w-[420px] max-h-[86vh] overflow-hidden'
  if (modalSize === 'large') return '!w-[920px] max-h-[90vh] overflow-hidden'
  return '!w-[680px] max-h-[88vh] overflow-hidden'
})
const surfaceHeightClass = computed(() => {
  const modalSize = declaration.value?.modalSize ?? 'medium'
  return modalSize === 'small' ? 'h-[300px]' : modalSize === 'large' ? 'h-[640px]' : 'h-[460px]'
})

/** 销毁当前独立 modal surface；Runtime 的幂等句柄会同时注销端口、Broker、通道和 storage 订阅。 */
function stopRuntime(): void {
  runtimeHandle?.destroy()
  runtimeHandle = undefined
}

/**
 * 在可执行声明、未停用实例和 modal 容器同时存在时启动独立 surface。
 *
 * 运行时只读取活动版本的已验证 HTML；任何缺包、未声明入口或握手失败都会显示宿主错误而不是执行回退内容。
 */
async function startRuntime(): Promise<void> {
  const attempt = ++startAttempt
  stopRuntime()
  runtimeFailed.value = false
  const currentTile = tile.value
  if (!declaration.value || !currentTile || currentTile.disabled || componentSafety.globalSafeMode) {
    runtimeFailed.value = true
    return
  }
  await nextTick()
  if (attempt !== startAttempt || !runtimeContainer.value) return
  const size = tileSize(currentTile)
  try {
    const handle = await getCustomComponentRuntime().start({
      componentId: props.componentId,
      instanceId: props.instanceId,
      surface: props.surface,
      container: runtimeContainer.value,
      context: {
        size: { w: size.w, h: size.h } as WidgetTileSize,
        ...(currentTile.variantId ? { variantId: currentTile.variantId } : {}),
      },
    })
    if (attempt !== startAttempt) {
      handle.destroy()
      return
    }
    handle.frameElement.title = modalTitle.value
    handle.frameElement.className = 'h-full w-full border-0 bg-transparent'
    handle.frameElement.tabIndex = 0
    runtimeHandle = handle
    requestAnimationFrame(() => handle.frameElement.focus({ preventScroll: true }))
  } catch {
    if (attempt === startAttempt) runtimeFailed.value = true
  }
}

/** 关闭按钮、ESC 和遮罩都只通知根层协调器；根层负责收起全局 modal 并恢复原焦点。 */
function requestClose(): void {
  stopRuntime()
  emit('close')
}

onMounted(() => {
  void customComponents.ensureInstalledComponentsLoaded()
})

watch(
  () => [declaration.value?.entry, tile.value?.id, tile.value?.disabled, componentSafety.globalSafeMode] as const,
  () => { void startRuntime() },
  { immediate: true, flush: 'post' },
)

/** 语言切换时更新 modal iframe 的标题，确保聚焦中的第三方 surface 保持正确辅助技术名称。 */
watch(modalTitle, (title) => {
  if (runtimeHandle) runtimeHandle.frameElement.title = title
})

onBeforeUnmount(() => {
  startAttempt += 1
  stopRuntime()
})
</script>

<template>
  <BaseModal :title="modalTitle" :panel-class="panelClass" @close="requestClose">
    <div class="theme-surface mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs theme-muted">
      <PackageOpen class="h-4 w-4 shrink-0" />
      <span>{{ t('modals.componentStore.thirdPartySource') }}</span>
    </div>
    <div :class="[surfaceHeightClass, 'relative max-h-[62vh] min-h-0 w-full overflow-hidden rounded-2xl theme-surface']">
      <div v-if="runtimeFailed" class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <PackageOpen class="h-7 w-7 text-amber-500" />
        <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.tileStartFailedTitle') }}</p>
        <p class="text-xs leading-5 theme-muted">{{ t('modals.componentStore.tileStartFailedText') }}</p>
      </div>
      <div v-else ref="runtimeContainer" class="h-full w-full" data-nodrag />
    </div>
    <template #footer>
      <button
        type="button"
        class="theme-subtle-button flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition-colors"
        @click="requestClose"
      >
        <X class="h-4 w-4" />
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>
</template>
