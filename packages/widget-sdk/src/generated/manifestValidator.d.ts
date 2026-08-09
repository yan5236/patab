import type { ErrorObject } from 'ajv'

/** 由构建期 Ajv standalone 生成的 Manifest v1 验证器类型边界，运行时不会再调用 Function 构造器。 */
export interface ManifestValidator {
  (value: unknown): boolean
  errors?: ErrorObject[] | null
}

/** 使用静态生成代码校验 Manifest，保证 MV3 CSP 下没有 unsafe-eval 依赖。 */
export const validateManifestV1: ManifestValidator
