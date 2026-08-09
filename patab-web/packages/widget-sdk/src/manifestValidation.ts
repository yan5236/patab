import type { ErrorObject } from 'ajv'

import { validateManifestV1 } from './generated/manifestValidator.js'

/** Manifest Schema 校验失败时对外公开的最小安全结果。 */
export interface WidgetManifestValidationFailure {
  readonly valid: false
  /** 可操作的 Manifest JSON Pointer，不携带 Ajv 原始错误对象或输入内容。 */
  readonly path: string
}

/** Manifest Schema 校验成功时对外公开的最小安全结果。 */
export interface WidgetManifestValidationSuccess {
  readonly valid: true
}

/** 所有 Manifest Schema 校验结果的联合类型。 */
export type WidgetManifestValidationResult = WidgetManifestValidationFailure | WidgetManifestValidationSuccess

/** 将 Ajv 的第一个错误转为 JSON Pointer；缺失字段附加属性名，以便导入界面准确定位。 */
function getFirstSchemaErrorPath(errors: ErrorObject[] | null | undefined): string {
  const firstError = errors?.[0]
  if (!firstError) return '/'
  if (firstError.keyword === 'required') {
    const missingProperty = (firstError.params as { readonly missingProperty?: unknown }).missingProperty
    if (typeof missingProperty === 'string') return `${firstError.instancePath}/${missingProperty}`
  }
  return firstError.instancePath || '/'
}

/**
 * 使用 SDK 发布的 Draft 2020-12 Schema 校验不可信 Manifest，返回脱敏的首个字段路径而非 Ajv 原始错误。
 */
export function validatePatabWidgetManifestV1(value: unknown): WidgetManifestValidationResult {
  return validateManifestV1(value)
    ? { valid: true }
    : { valid: false, path: getFirstSchemaErrorPath(validateManifestV1.errors) }
}
