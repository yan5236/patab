import type { PatabWidgetManifestV1, WidgetPermission } from '@patab/widget-sdk'

import type { InstalledComponentRecord } from '@/custom-components/repository/componentPackageRepository'

/** 更新审查中需要重新向用户展示的权限与来源差异。 */
export interface ComponentUpdateGrantDiff {
  readonly newPermissions: readonly WidgetPermission[]
  readonly newNetworkOrigins: readonly string[]
}

/** 更新审查可直接写入 Store 的授权初始值与新增项差异。 */
export interface ComponentUpdateGrantReview extends ComponentUpdateGrantDiff {
  readonly permissionGrants: Readonly<Partial<Record<WidgetPermission, boolean>>>
  readonly networkGrants: Readonly<Record<string, boolean>>
}

/** 收集 Manifest 声明权限，保持 required/optional 的原有顺序以稳定渲染审查页。 */
function getDeclaredPermissions(manifest: PatabWidgetManifestV1): readonly WidgetPermission[] {
  return [...(manifest.permissions?.required ?? []), ...(manifest.permissions?.optional ?? [])]
}

/**
 * 计算同发布者更新可继承的授权和必须重新审查的新增能力。
 *
 * 旧 grant 只能在新旧 Manifest 都声明时保留；新声明的权限或 origin 一律从未授权开始，
 * 因而用户取消更新或未确认 required 新项时，当前活动版本及其授权不会被修改。
 */
export function createComponentUpdateGrantReview(
  installedComponent: Pick<InstalledComponentRecord, 'grantedPermissions' | 'grantedNetworkOrigins'>,
  previousManifest: PatabWidgetManifestV1,
  incomingManifest: PatabWidgetManifestV1,
): ComponentUpdateGrantReview {
  const previousPermissions = new Set(getDeclaredPermissions(previousManifest))
  const previousOrigins = new Set((previousManifest.network ?? []).map((network) => network.origin))
  const previousGrantedPermissions = new Set(installedComponent.grantedPermissions)
  const previousGrantedOrigins = new Set(installedComponent.grantedNetworkOrigins)

  const incomingPermissions = getDeclaredPermissions(incomingManifest)
  const permissionGrants: Partial<Record<WidgetPermission, boolean>> = {}
  const newPermissions: WidgetPermission[] = []
  for (const permission of incomingPermissions) {
    const isNew = !previousPermissions.has(permission)
    if (isNew) newPermissions.push(permission)
    permissionGrants[permission] = !isNew && previousGrantedPermissions.has(permission)
  }

  const networkGrants: Record<string, boolean> = {}
  const newNetworkOrigins: string[] = []
  for (const network of incomingManifest.network ?? []) {
    const isNew = !previousOrigins.has(network.origin)
    if (isNew) newNetworkOrigins.push(network.origin)
    networkGrants[network.origin] = !isNew && previousGrantedOrigins.has(network.origin)
  }

  return { permissionGrants, networkGrants, newPermissions, newNetworkOrigins }
}
