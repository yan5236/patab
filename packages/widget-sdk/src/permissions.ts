import {
  createWidgetContractValidationFailure,
  createWidgetContractValidationSuccess,
  type WidgetContractValidationResult,
} from './validation.js'

/**
 * 列出 API v1 可由 Manifest 声明的待办领域权限，权限之外的基础能力不应通过该目录申请。
 */
export const WIDGET_TODO_PERMISSIONS = [
  'todos.read',
  'todos.create',
  'todos.update',
  'todos.delete',
] as const

/**
 * 列出 API v1 所有可声明权限，作为 Manifest、安装审查与 Broker 的唯一公开目录。
 */
export const WIDGET_PERMISSIONS = WIDGET_TODO_PERMISSIONS

/**
 * 表示 API v1 当前允许在 Manifest 中声明的权限名称。
 */
export type WidgetPermission = (typeof WIDGET_PERMISSIONS)[number]

/**
 * 区分安装时必须全部批准的 required 权限与默认未授予、可由用户选择的 optional 权限。
 */
export interface WidgetPermissionDeclarations {
  readonly required?: readonly WidgetPermission[]
  readonly optional?: readonly WidgetPermission[]
}

/**
 * 校验权限列表只使用公开目录、列表内不重复、且同一权限不会同时出现在 required 与 optional 中。
 */
export function validateWidgetPermissionDeclarations(
  declarations: WidgetPermissionDeclarations | undefined,
): WidgetContractValidationResult {
  if (!declarations) return createWidgetContractValidationSuccess()

  const required = declarations.required ?? []
  const optional = declarations.optional ?? []
  const knownPermissions = new Set<string>(WIDGET_PERMISSIONS)
  const requiredPermissions = new Set<string>()

  for (const [index, permission] of required.entries()) {
    if (!knownPermissions.has(permission)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        'Manifest 包含未知的必需权限。',
        `permissions.required[${index}]`,
      )
    }
    if (requiredPermissions.has(permission)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '必需权限不能重复声明。',
        `permissions.required[${index}]`,
      )
    }
    requiredPermissions.add(permission)
  }

  const optionalPermissions = new Set<string>()
  for (const [index, permission] of optional.entries()) {
    if (!knownPermissions.has(permission)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        'Manifest 包含未知的可选权限。',
        `permissions.optional[${index}]`,
      )
    }
    if (optionalPermissions.has(permission)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '可选权限不能重复声明。',
        `permissions.optional[${index}]`,
      )
    }
    if (requiredPermissions.has(permission)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '同一权限不能同时声明为必需和可选。',
        `permissions.optional[${index}]`,
      )
    }
    optionalPermissions.add(permission)
  }

  return createWidgetContractValidationSuccess()
}
