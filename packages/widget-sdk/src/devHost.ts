import type { PatabWidgetManifestV1, WidgetTileSize } from './manifest.js'
import { validatePatabWidgetManifestV1 } from './manifestValidation.js'

/** CLI 与本地 PaTab 开发宿主当前共同支持的协议版本。 */
export const WIDGET_DEV_HOST_PROTOCOL_VERSION = 1 as const

/** 开发宿主只接受当前 CLI 会话下的受保护相对 surface 路径。 */
const DEV_SURFACE_PATH_PATTERN = /^\/__patab_dev__\/sessions\/[A-Za-z0-9_-]{16,128}\/surfaces\/[A-Za-z0-9_-]{1,64}$/

/** 开发会话公开 ID 的允许字符与长度，避免它被解释为路径或日志控制内容。 */
const DEV_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

/** CLI 提供给真实 PaTab 开发宿主的最小不可变会话描述。 */
export interface WidgetDevSessionDescriptor {
  readonly protocolVersion: typeof WIDGET_DEV_HOST_PROTOCOL_VERSION
  readonly sessionId: string
  readonly hostVersion: string
  readonly revision: number
  readonly component: {
    readonly manifest: PatabWidgetManifestV1
    readonly surfacePaths: Readonly<Record<string, string>>
  }
  readonly initialInstance: {
    readonly instanceId: string
    readonly size: WidgetTileSize
    readonly variantId?: string
  }
  readonly seedVersion: 1
}

/** 开发会话描述校验成功时返回深复制值，避免调用方继续持有不可信输入引用。 */
export interface WidgetDevSessionValidationSuccess {
  readonly valid: true
  readonly value: WidgetDevSessionDescriptor
}

/** 开发会话描述校验失败只公开稳定 JSON Pointer，不回显原输入或内部异常。 */
export interface WidgetDevSessionValidationFailure {
  readonly valid: false
  readonly path: string
}

/** 开发会话描述的纯校验结果。 */
export type WidgetDevSessionValidationResult = WidgetDevSessionValidationSuccess | WidgetDevSessionValidationFailure

/** 判断未知值是否为无数组语义的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 检查对象是否只含固定字段，避免新旧 CLI/宿主静默忽略安全相关扩展。 */
function hasExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(record)
  return required.every((key) => Object.hasOwn(record, key)) && keys.every((key) => allowed.has(key))
}

/** 判断尺寸是否与 Manifest 默认尺寸完全一致。 */
function isSameSize(value: unknown, expected: WidgetTileSize): value is WidgetTileSize {
  if (!isRecord(value) || !hasExactKeys(value, ['w', 'h'])) return false
  return value.w === expected.w && value.h === expected.h
}

/** 返回固定失败路径，集中保持所有分支都不携带输入正文。 */
function failure(path: string): WidgetDevSessionValidationFailure {
  return { valid: false, path }
}

/**
 * 校验 CLI 与 PaTab 开发宿主之间的会话描述。
 *
 * 该函数只接受公开 Manifest、相对 surface 路径与会话元数据；token、本机路径、源码正文
 * 和任意扩展字段都会在宿主读取前被拒绝。
 */
export function validateWidgetDevSessionDescriptor(value: unknown): WidgetDevSessionValidationResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    'protocolVersion',
    'sessionId',
    'hostVersion',
    'revision',
    'component',
    'initialInstance',
    'seedVersion',
  ])) return failure('/')

  if (value.protocolVersion !== WIDGET_DEV_HOST_PROTOCOL_VERSION) return failure('/protocolVersion')
  if (typeof value.sessionId !== 'string' || !DEV_ID_PATTERN.test(value.sessionId)) return failure('/sessionId')
  if (typeof value.hostVersion !== 'string' || value.hostVersion.length < 1 || value.hostVersion.length > 64) {
    return failure('/hostVersion')
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return failure('/revision')
  if (value.seedVersion !== 1) return failure('/seedVersion')

  if (!isRecord(value.component) || !hasExactKeys(value.component, ['manifest', 'surfacePaths'])) {
    return failure('/component')
  }
  const manifestValidation = validatePatabWidgetManifestV1(value.component.manifest)
  if (!manifestValidation.valid) return failure(`/component/manifest${manifestValidation.path === '/' ? '' : manifestValidation.path}`)
  const manifest = value.component.manifest as PatabWidgetManifestV1

  if (!isRecord(value.component.surfacePaths)) return failure('/component/surfacePaths')
  const surfaceNames = Object.keys(manifest.surfaces).sort()
  const pathNames = Object.keys(value.component.surfacePaths).sort()
  if (surfaceNames.length !== pathNames.length || surfaceNames.some((name, index) => name !== pathNames[index])) {
    return failure('/component/surfacePaths')
  }
  const uniquePaths = new Set<string>()
  for (const surface of surfaceNames) {
    const path = value.component.surfacePaths[surface]
    if (typeof path !== 'string' || !DEV_SURFACE_PATH_PATTERN.test(path)) {
      return failure(`/component/surfacePaths/${surface}`)
    }
    if (uniquePaths.has(path)) return failure('/component/surfacePaths')
    uniquePaths.add(path)
  }

  if (!isRecord(value.initialInstance) || !hasExactKeys(value.initialInstance, ['instanceId', 'size'], ['variantId'])) {
    return failure('/initialInstance')
  }
  if (typeof value.initialInstance.instanceId !== 'string' || !DEV_ID_PATTERN.test(value.initialInstance.instanceId)) {
    return failure('/initialInstance/instanceId')
  }
  if (!isSameSize(value.initialInstance.size, manifest.defaultSize)) return failure('/initialInstance/size')
  if (manifest.defaultVariant === undefined) {
    if (value.initialInstance.variantId !== undefined) return failure('/initialInstance/variantId')
  } else if (value.initialInstance.variantId !== manifest.defaultVariant) {
    return failure('/initialInstance/variantId')
  }

  try {
    return { valid: true, value: structuredClone(value) as unknown as WidgetDevSessionDescriptor }
  } catch {
    return failure('/')
  }
}
