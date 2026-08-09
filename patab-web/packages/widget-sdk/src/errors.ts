/**
 * 固定 API v1 对外可见的错误码集合，使 SDK、CLI 与宿主能在不泄露内部异常的前提下交换失败原因。
 */
export const WIDGET_ERROR_CODES = [
  'API_INCOMPATIBLE',
  'CONCURRENCY_LIMIT',
  'INSTANCE_DISABLED',
  'INTEGRITY_FAILED',
  'INVALID_ARGUMENT',
  'INVALID_PACKAGE',
  'INVALID_REQUEST',
  'MANIFEST_INVALID',
  'ORIGIN_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'RESPONSE_TOO_LARGE',
  'SAFE_MODE_ACTIVE',
  'SIGNATURE_INVALID',
  'SURFACE_LIMIT_REACHED',
  'SURFACE_NOT_DECLARED',
  'TIMEOUT',
  'UNKNOWN_METHOD',
] as const

/**
 * 表示 API v1 稳定错误码的联合类型，禁止以宿主异常名称或堆栈文本作为跨边界错误协议。
 */
export type WidgetErrorCode = (typeof WIDGET_ERROR_CODES)[number]

/**
 * 描述可安全展示给第三方组件的错误信息，可选字段路径只指向公开 DTO，不包含宿主内部路径或敏感载荷。
 */
export interface WidgetApiError {
  readonly code: WidgetErrorCode
  readonly message: string
  readonly path?: string
}
