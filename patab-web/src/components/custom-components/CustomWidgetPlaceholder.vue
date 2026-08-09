<script setup lang="ts">
/**
 * CustomWidgetPlaceholder —— 缺包或停用的自定义组件图块兜底。
 * 该组件永不读取 package surface、更不创建 iframe；它只通过 Store 目录判断可用性并提供宿主级恢复操作。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { CircleAlert, PackageX, RotateCcw, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import type { CustomWidgetTile } from '@/types'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ tile: CustomWidgetTile }>()
const customComponents = useCustomComponentStore()
const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()
const showReason = ref(false)
const runtimeHealth = ref<Awaited<ReturnType<typeof customComponents.getInstanceRuntimeHealth>>>()

/** 判断轻量 launcher 引用是否仍有已安装包目录；未加载完成前保持中性检查状态，避免误报缺包。 */
const packageMissing = computed(() => customComponents.installedComponentsLoaded
  && !customComponents.installedComponents.some((component) => component.componentId === props.tile.componentId))
const isDisabled = computed(() => props.tile.disabled === true)
const disabledReason = computed(() => {
  const reason = runtimeHealth.value?.disabledReason
  if (reason === 'handshake-timeout') return t('modals.componentStore.disabledReasonHandshakeTimeout')
  if (reason === 'handshake-failed') return t('modals.componentStore.disabledReasonHandshakeFailed')
  if (reason === 'protocol-flood') return t('modals.componentStore.disabledReasonProtocolFlood')
  if (reason === 'startup-incomplete') return t('modals.componentStore.disabledReasonStartupIncomplete')
  return t('modals.componentStore.disabledReasonManual')
})

/** 打开组件商店供用户重新选择本地 ZIP，避免图块绕过 Store 直接读取任意文件或数据库。 */
function reopenComponentStore(): void {
  ui.openModal({ type: 'component-store' })
}

/** 用户明确重新启用时先清除健康摘要，再恢复 launcher 引用，避免旧自动停用状态直接触发重试。 */
async function reenableInstance(): Promise<void> {
  if (!await customComponents.resetInstanceRuntimeHealth(props.tile.componentId, props.tile.instanceId)) return
  launcher.setCustomWidgetDisabled(props.tile.id, false)
  showReason.value = false
}

/** 仅从当前主屏移除不可用引用，保持“移除单实例”与“卸载组件包”两条语义分离。 */
function removeInstance(): void {
  launcher.removeCustomWidget(props.tile.id)
}

onMounted(() => {
  void customComponents.ensureInstalledComponentsLoaded()
  void refreshRuntimeHealth()
})

/** 加载脱敏健康摘要；读取失败只显示通用恢复说明，不能影响主屏占位或删除操作。 */
async function refreshRuntimeHealth(): Promise<void> {
  runtimeHealth.value = await customComponents.getInstanceRuntimeHealth(props.tile.componentId, props.tile.instanceId)
}

/** 图块被运行时自动停用或切换实例时刷新原因，避免复用组件展示上一实例的健康摘要。 */
watch(
  () => [props.tile.componentId, props.tile.instanceId, props.tile.disabled] as const,
  () => { void refreshRuntimeHealth() },
)
</script>

<template>
  <div class="theme-surface flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-3xl border p-4 text-center" data-nodrag>
    <CircleAlert v-if="isDisabled" class="h-7 w-7 text-amber-500" />
    <PackageX v-else class="h-7 w-7 text-amber-500" />
    <p class="text-sm font-semibold theme-heading">
      {{ isDisabled ? t('modals.componentStore.tileDisabledTitle') : packageMissing ? t('modals.componentStore.tileUnavailableTitle') : t('modals.componentStore.tileCheckingTitle') }}
    </p>
    <p class="max-w-xs text-xs leading-5 theme-muted">
      {{ isDisabled ? t('modals.componentStore.tileDisabledText') : packageMissing ? t('modals.componentStore.tileUnavailableText') : t('modals.componentStore.tileCheckingText') }}
    </p>
    <p v-if="isDisabled && showReason" class="max-w-xs text-xs leading-5 text-amber-700">
      {{ t('modals.componentStore.tileDisabledReason', { reason: disabledReason }) }}
    </p>
    <div v-if="isDisabled || packageMissing" class="flex flex-wrap justify-center gap-2">
      <button
        v-if="packageMissing"
        type="button"
        class="theme-subtle-button flex h-8 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-xs"
        @click="reopenComponentStore"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        {{ t('modals.componentStore.reimport') }}
      </button>
      <button
        v-if="isDisabled"
        type="button"
        class="theme-subtle-button h-8 cursor-pointer rounded-xl px-2.5 text-xs"
        @click="showReason = !showReason"
      >
        {{ t('modals.componentStore.viewReason') }}
      </button>
      <button
        v-if="isDisabled"
        type="button"
        class="theme-subtle-button flex h-8 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-xs"
        @click="reenableInstance"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        {{ t('modals.componentStore.reenable') }}
      </button>
      <button
        type="button"
        class="flex h-8 cursor-pointer items-center gap-1 rounded-xl bg-red-500/15 px-2.5 text-xs text-red-600"
        @click="removeInstance"
      >
        <Trash2 class="h-3.5 w-3.5" />
        {{ t('modals.componentStore.removeInstance') }}
      </button>
    </div>
  </div>
</template>
