<script setup lang="ts">
/**
 * CustomComponentFeedbackHost —— 自定义组件的宿主反馈层。
 *
 * 统一以 PaTab 原生 UI 显示第三方 toast、确认和外链来源，
 * 绝不让 sandbox surface 调用浏览器原生 alert、confirm 或直接操作宿主 DOM。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseModal from '@/components/common/BaseModal.vue'
import {
  registerWidgetHostFeedback,
  type WidgetHostConfirmRequest,
  type WidgetHostToastRequest,
} from '@/custom-components/capabilities/hostFeedback'

/** 单条 toast 的可销毁本地状态，内部 id 不会离开宿主 UI。 */
interface ToastEntry extends WidgetHostToastRequest {
  readonly id: number
}

/** 等待用户选择的确认请求与其 Promise 结算器。 */
interface PendingConfirm {
  readonly request: WidgetHostConfirmRequest
  readonly resolve: (confirmed: boolean) => void
}

const { t } = useI18n()
const toasts = ref<ToastEntry[]>([])
const activeConfirm = ref<PendingConfirm>()
const confirmQueue: PendingConfirm[] = []
let nextToastId = 1
let unregisterFeedback: (() => void) | undefined

/** 把下一条确认请求提升为可见弹窗；同一时刻只允许一个宿主确认以避免焦点和结果串扰。 */
function showNextConfirm(): void {
  if (activeConfirm.value || confirmQueue.length === 0) return
  activeConfirm.value = confirmQueue.shift()
}

/** 添加带第三方来源标签的短暂 toast，并在四秒后自动回收以保持移动端可用空间。 */
function showToast(request: WidgetHostToastRequest): void {
  const entry: ToastEntry = { ...request, id: nextToastId }
  nextToastId += 1
  toasts.value = [...toasts.value, entry]
  window.setTimeout(() => dismissToast(entry.id), 4_000)
}

/** 主动关闭单条 toast；超时和用户点击复用此函数，重复调用不会影响其它提示。 */
function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((entry) => entry.id !== id)
}

/** 将第三方确认请求排队，关闭、ESC 和遮罩点击均由 finishConfirm(false) 统一表达取消。 */
function requestConfirm(request: WidgetHostConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    confirmQueue.push({ request, resolve })
    showNextConfirm()
  })
}

/** 结算当前确认并继续下一条队列；宿主只返回布尔结果，不把点击事件或 DOM 句柄交给组件。 */
function finishConfirm(confirmed: boolean): void {
  const pending = activeConfirm.value
  if (!pending) return
  activeConfirm.value = undefined
  pending.resolve(confirmed)
  showNextConfirm()
}

/** 生成确认弹窗标题；外链场景固定由宿主文案生成，不能使用第三方伪造来源提示。 */
function getConfirmTitle(request: WidgetHostConfirmRequest): string {
  return request.kind === 'external'
    ? t('modals.componentFeedback.externalTitle')
    : (request.title ?? t('modals.componentFeedback.confirmTitle'))
}

/** 生成确认正文；外链仅展示宿主解析后的精确 HTTPS origin。 */
function getConfirmMessage(request: WidgetHostConfirmRequest): string {
  return request.kind === 'external'
    ? t('modals.componentFeedback.externalText', { origin: request.targetOrigin })
    : request.message
}

/** 返回宿主统一的确认按钮文字，第三方可提供受限标签但无法改变第三方来源标识。 */
function getConfirmActionLabel(request: WidgetHostConfirmRequest): string {
  return request.kind === 'external'
    ? t('modals.componentFeedback.openExternal')
    : (request.confirmLabel ?? t('modals.componentFeedback.confirm'))
}

/** 返回宿主统一的取消按钮文字，关闭语义始终等同于取消。 */
function getCancelActionLabel(request: WidgetHostConfirmRequest): string {
  return request.kind === 'external'
    ? t('modals.componentFeedback.cancel')
    : (request.cancelLabel ?? t('modals.componentFeedback.cancel'))
}

/** 组件挂载后注册唯一反馈入口，Runtime 调用时才会取得该可见宿主 UI。 */
onMounted(() => {
  unregisterFeedback = registerWidgetHostFeedback({ toast: showToast, confirm: requestConfirm })
})

/** 组件卸载时取消全部未完成确认并注销入口，避免遗留 Promise 或向已销毁根页面写状态。 */
onBeforeUnmount(() => {
  unregisterFeedback?.()
  unregisterFeedback = undefined
  activeConfirm.value?.resolve(false)
  activeConfirm.value = undefined
  for (const pending of confirmQueue.splice(0)) pending.resolve(false)
  toasts.value = []
})
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-96">
      <TransitionGroup name="component-feedback">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          type="button"
          class="theme-glass-panel pointer-events-auto w-full rounded-2xl border px-4 py-3 text-left shadow-lg"
          @click="dismissToast(toast.id)"
        >
          <span class="theme-heading block text-sm font-semibold">{{ t('modals.componentFeedback.thirdParty') }}</span>
          <span class="theme-text-secondary mt-1 block break-words text-sm">{{ toast.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>

  <BaseModal
    v-if="activeConfirm"
    :title="getConfirmTitle(activeConfirm.request)"
    panel-class="max-h-[calc(100dvh-2rem)] overflow-y-auto"
    @close="finishConfirm(false)"
  >
    <p class="theme-text-secondary break-words text-sm leading-6">{{ getConfirmMessage(activeConfirm.request) }}</p>
    <p class="theme-text-secondary mt-4 text-xs">{{ t('modals.componentFeedback.source', { componentId: activeConfirm.request.componentId }) }}</p>
    <template #footer>
      <button type="button" class="theme-subtle-button cursor-pointer rounded-xl px-4 py-2 text-sm transition-colors" @click="finishConfirm(false)">
        {{ getCancelActionLabel(activeConfirm.request) }}
      </button>
      <button type="button" class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600" @click="finishConfirm(true)">
        {{ getConfirmActionLabel(activeConfirm.request) }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.component-feedback-enter-active,
.component-feedback-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.component-feedback-enter-from,
.component-feedback-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
