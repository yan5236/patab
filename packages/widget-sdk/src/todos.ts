import {
  createWidgetContractValidationFailure,
  createWidgetContractValidationSuccess,
  type WidgetContractValidationResult,
} from './validation.js'

/** 待办公开 DTO 中允许的最大文本字符数，防止组件通过单条待办发送过大的用户可见载荷。 */
export const WIDGET_TODO_TEXT_MAX_LENGTH = 500

/** 待办公开 DTO 中允许的最大标识符字符数，覆盖宿主生成的稳定 ID 而不暴露其生成方式。 */
export const WIDGET_TODO_ID_MAX_LENGTH = 128

/** 待办列表游标允许的最大字符数，避免分页参数成为无界跨边界载荷。 */
export const WIDGET_TODO_CURSOR_MAX_LENGTH = 256

/** 待办列表单页最大条数，与 API v1 的分页上限保持一致。 */
export const WIDGET_TODO_PAGE_LIMIT_MAX = 100

/**
 * 描述不会泄露 Pinia 响应式引用、排序权重或内部列表关系的最小待办公开 DTO。
 */
export interface WidgetTodo {
  readonly id: string
  readonly text: string
  readonly completed: boolean
  readonly dueDate?: string
  readonly important: boolean
}

/**
 * 描述待办列表的游标分页请求，实际数据读取与权限判断仍由宿主 Capability Broker 负责。
 */
export interface WidgetTodoListRequest {
  readonly cursor?: string
  readonly limit?: number
}

/**
 * 描述待办列表的公开分页响应，nextCursor 缺失表示没有更多结果。
 */
export interface WidgetTodoListResponse {
  readonly items: readonly WidgetTodo[]
  readonly nextCursor?: string
}

/**
 * 描述创建待办所需的最小公开字段，调用方不能设置宿主排序、列表归属或内部状态。
 */
export interface WidgetTodoCreateInput {
  readonly text: string
  readonly dueDate?: string
  readonly important?: boolean
}

/**
 * 描述更新待办所允许的公开字段；dueDate 为 null 时显式清除日期，未提供字段保持原值。
 */
export interface WidgetTodoUpdateInput {
  readonly id: string
  readonly text?: string
  readonly completed?: boolean
  readonly dueDate?: string | null
  readonly important?: boolean
}

/**
 * 描述删除待办所需的公开标识符，是否存在由宿主数据层在授权后判断。
 */
export interface WidgetTodoDeleteInput {
  readonly id: string
}

/**
 * 描述待办领域变化的最小事件载荷，订阅者应按需重新读取而非接收其他用户的完整数据。
 */
export interface WidgetTodoChangedEvent {
  readonly change: 'created' | 'updated' | 'deleted'
  readonly id: string
}

/**
 * 校验待办 ID 是否为非空且长度受限的公开标识符，不能判断其是否真实存在于宿主数据层。
 */
function validateWidgetTodoId(id: string, path: string): WidgetContractValidationResult {
  if (!id.trim() || id.length > WIDGET_TODO_ID_MAX_LENGTH) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '待办标识符不能为空且不能超过长度上限。',
      path,
    )
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验待办文本是否去除空白后仍有内容且未超过公开字段上限，不会修改调用方传入对象。
 */
function validateWidgetTodoText(text: string, path: string): WidgetContractValidationResult {
  if (!text.trim() || text.length > WIDGET_TODO_TEXT_MAX_LENGTH) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '待办文本不能为空且不能超过长度上限。',
      path,
    )
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验日期是否为真实存在的 YYYY-MM-DD ISO 日期，避免仅依赖正则而接受无效日历日期。
 */
function isWidgetTodoDate(value: string): boolean {
  const matchedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!matchedDate) return false

  const year = Number(matchedDate[1])
  const month = Number(matchedDate[2])
  const day = Number(matchedDate[3])
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  return parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() === month - 1
    && parsedDate.getUTCDate() === day
}

/**
 * 校验可选待办日期；null 只允许更新请求用来清除日期，创建请求不会传入 null。
 */
function validateWidgetTodoDate(
  dueDate: string | null | undefined,
  path: string,
  allowsNull: boolean,
): WidgetContractValidationResult {
  if (dueDate === undefined || (allowsNull && dueDate === null)) {
    return createWidgetContractValidationSuccess()
  }
  if (typeof dueDate !== 'string' || !isWidgetTodoDate(dueDate)) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '待办日期必须是有效的 YYYY-MM-DD。',
      path,
    )
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验创建待办的公开字段限制，真实写入与 todos.create 权限判断不属于该纯函数职责。
 */
export function validateWidgetTodoCreateInput(input: WidgetTodoCreateInput): WidgetContractValidationResult {
  const textValidation = validateWidgetTodoText(input.text, 'text')
  if (!textValidation.valid) return textValidation

  return validateWidgetTodoDate(input.dueDate, 'dueDate', false)
}

/**
 * 校验更新待办的公开字段限制，真实 ID 存在性和 todos.update 权限由后续宿主实现处理。
 */
export function validateWidgetTodoUpdateInput(input: WidgetTodoUpdateInput): WidgetContractValidationResult {
  const idValidation = validateWidgetTodoId(input.id, 'id')
  if (!idValidation.valid) return idValidation

  if (input.text !== undefined) {
    const textValidation = validateWidgetTodoText(input.text, 'text')
    if (!textValidation.valid) return textValidation
  }

  if (input.dueDate !== undefined) {
    return validateWidgetTodoDate(input.dueDate, 'dueDate', true)
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验删除待办的公开字段限制，保持纯函数性质且不访问宿主待办 Repository。
 */
export function validateWidgetTodoDeleteInput(input: WidgetTodoDeleteInput): WidgetContractValidationResult {
  return validateWidgetTodoId(input.id, 'id')
}

/**
 * 校验游标分页参数的长度、整数性和上限，防止单个待办读取请求超过 API v1 的公开边界。
 */
export function validateWidgetTodoListRequest(input: WidgetTodoListRequest): WidgetContractValidationResult {
  if (input.cursor !== undefined && input.cursor.length > WIDGET_TODO_CURSOR_MAX_LENGTH) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '待办分页游标超过长度上限。',
      'cursor',
    )
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > WIDGET_TODO_PAGE_LIMIT_MAX)) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '待办分页条数必须是允许范围内的正整数。',
      'limit',
    )
  }

  return createWidgetContractValidationSuccess()
}
