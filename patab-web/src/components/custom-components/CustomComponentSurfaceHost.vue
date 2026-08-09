<script setup lang="ts">
/**
 * CustomComponentSurfaceHost —— 第三方 modal 与类型选择的 App 根层协调器。
 *
 * 它是 Runtime surface capability 唯一可访问的宿主 UI 边界，统一执行单 modal、关闭、
 * 焦点恢复和原生 variant 选择；sandbox 代码从不直接读 Pinia、BaseModal 或宿主 DOM。
 */
import { nextTick, onBeforeUnmount } from 'vue'

import CustomComponentSurfaceModal from './CustomComponentSurfaceModal.vue'
import CustomComponentVariantPickerModal from './CustomComponentVariantPickerModal.vue'
import { registerWidgetSurfaceHost, type WidgetUserSurface } from '@/custom-components/runtime/surfaceHost'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { useUiStore } from '@/stores/ui'
import type { WidgetBrokerSession } from '@/custom-components/runtime/capabilityBroker'

const ui = useUiStore()
const componentSafety = useCustomComponentSafetyStore()
let restoreTarget: HTMLElement | undefined

/** 记录当前焦点以便第三方 modal 关闭后还给原宿主控件，而不让 iframe 决定焦点去向。 */
function captureRestoreTarget(): void {
  const active = document.activeElement
  restoreTarget = active instanceof HTMLElement ? active : undefined
}

/** 关闭当前受控 modal 并在 Vue 完成卸载后恢复可用焦点，避免焦点落回 sandbox 或 body。 */
function closeActiveModal(): void {
  ui.closeModal()
  const target = restoreTarget
  restoreTarget = undefined
  void nextTick(() => {
    if (target?.isConnected) target.focus({ preventScroll: true })
  })
}

/** 判断某 session 是否正拥有当前 custom surface modal，防止一个实例关闭其他实例的界面。 */
function isOwnedSurface(session: WidgetBrokerSession): boolean {
  const modal = ui.modal
  return modal?.type === 'custom-component-surface'
    && modal.componentId === session.componentId
    && modal.instanceId === session.instanceId
}

/** 打开 Manifest 已通过 Broker 校验的 detail/settings modal；所有其他宿主 modal 已打开时一律拒绝嵌套。 */
function openSurface(session: WidgetBrokerSession, surface: WidgetUserSurface): boolean {
  if (componentSafety.globalSafeMode) return false
  if (ui.modal) return false
  captureRestoreTarget()
  ui.openModal({
    type: 'custom-component-surface',
    componentId: session.componentId,
    instanceId: session.instanceId,
    surface,
  })
  return true
}

/** 仅关闭当前实例自身的 modal，并返回是否实际完成关闭，供 Broker 产生稳定结果。 */
function closeSurface(session: WidgetBrokerSession): boolean {
  if (!isOwnedSurface(session)) return false
  closeActiveModal()
  return true
}

/** 打开与首次添加共用的原生 variant 选择器；全局单 modal 防止 widget 自行堆叠对话框。 */
function openVariantPicker(session: WidgetBrokerSession): boolean {
  if (ui.modal) return false
  captureRestoreTarget()
  ui.openModal({
    type: 'custom-component-variant-picker',
    componentId: session.componentId,
    instanceId: session.instanceId,
  })
  return true
}

const unregister = registerWidgetSurfaceHost({ openSurface, closeSurface, openVariantPicker })

onBeforeUnmount(() => {
  unregister()
})
</script>

<template>
  <CustomComponentSurfaceModal
    v-if="ui.modal?.type === 'custom-component-surface'"
    :component-id="ui.modal.componentId"
    :instance-id="ui.modal.instanceId"
    :surface="ui.modal.surface"
    @close="closeActiveModal"
  />
  <CustomComponentVariantPickerModal
    v-else-if="ui.modal?.type === 'custom-component-variant-picker'"
    :component-id="ui.modal.componentId"
    :instance-id="ui.modal.instanceId"
    :screen-id="ui.modal.screenId"
    @close="closeActiveModal"
  />
</template>
