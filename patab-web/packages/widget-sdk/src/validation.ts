import type { WidgetApiError, WidgetErrorCode } from './errors.js'

/**
 * 表示公开契约的纯校验成功结果，不携带被校验对象或任何宿主运行时状态。
 */
export interface WidgetContractValidationSuccess {
  readonly valid: true
}

/**
 * 表示公开契约的纯校验失败结果，只暴露稳定错误码、安全消息与公开字段路径。
 */
export interface WidgetContractValidationFailure {
  readonly valid: false
  readonly error: WidgetApiError
}

/**
 * 统一公开契约校验的结果形状，让未来 Broker、CLI 与测试模拟器复用同一份无副作用错误表达。
 */
export type WidgetContractValidationResult = WidgetContractValidationSuccess | WidgetContractValidationFailure

/**
 * 创建不携带用户数据或宿主异常的契约校验失败结果，供权限、待办和网络 DTO 的纯校验器复用。
 */
export function createWidgetContractValidationFailure(
  code: WidgetErrorCode,
  message: string,
  path: string,
): WidgetContractValidationFailure {
  return {
    valid: false,
    error: { code, message, path },
  }
}

/**
 * 返回无额外数据的成功结果，避免各个纯校验器自行构造不一致的成功协议。
 */
export function createWidgetContractValidationSuccess(): WidgetContractValidationSuccess {
  return { valid: true }
}
