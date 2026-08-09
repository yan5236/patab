import type { WidgetPermission, WidgetPermissionSnapshot } from '@patab/widget-sdk'

import {
  getActiveComponentVersion,
  getInstalledComponent,
  type InstalledComponentRecord,
} from '@/custom-components/repository/componentPackageRepository'

import type { WidgetBrokerSession, WidgetPermissionSource } from './capabilityBroker'

/**
 * 读取当前活动版本中实际声明的权限，防止过期或人为写入的授权记录扩大组件权限。
 */
function getDeclaredPermissions(component: Awaited<ReturnType<typeof getActiveComponentVersion>>): ReadonlySet<WidgetPermission> {
  return new Set<WidgetPermission>([
    ...(component?.manifest.permissions?.required ?? []),
    ...(component?.manifest.permissions?.optional ?? []),
  ])
}

/**
 * 判断目录与活动版本是否仍匹配当前会话。
 *
 * session 固定组件版本；更新切换、卸载或包缺失后旧 iframe 的下一次 API 调用必须立即被拒绝。
 */
async function getActiveSessionComponent(session: WidgetBrokerSession): Promise<{
  readonly component: InstalledComponentRecord
  readonly version: NonNullable<Awaited<ReturnType<typeof getActiveComponentVersion>>>
} | undefined> {
  const [component, version] = await Promise.all([
    getInstalledComponent(session.componentId),
    getActiveComponentVersion(session.componentId),
  ])
  if (!component || !version || component.activeVersion !== session.componentVersion || version.version !== session.componentVersion) {
    return undefined
  }
  return { component, version }
}

/**
 * 创建 Repository 驱动的动态权限读取器。
 *
 * 不缓存任何 grant，每一次 Broker API 调用都重新读取 IndexedDB，因此 optional 授权撤销、更新切换和卸载会在下一次调用生效。
 */
export function createRepositoryPermissionSource(): WidgetPermissionSource {
  return {
    async hasPermission(session, permission): Promise<boolean> {
      const active = await getActiveSessionComponent(session)
      if (!active) return false
      return getDeclaredPermissions(active.version).has(permission)
        && active.component.grantedPermissions.includes(permission)
    },
    async hasNetworkOrigin(session, origin): Promise<boolean> {
      const active = await getActiveSessionComponent(session)
      if (!active) return false
      const declaredOrigins = new Set((active.version.manifest.network ?? []).map((network) => network.origin))
      return declaredOrigins.has(origin) && active.component.grantedNetworkOrigins.includes(origin)
    },
  }
}

/**
 * 读取当前会话可安全暴露给 SDK context 的权限快照。
 *
 * 快照只包含仍由活动 Manifest 声明且仍被 Repository 授予的权限和精确来源，绝不返回授权时间、发布者或内部目录对象。
 */
export async function getRepositoryPermissionSnapshot(
  session: WidgetBrokerSession,
): Promise<WidgetPermissionSnapshot> {
  const active = await getActiveSessionComponent(session)
  if (!active) return { granted: [], networkOrigins: [] }

  const declaredPermissions = getDeclaredPermissions(active.version)
  const declaredOrigins = new Set<string>((active.version.manifest.network ?? []).map((network) => network.origin))
  return {
    granted: active.component.grantedPermissions.filter((permission) => declaredPermissions.has(permission)),
    networkOrigins: active.component.grantedNetworkOrigins.filter(
      (origin): origin is `https://${string}` => declaredOrigins.has(origin),
    ),
  }
}
