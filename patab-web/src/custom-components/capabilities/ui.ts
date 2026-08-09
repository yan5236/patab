import type { WidgetApiError, WidgetConfirmParams, WidgetToastParams } from '@patab/widget-sdk'

import type { WidgetHostFeedback } from './hostFeedback'
import {
  WidgetBrokerMethodError,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
} from '@/custom-components/runtime/capabilityBroker'

/** toast 文本上限，避免第三方占用移动端视觉区域或借由超长字符串放大 RPC 响应。 */
export const WIDGET_TOAST_MESSAGE_MAX_LENGTH = 500

/** 确认标题、正文与按钮标签上限，宿主固定追加第三方来源标识。 */
export const WIDGET_CONFIRM_TITLE_MAX_LENGTH = 120
export const WIDGET_CONFIRM_MESSAGE_MAX_LENGTH = 1_000
export const WIDGET_CONFIRM_LABEL_MAX_LENGTH = 40

/** 判断未知值是否是安全普通记录，阻止访问器和原型字段穿透参数 Schema。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 判断文字是否非空且不超过公开能力允许的字符上限。 */
function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

/** 创建不包含第三方原始载荷的稳定参数失败。 */
function invalidUiParams(message: string): WidgetApiError {
  return { code: 'INVALID_ARGUMENT', message, path: 'params' }
}

/** 解析 ui.toast 输入，只允许固定 message 字段。 */
function parseToastParams(value: unknown): WidgetToastParams | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !isBoundedText(value.message, WIDGET_TOAST_MESSAGE_MAX_LENGTH)) {
    return undefined
  }
  return { message: value.message.trim() }
}

/** 解析 ui.confirm 输入，并拒绝额外字段或空白按钮名称。 */
function parseConfirmParams(value: unknown): WidgetConfirmParams | undefined {
  if (!isPlainRecord(value)) return undefined
  const allowed = new Set(['title', 'message', 'confirmLabel', 'cancelLabel'])
  if (!Object.keys(value).every((key) => allowed.has(key)) || !isBoundedText(value.message, WIDGET_CONFIRM_MESSAGE_MAX_LENGTH)) {
    return undefined
  }
  if ((value.title !== undefined && !isBoundedText(value.title, WIDGET_CONFIRM_TITLE_MAX_LENGTH))
    || (value.confirmLabel !== undefined && !isBoundedText(value.confirmLabel, WIDGET_CONFIRM_LABEL_MAX_LENGTH))
    || (value.cancelLabel !== undefined && !isBoundedText(value.cancelLabel, WIDGET_CONFIRM_LABEL_MAX_LENGTH))) {
    return undefined
  }
  return {
    ...(typeof value.title === 'string' ? { title: value.title.trim() } : {}),
    message: value.message.trim(),
    ...(typeof value.confirmLabel === 'string' ? { confirmLabel: value.confirmLabel.trim() } : {}),
    ...(typeof value.cancelLabel === 'string' ? { cancelLabel: value.cancelLabel.trim() } : {}),
  }
}

/** 在宿主反馈层缺失时返回稳定失败，禁止用浏览器原生 alert/confirm 绕过来源标识。 */
function requireFeedback(feedback: WidgetHostFeedback | undefined): WidgetHostFeedback {
  if (feedback) return feedback
  throw new WidgetBrokerMethodError({ code: 'INSTANCE_DISABLED', message: '宿主反馈界面暂不可用。' })
}

/**
 * 创建绑定到单个已验证 session 的 ui.toast 与 ui.confirm 方法。
 *
 * toast 限流仍由唯一 Broker 的 kind='toast' 处理；此模块只校验公开 DTO 并委托 App 根层渲染，
 * 因而不会从 sandbox 调用原生弹窗，也不会把第三方内容当作 HTML 插入。
 */
export function createWidgetUiBrokerMethods(
  session: WidgetBrokerSession,
  feedback: WidgetHostFeedback | undefined,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'ui.toast': {
      kind: 'toast',
      validateParams: (params) => parseToastParams(params) ? undefined : invalidUiParams('组件提示参数无效。'),
      invoke(params) {
        const input = parseToastParams(params)!
        requireFeedback(feedback).toast({ componentId: session.componentId, message: input.message })
        return undefined
      },
    },
    'ui.confirm': {
      validateParams: (params) => parseConfirmParams(params) ? undefined : invalidUiParams('组件确认参数无效。'),
      async invoke(params) {
        const input = parseConfirmParams(params)!
        const confirmed = await requireFeedback(feedback).confirm({
          kind: 'component',
          componentId: session.componentId,
          ...input,
        })
        return { confirmed }
      },
    },
  }
}
