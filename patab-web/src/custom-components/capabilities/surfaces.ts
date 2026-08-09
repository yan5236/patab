import type { WidgetApiError, WidgetOpenSurfaceParams } from '@patab/widget-sdk'

import {
  WidgetBrokerMethodError,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
} from '@/custom-components/runtime/capabilityBroker'
import { getWidgetSurfaceHost, type WidgetSurfaceHost } from '@/custom-components/runtime/surfaceHost'

/** 组件可请求的宿主 modal surface 白名单；migration 等内部 surface 永不进入用户界面。 */
const USER_SURFACE_NAMES = new Set<WidgetOpenSurfaceParams['surface']>(['detail', 'settings'])

/** 判断输入是否为不含访问器的普通对象，避免 RPC 参数原型污染宿主 UI 边界。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 解析 ui.openSurface 的固定单字段参数，并拒绝任意内部或未声明 surface 名称。 */
function parseOpenSurfaceParams(value: unknown): WidgetOpenSurfaceParams | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !USER_SURFACE_NAMES.has(value.surface as WidgetOpenSurfaceParams['surface'])) {
    return undefined
  }
  return { surface: value.surface as WidgetOpenSurfaceParams['surface'] }
}

/** 判断 ui.closeSurface 与 ui.openVariantPicker 只接收空对象，防止第三方指定其他实例或图块。 */
function isEmptyRecord(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0
}

/** 创建不含宿主对象、DOM 或 modal 细节的稳定 UI capability 错误。 */
function createSurfaceError(code: WidgetApiError['code'], message: string): WidgetBrokerMethodError {
  return new WidgetBrokerMethodError({ code, message })
}

/** 读取当前 App 根层注册的唯一 surface host；缺失时安全拒绝而不退化为浏览器弹窗。 */
function requireSurfaceHost(host: WidgetSurfaceHost | undefined): WidgetSurfaceHost {
  const currentHost = host ?? getWidgetSurfaceHost()
  if (currentHost) return currentHost
  throw createSurfaceError('INSTANCE_DISABLED', '宿主组件界面暂不可用。')
}

/**
 * 创建绑定当前 Broker session 的 surface 与 variant UI 方法。
 *
 * 该能力只把已验证 session 交给根层的宿主 UI；Manifest 声明校验在 Runtime 读取活动版本后完成，
 * 组件不能指定任意 HTML、尺寸、实例或嵌套 modal。
 */
export function createWidgetSurfaceBrokerMethods(
  session: WidgetBrokerSession,
  declaredSurfaces: ReadonlySet<string>,
  variantCount: number,
  host: WidgetSurfaceHost | undefined = getWidgetSurfaceHost(),
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'ui.openSurface': {
      validateParams: (params) => parseOpenSurfaceParams(params)
        ? undefined
        : { code: 'INVALID_ARGUMENT', message: '组件弹窗参数无效。', path: 'params' },
      invoke(params) {
        const input = parseOpenSurfaceParams(params)!
        if (!declaredSurfaces.has(input.surface)) {
          throw createSurfaceError('SURFACE_NOT_DECLARED', '组件未声明此弹窗界面。')
        }
        if (!requireSurfaceHost(host).openSurface(session, input.surface)) {
          throw createSurfaceError('SURFACE_LIMIT_REACHED', '当前组件界面已打开弹窗。')
        }
        return { opened: true }
      },
    },
    'ui.closeSurface': {
      validateParams: (params) => isEmptyRecord(params)
        ? undefined
        : { code: 'INVALID_ARGUMENT', message: '关闭弹窗参数无效。', path: 'params' },
      invoke() {
        return { closed: requireSurfaceHost(host).closeSurface(session) }
      },
    },
    'ui.openVariantPicker': {
      validateParams: (params) => isEmptyRecord(params)
        ? undefined
        : { code: 'INVALID_ARGUMENT', message: '类型选择参数无效。', path: 'params' },
      invoke() {
        if (variantCount < 2) {
          throw createSurfaceError('INVALID_ARGUMENT', '组件未提供可切换的类型。')
        }
        if (!requireSurfaceHost(host).openVariantPicker(session)) {
          throw createSurfaceError('SURFACE_LIMIT_REACHED', '当前组件界面已打开弹窗。')
        }
        return { opened: true }
      },
    },
  }
}
