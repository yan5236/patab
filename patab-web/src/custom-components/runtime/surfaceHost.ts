import type { WidgetBrokerSession } from './capabilityBroker'

/** 根层宿主界面可打开的固定 third-party surface 名称。 */
export type WidgetUserSurface = 'detail' | 'settings'

/**
 * Runtime 与 Vue 根层之间的最小 surface UI 边界。
 *
 * Broker 只持有这一接口，不读取 Pinia、BaseModal 或 DOM；根层负责单 modal、焦点和移动端限制。
 */
export interface WidgetSurfaceHost {
  openSurface(session: WidgetBrokerSession, surface: WidgetUserSurface): boolean
  closeSurface(session: WidgetBrokerSession): boolean
  openVariantPicker(session: WidgetBrokerSession): boolean
}

/** 当前 App 根层注册的唯一 surface host；不在模块外暴露 Vue 组件或 modal 状态。 */
let currentSurfaceHost: WidgetSurfaceHost | undefined

/**
 * 注册根层 surface host，并返回身份安全的注销函数。
 *
 * 应用热更新或重新挂载时，旧组件卸载不得清除新 host，避免运行中的 sandbox 误失去关闭能力。
 */
export function registerWidgetSurfaceHost(host: WidgetSurfaceHost): () => void {
  currentSurfaceHost = host
  return () => {
    if (currentSurfaceHost === host) currentSurfaceHost = undefined
  }
}

/** 读取当前根层 host；未挂载时调用方必须返回稳定错误，不能创建第二套 modal 会话。 */
export function getWidgetSurfaceHost(): WidgetSurfaceHost | undefined {
  return currentSurfaceHost
}

/** 供宿主 WidgetShell 按静态 Manifest 菜单打开详情或设置，不让 Vue 组件直接操纵 Broker。 */
export function requestWidgetSurface(session: WidgetBrokerSession, surface: WidgetUserSurface): boolean {
  return currentSurfaceHost?.openSurface(session, surface) ?? false
}

/** 供宿主 WidgetShell 按静态 Manifest 菜单打开同一个原生类型选择器。 */
export function requestWidgetVariantPicker(session: WidgetBrokerSession): boolean {
  return currentSurfaceHost?.openVariantPicker(session) ?? false
}
