import type { WidgetApiError, WidgetOpenExternalParams } from '@patab/widget-sdk'

import type { WidgetHostFeedback } from './hostFeedback'
import {
  WidgetBrokerMethodError,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
} from '@/custom-components/runtime/capabilityBroker'

/** 外链 URL 公开输入上限，足以覆盖常规 HTTPS 地址且避免将 MessagePort 用作长文本通道。 */
export const WIDGET_EXTERNAL_URL_MAX_LENGTH = 2_048

/** 浏览器外链副作用的薄适配器，测试可替换而 Capability 不直接依赖 window。 */
export interface WidgetExternalAdapter {
  readonly isUserGestureActive: () => boolean
  readonly open: (url: URL) => boolean
}

/** 判断未知值是否是无访问器风险的普通记录。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 将未知 URL 安全规范化为 HTTPS URL；不允许用户名或密码混入地址栏确认。 */
function parseHttpsUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > WIDGET_EXTERNAL_URL_MAX_LENGTH) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    return url
  } catch {
    return undefined
  }
}

/** 解析 ui.openExternal 的唯一 URL 字段，拒绝额外参数或非 HTTPS 目标。 */
function parseOpenExternalParams(value: unknown): WidgetOpenExternalParams | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || typeof value.url !== 'string' || !parseHttpsUrl(value.url)) {
    return undefined
  }
  return { url: value.url }
}

/** 构造不泄露原始 URL、DOMException 或窗口句柄的稳定参数失败。 */
function invalidExternalParams(): WidgetApiError {
  return { code: 'INVALID_ARGUMENT', message: '外链地址必须是有效的 HTTPS 地址。', path: 'params.url' }
}

/** 创建默认浏览器适配器，强制新标签页的 noopener/noreferrer 隔离并容错 popup blocker。 */
export function createBrowserWidgetExternalAdapter(): WidgetExternalAdapter {
  return {
    isUserGestureActive: () => globalThis.navigator?.userActivation?.isActive === true,
    open(url) {
      try {
        const openedWindow = globalThis.window?.open(url.href, '_blank', 'noopener,noreferrer')
        if (!openedWindow) return false
        try {
          openedWindow.opener = null
        } catch {
          // noopener 已由 features 请求；跨窗口 setter 失败不能变成可见宿主异常。
        }
        return true
      } catch {
        return false
      }
    },
  }
}

/**
 * 创建安全外链方法。
 *
 * 请求到达 Broker 时必须仍处于浏览器有效用户手势；宿主随后展示固定目标 origin 的确认，
 * 只有用户确认后才通过 noopener/noreferrer 新标签页打开，取消和浏览器拦截均返回 opened=false。
 */
export function createWidgetExternalBrokerMethods(
  session: WidgetBrokerSession,
  feedback: WidgetHostFeedback | undefined,
  adapter: WidgetExternalAdapter,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'ui.openExternal': {
      validateParams: (params) => parseOpenExternalParams(params) ? undefined : invalidExternalParams(),
      async invoke(params) {
        const input = parseOpenExternalParams(params)!
        const url = parseHttpsUrl(input.url)!
        if (!adapter.isUserGestureActive()) {
          throw new WidgetBrokerMethodError({ code: 'PERMISSION_DENIED', message: '打开外链需要有效的用户操作。' })
        }
        if (!feedback) {
          throw new WidgetBrokerMethodError({ code: 'INSTANCE_DISABLED', message: '宿主外链确认界面暂不可用。' })
        }
        const confirmed = await feedback.confirm({
          kind: 'external',
          componentId: session.componentId,
          targetOrigin: url.origin,
        })
        return { opened: confirmed ? adapter.open(url) : false }
      },
    },
  }
}
