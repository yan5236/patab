import {
  validateWidgetTodoCreateInput,
  validateWidgetTodoDeleteInput,
  validateWidgetTodoListRequest,
  validateWidgetTodoUpdateInput,
  type WidgetApiError,
  type WidgetPermission,
  type WidgetTodo,
  type WidgetTodoChangedEvent,
  type WidgetTodoCreateInput,
  type WidgetTodoDeleteInput,
  type WidgetTodoListRequest,
  type WidgetTodoListResponse,
  type WidgetTodoUpdateInput,
} from '@patab/widget-sdk'
import type { TodoItem } from '@/types'

/** 描述待办 Capability 可请求的细粒度权限，禁止用宽泛的任意字符串绕过目录约束。 */
export type WidgetTodoPermission = Extract<WidgetPermission, `todos.${string}`>

/** 描述 Capability 的安全返回值；未来 Broker 可直接映射为 SDK RPC 成功或失败响应。 */
export type WidgetTodoCapabilityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WidgetApiError }

/** 描述由 launcher 领域层提供的待办动作与变化订阅，不传递 Pinia store 或 Ref。 */
export interface WidgetTodoCapabilitySource {
  readonly getTodos: () => readonly TodoItem[]
  readonly addTodo: (text: string, options: { date?: string; important?: boolean }) => TodoItem | undefined
  readonly updateTodo: (
    id: string,
    patch: { text?: string; date?: string | null; important?: boolean; done?: boolean },
  ) => TodoItem | undefined
  readonly removeTodo: (id: string) => boolean
  readonly subscribeTodoChanges: (listener: (event: WidgetTodoChangedEvent) => void) => () => void
}

/** 描述运行时权限快照的最小读取接口，调用时动态判断以支持授权撤销立即生效。 */
export interface WidgetTodoPermissionChecker {
  readonly hasPermission: (permission: WidgetTodoPermission) => boolean
}

/** 描述 Capability 提供给未来 Broker 路由器的待办领域方法与事件订阅入口。 */
export interface WidgetTodoCapability {
  readonly list: (input?: WidgetTodoListRequest) => WidgetTodoCapabilityResult<WidgetTodoListResponse>
  readonly create: (input: WidgetTodoCreateInput) => WidgetTodoCapabilityResult<WidgetTodo>
  readonly update: (input: WidgetTodoUpdateInput) => WidgetTodoCapabilityResult<WidgetTodo>
  readonly delete: (input: WidgetTodoDeleteInput) => WidgetTodoCapabilityResult<undefined>
  readonly subscribe: (
    listener: (event: WidgetTodoChangedEvent) => void,
  ) => WidgetTodoCapabilityResult<() => void>
}

/** 构造固定错误 DTO，确保内部实现细节和宿主异常不会离开 Capability 边界。 */
function createTodoCapabilityFailure(
  code: WidgetApiError['code'],
  message: string,
  path?: string,
): WidgetTodoCapabilityResult<never> {
  return {
    ok: false,
    error: { code, message, ...(path ? { path } : {}) },
  }
}

/** 构造成功结果，保持每个调用分支都使用同一可收窄的 Capability 返回形状。 */
function createTodoCapabilitySuccess<T>(value: T): WidgetTodoCapabilityResult<T> {
  return { ok: true, value }
}

/** 判断未知输入是否是无原型污染风险的普通记录，供独立 Capability 在 Broker 前保持安全。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 校验记录只含给定公开字段，防止 listId、order 等宿主内部字段通过运行时调用被注入。 */
function hasOnlyPublicKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

/** 将当前待办公共权限转换为统一拒绝结果，每个入口均需独立调用此函数。 */
function requireTodoPermission(
  permissions: WidgetTodoPermissionChecker,
  permission: WidgetTodoPermission,
): WidgetTodoCapabilityResult<never> | undefined {
  if (permissions.hasPermission(permission)) return undefined
  return createTodoCapabilityFailure('PERMISSION_DENIED', '当前组件未获待办操作所需权限。')
}

/**
 * 将宿主 TodoItem 复制为最小公开 DTO，并在旧持久化数据不符合公开契约时忽略该条目。
 *
 * 此函数永不返回 listId、order 或原始对象，避免 Pinia 代理和内部排序规则穿透 Capability 边界。
 */
export function toWidgetTodo(todo: TodoItem): WidgetTodo | undefined {
  const idValidation = validateWidgetTodoDeleteInput({ id: todo.id })
  if (!idValidation.valid || typeof todo.done !== 'boolean' || typeof todo.important !== 'boolean') return undefined

  const fieldValidation = validateWidgetTodoCreateInput({
    text: todo.text,
    ...(todo.date !== undefined ? { dueDate: todo.date } : {}),
    important: todo.important,
  })
  if (!fieldValidation.valid) return undefined

  return {
    id: todo.id,
    text: todo.text,
    completed: todo.done,
    ...(todo.date !== undefined ? { dueDate: todo.date } : {}),
    important: todo.important,
  }
}

/** 按 launcher 内部排序生成稳定只读快照；排序字段仅在本函数内使用，绝不写入 DTO。 */
function getOrderedTodos(source: WidgetTodoCapabilitySource): readonly TodoItem[] {
  return [...source.getTodos()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

/** 校验并规范化待办列表请求，防止未经过 Broker 的直接调用抛出内部 TypeError。 */
function parseTodoListRequest(input: unknown): WidgetTodoCapabilityResult<WidgetTodoListRequest> {
  if (!isPlainRecord(input) || !hasOnlyPublicKeys(input, ['cursor', 'limit'])) {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '待办列表请求格式无效。')
  }
  if ((input.cursor !== undefined && typeof input.cursor !== 'string')
    || (input.limit !== undefined && typeof input.limit !== 'number')) {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '待办列表请求字段格式无效。')
  }

  const request: WidgetTodoListRequest = {
    ...(typeof input.cursor === 'string' ? { cursor: input.cursor } : {}),
    ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
  }
  const validation = validateWidgetTodoListRequest(request)
  return validation.valid
    ? createTodoCapabilitySuccess(request)
    : createTodoCapabilityFailure(validation.error.code, validation.error.message, validation.error.path)
}

/** 校验创建请求的运行时字段形状后复用 SDK 公开限制，避免宿主动作接收内部字段。 */
function parseTodoCreateInput(input: unknown): WidgetTodoCapabilityResult<WidgetTodoCreateInput> {
  if (!isPlainRecord(input) || !hasOnlyPublicKeys(input, ['text', 'dueDate', 'important']) || typeof input.text !== 'string') {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '创建待办请求格式无效。')
  }
  if ((input.dueDate !== undefined && typeof input.dueDate !== 'string')
    || (input.important !== undefined && typeof input.important !== 'boolean')) {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '创建待办请求字段格式无效。')
  }

  const request: WidgetTodoCreateInput = {
    text: input.text,
    ...(typeof input.dueDate === 'string' ? { dueDate: input.dueDate } : {}),
    ...(typeof input.important === 'boolean' ? { important: input.important } : {}),
  }
  const validation = validateWidgetTodoCreateInput(request)
  return validation.valid
    ? createTodoCapabilitySuccess(request)
    : createTodoCapabilityFailure(validation.error.code, validation.error.message, validation.error.path)
}

/** 校验更新请求的运行时字段形状后复用 SDK 公开限制，null 日期只表示清除公开 dueDate。 */
function parseTodoUpdateInput(input: unknown): WidgetTodoCapabilityResult<WidgetTodoUpdateInput> {
  if (!isPlainRecord(input) || !hasOnlyPublicKeys(input, ['id', 'text', 'completed', 'dueDate', 'important']) || typeof input.id !== 'string') {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '更新待办请求格式无效。')
  }
  if ((input.text !== undefined && typeof input.text !== 'string')
    || (input.completed !== undefined && typeof input.completed !== 'boolean')
    || (input.dueDate !== undefined && input.dueDate !== null && typeof input.dueDate !== 'string')
    || (input.important !== undefined && typeof input.important !== 'boolean')) {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '更新待办请求字段格式无效。')
  }

  const request: WidgetTodoUpdateInput = {
    id: input.id,
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
    ...(typeof input.completed === 'boolean' ? { completed: input.completed } : {}),
    ...(input.dueDate === null || typeof input.dueDate === 'string' ? { dueDate: input.dueDate } : {}),
    ...(typeof input.important === 'boolean' ? { important: input.important } : {}),
  }
  const validation = validateWidgetTodoUpdateInput(request)
  return validation.valid
    ? createTodoCapabilitySuccess(request)
    : createTodoCapabilityFailure(validation.error.code, validation.error.message, validation.error.path)
}

/** 校验删除请求的运行时字段形状后复用 SDK 公开 ID 约束。 */
function parseTodoDeleteInput(input: unknown): WidgetTodoCapabilityResult<WidgetTodoDeleteInput> {
  if (!isPlainRecord(input) || !hasOnlyPublicKeys(input, ['id']) || typeof input.id !== 'string') {
    return createTodoCapabilityFailure('INVALID_ARGUMENT', '删除待办请求格式无效。')
  }

  const request: WidgetTodoDeleteInput = { id: input.id }
  const validation = validateWidgetTodoDeleteInput(request)
  return validation.valid
    ? createTodoCapabilitySuccess(request)
    : createTodoCapabilityFailure(validation.error.code, validation.error.message, validation.error.path)
}

/** 判断给定排序快照在游标之后是否仍有可公开输出的条目，避免虚假的 nextCursor。 */
function hasPublicTodoAfter(todos: readonly TodoItem[], startIndex: number): boolean {
  return todos.slice(startIndex).some((todo) => toWidgetTodo(todo) !== undefined)
}

/**
 * 创建待办领域 Capability；它只依赖注入的 launcher 动作和动态权限读取。
 *
 * 未来 5.6 Broker 需为每个会话提供实时 hasPermission，并把 subscribe 的去抖事件转发为 todoChanged RPC event；
 * 本模块不会创建 Broker、读取 Pinia 或保存授权快照。
 */
export function createWidgetTodoCapability(
  source: WidgetTodoCapabilitySource,
  permissions: WidgetTodoPermissionChecker,
): WidgetTodoCapability {
  /** 在 todos.read 授权下按公开 ID 游标分页，不暴露 listId、order 或原始响应式对象。 */
  function list(input: WidgetTodoListRequest = {}): WidgetTodoCapabilityResult<WidgetTodoListResponse> {
    const permissionFailure = requireTodoPermission(permissions, 'todos.read')
    if (permissionFailure) return permissionFailure

    const parsedInput = parseTodoListRequest(input)
    if (!parsedInput.ok) return parsedInput

    const orderedTodos = getOrderedTodos(source)
    const cursor = parsedInput.value.cursor
    const startIndex = cursor === undefined ? 0 : orderedTodos.findIndex((todo) => todo.id === cursor) + 1
    if (cursor !== undefined && startIndex === 0) {
      return createTodoCapabilityFailure('INVALID_ARGUMENT', '待办分页游标不存在或已失效。', 'cursor')
    }

    const limit = parsedInput.value.limit ?? 100
    const items: WidgetTodo[] = []
    let lastIncludedIndex = -1
    for (let index = startIndex; index < orderedTodos.length && items.length < limit; index += 1) {
      const todo = orderedTodos[index]
      if (!todo) continue
      const publicTodo = toWidgetTodo(todo)
      if (!publicTodo) continue
      items.push(publicTodo)
      lastIncludedIndex = index
    }

    const nextCursor = lastIncludedIndex >= 0 && hasPublicTodoAfter(orderedTodos, lastIncludedIndex + 1)
      ? items.at(-1)?.id
      : undefined
    return createTodoCapabilitySuccess({ items, ...(nextCursor ? { nextCursor } : {}) })
  }

  /** 在 todos.create 授权下校验字段后复用 launcher addTodo，并只返回复制后的公开 DTO。 */
  function create(input: WidgetTodoCreateInput): WidgetTodoCapabilityResult<WidgetTodo> {
    const permissionFailure = requireTodoPermission(permissions, 'todos.create')
    if (permissionFailure) return permissionFailure

    const parsedInput = parseTodoCreateInput(input)
    if (!parsedInput.ok) return parsedInput

    const todo = source.addTodo(parsedInput.value.text, {
      ...(parsedInput.value.dueDate !== undefined ? { date: parsedInput.value.dueDate } : {}),
      ...(parsedInput.value.important !== undefined ? { important: parsedInput.value.important } : {}),
    })
    const publicTodo = todo && toWidgetTodo(todo)
    return publicTodo
      ? createTodoCapabilitySuccess(publicTodo)
      : createTodoCapabilityFailure('INVALID_ARGUMENT', '待办创建未产生有效公开数据。')
  }

  /** 在 todos.update 授权下校验字段与存在性后复用 launcher updateTodo，不暴露领域条目引用。 */
  function update(input: WidgetTodoUpdateInput): WidgetTodoCapabilityResult<WidgetTodo> {
    const permissionFailure = requireTodoPermission(permissions, 'todos.update')
    if (permissionFailure) return permissionFailure

    const parsedInput = parseTodoUpdateInput(input)
    if (!parsedInput.ok) return parsedInput
    if (!source.getTodos().some((todo) => todo.id === parsedInput.value.id)) {
      return createTodoCapabilityFailure('INVALID_ARGUMENT', '待办不存在或已被删除。', 'id')
    }

    const todo = source.updateTodo(parsedInput.value.id, {
      ...(parsedInput.value.text !== undefined ? { text: parsedInput.value.text } : {}),
      ...(parsedInput.value.completed !== undefined ? { done: parsedInput.value.completed } : {}),
      ...(parsedInput.value.dueDate !== undefined ? { date: parsedInput.value.dueDate } : {}),
      ...(parsedInput.value.important !== undefined ? { important: parsedInput.value.important } : {}),
    })
    const publicTodo = todo && toWidgetTodo(todo)
    return publicTodo
      ? createTodoCapabilitySuccess(publicTodo)
      : createTodoCapabilityFailure('INVALID_ARGUMENT', '待办更新未产生有效公开数据。')
  }

  /** 在 todos.delete 授权下校验 ID 与存在性后复用 launcher removeTodo，成功不返回删除前内容。 */
  function remove(input: WidgetTodoDeleteInput): WidgetTodoCapabilityResult<undefined> {
    const permissionFailure = requireTodoPermission(permissions, 'todos.delete')
    if (permissionFailure) return permissionFailure

    const parsedInput = parseTodoDeleteInput(input)
    if (!parsedInput.ok) return parsedInput
    if (!source.getTodos().some((todo) => todo.id === parsedInput.value.id)) {
      return createTodoCapabilityFailure('INVALID_ARGUMENT', '待办不存在或已被删除。', 'id')
    }

    return source.removeTodo(parsedInput.value.id)
      ? createTodoCapabilitySuccess(undefined)
      : createTodoCapabilityFailure('INVALID_ARGUMENT', '待办不存在或已被删除。', 'id')
  }

  /**
   * 在 todos.read 授权下订阅去抖后的最小变化事件；每次投递前重查权限，以支持运行中撤销。
   *
   * 订阅不广播待办正文，且调用者必须在 session 销毁时执行返回的注销函数。
   */
  function subscribe(
    listener: (event: WidgetTodoChangedEvent) => void,
  ): WidgetTodoCapabilityResult<() => void> {
    const permissionFailure = requireTodoPermission(permissions, 'todos.read')
    if (permissionFailure) return permissionFailure

    const latestEvents = new Map<string, WidgetTodoChangedEvent>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribeSource = source.subscribeTodoChanges((event) => {
      if (!permissions.hasPermission('todos.read')) return
      latestEvents.set(event.id, event)
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        const events = [...latestEvents.values()]
        latestEvents.clear()
        for (const changedEvent of events) {
          if (permissions.hasPermission('todos.read')) listener(changedEvent)
        }
      }, 100)
    })

    return createTodoCapabilitySuccess(() => {
      if (timer !== undefined) clearTimeout(timer)
      latestEvents.clear()
      unsubscribeSource()
    })
  }

  return { list, create, update, delete: remove, subscribe }
}
