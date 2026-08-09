import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

/** 已安装目录中用于更新身份与版本判定的最小安全快照。 */
export interface InstalledComponentUpdateIdentity {
  readonly componentId: string
  readonly activeVersion: string
  readonly publisherPublicKey?: string
}

/** 更新判定的稳定拒绝码；调用方只能据此展示本地化文案，不能暴露完整包内容。 */
export type ComponentUpdateRejectionCode =
  | 'COMPONENT_ID_MISMATCH'
  | 'PUBLISHER_KEY_CHANGED'
  | 'UPDATE_VERSION_INVALID'
  | 'UPDATE_VERSION_NOT_HIGHER'

/** 同组件包在首次安装、更新或拒绝路径之间的静态判定结果。 */
export type ComponentUpdateDecision =
  | { readonly kind: 'install' }
  | {
      readonly kind: 'update'
      readonly componentId: string
      readonly currentVersion: string
      readonly incomingVersion: string
    }
  | {
      readonly kind: 'reject'
      readonly code: ComponentUpdateRejectionCode
      readonly componentId: string
      readonly currentVersion: string
      readonly incomingVersion: string
    }

/** 解析后的 SemVer 主版本与预发布标识；构建元数据不参与版本先后比较。 */
interface ParsedSemanticVersion {
  readonly major: string
  readonly minor: string
  readonly patch: string
  readonly prerelease?: readonly string[]
}

const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/**
 * 把已通过 Manifest Schema 的版本字符串解析为可比较的 SemVer 结构，同时在 Repository 直接调用时拒绝畸形输入。
 */
function parseSemanticVersion(version: string): ParsedSemanticVersion | undefined {
  const match = SEMANTIC_VERSION_PATTERN.exec(version)
  if (!match) return undefined
  const major = match[1]
  const minor = match[2]
  const patch = match[3]
  const prerelease = match[4]
  if (!major || !minor || !patch) return undefined
  return {
    major,
    minor,
    patch,
    ...(prerelease ? { prerelease: prerelease.split('.') } : {}),
  }
}

/**
 * 比较无前导零的 SemVer 数字段，不把超长版本号转换为 JavaScript number，从而避免精度丢失导致错误覆盖。
 */
function compareNumericIdentifier(left: string, right: string): number {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1
  if (left === right) return 0
  return left > right ? 1 : -1
}

/**
 * 按 SemVer 2.0 规则比较预发布标识：数字标识低于非数字标识，缺少预发布标识代表正式版。
 */
function comparePrerelease(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1

  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = left[index]
    const rightIdentifier = right[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue

    const leftIsNumeric = /^\d+$/.test(leftIdentifier)
    const rightIsNumeric = /^\d+$/.test(rightIdentifier)
    if (leftIsNumeric && rightIsNumeric) return compareNumericIdentifier(leftIdentifier, rightIdentifier)
    if (leftIsNumeric) return -1
    if (rightIsNumeric) return 1
    return leftIdentifier > rightIdentifier ? 1 : -1
  }
  return 0
}

/**
 * 比较两个完整 SemVer；返回正数表示左侧较新，返回零表示两者仅可能在构建元数据上不同。
 */
function compareSemanticVersions(left: ParsedSemanticVersion, right: ParsedSemanticVersion): number {
  for (const field of ['major', 'minor', 'patch'] as const) {
    const comparison = compareNumericIdentifier(left[field], right[field])
    if (comparison !== 0) return comparison
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * 判定导入包应首次安装、进入更新或被安全拒绝；发布者公钥从无到有、有到无或值变化都视为身份变化，不能覆盖现有包。
 */
export function decideComponentUpdate(
  installedComponent: InstalledComponentUpdateIdentity | undefined,
  incomingManifest: Pick<PatabWidgetManifestV1, 'id' | 'publisher' | 'version'>,
): ComponentUpdateDecision {
  if (!installedComponent) return { kind: 'install' }

  if (installedComponent.componentId !== incomingManifest.id) {
    return {
      kind: 'reject',
      code: 'COMPONENT_ID_MISMATCH',
      componentId: installedComponent.componentId,
      currentVersion: installedComponent.activeVersion,
      incomingVersion: incomingManifest.version,
    }
  }

  if (installedComponent.publisherPublicKey !== incomingManifest.publisher?.publicKey) {
    return {
      kind: 'reject',
      code: 'PUBLISHER_KEY_CHANGED',
      componentId: installedComponent.componentId,
      currentVersion: installedComponent.activeVersion,
      incomingVersion: incomingManifest.version,
    }
  }

  const currentVersion = parseSemanticVersion(installedComponent.activeVersion)
  const incomingVersion = parseSemanticVersion(incomingManifest.version)
  if (!currentVersion || !incomingVersion) {
    return {
      kind: 'reject',
      code: 'UPDATE_VERSION_INVALID',
      componentId: installedComponent.componentId,
      currentVersion: installedComponent.activeVersion,
      incomingVersion: incomingManifest.version,
    }
  }

  if (compareSemanticVersions(incomingVersion, currentVersion) <= 0) {
    return {
      kind: 'reject',
      code: 'UPDATE_VERSION_NOT_HIGHER',
      componentId: installedComponent.componentId,
      currentVersion: installedComponent.activeVersion,
      incomingVersion: incomingManifest.version,
    }
  }

  return {
    kind: 'update',
    componentId: installedComponent.componentId,
    currentVersion: installedComponent.activeVersion,
    incomingVersion: incomingManifest.version,
  }
}
