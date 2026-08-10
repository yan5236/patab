import { createWidgetApi, type WidgetApi } from './api.js'
import { WidgetClient } from './client.js'
import {
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  type WidgetApiError,
  type WidgetContext,
  type WidgetEvent,
  type WidgetJsonValue,
  type WidgetNetworkRequest,
  type WidgetNetworkResponse,
  type WidgetPermission,
  type WidgetThemeChangedEvent,
  type WidgetTileSize,
  type WidgetTodo,
  type WidgetTodoChangedEvent,
} from './index.js'

/** 测试 Mock 的可配置网络实现；抛出的错误会统一转换成公开 WidgetApiError。 */
export type WidgetMockNetworkHandler = (request: WidgetNetworkRequest) => WidgetNetworkResponse | WidgetApiError | Promise<WidgetNetworkResponse | WidgetApiError>

/** 创建 SDK Mock 时可传入的公开状态，不接受 PaTab Store、DOM 或任何内部宿主对象。 */
export interface WidgetMockOptions {
  readonly context?: Partial<WidgetContext>
  readonly permissions?: readonly WidgetPermission[]
  readonly storage?: Readonly<Record<string, WidgetJsonValue>>
  readonly todos?: readonly WidgetTodo[]
  readonly network?: WidgetMockNetworkHandler
  readonly confirm?: boolean | ((params: { readonly title?: string; readonly message: string }) => boolean | Promise<boolean>)
  readonly onToast?: (message: string) => void
}

/** 测试组件可用的 Mock 控制器；它通过真实 MessageChannel 与 SDK 通讯，而不是绕过公开 RPC。 */
export interface WidgetMockHost {
  readonly client: WidgetClient
  readonly api: WidgetApi
  getStorage(): Readonly<Record<string, WidgetJsonValue>>
  getOpenedSurface(): 'detail' | 'settings' | undefined
  emitTodoChanged(event: WidgetTodoChangedEvent): void
  setLocale(locale: 'zh-CN' | 'en-US'): void
  setSize(size: WidgetTileSize): void
  setTheme(event: WidgetThemeChangedEvent): void
  setVariant(variantId?: string): void
  close(): void
}

/** 构造 API v1 Mock 的稳定错误，方便测试精确断言而不创建宿主异常替身。 */
export function createWidgetMockError(code: WidgetApiError['code'], message: string): WidgetApiError {
  return { code, message }
}

/** 复制 JSON 值，防止测试代码在调用后改动对象绕过真实跨 MessagePort 的结构化克隆语义。 */
function cloneJson<T extends WidgetJsonValue>(value: T): T {
  return structuredClone(value) as T
}

/** 创建默认 context，确保 Mock 与真实 SDK context.get 使用完整的公开 API v1 字段。 */
function createMockContext(partial: Partial<WidgetContext> | undefined, permissions: readonly WidgetPermission[]): WidgetContext {
  const base: WidgetContext = {
    componentId: 'dev.mock.widget',
    instanceId: 'mock-instance',
    componentVersion: '1.0.0',
    apiVersion: 1,
    surface: 'widget',
    size: { w: 2, h: 2 },
    locale: 'zh-CN',
    theme: 'light',
    reducedMotion: false,
    visible: true,
    permissions: { granted: permissions, networkOrigins: [] },
  }
  return {
    ...base,
    ...partial,
    size: partial?.size ? { ...partial.size } : base.size,
    permissions: {
      granted: [...(partial?.permissions?.granted ?? permissions)],
      networkOrigins: [...(partial?.permissions?.networkOrigins ?? [])],
    },
  }
}

/** 判断调用所需权限是否已授予；Mock 复用真实权限字符串而不接受任意自定义能力名。 */
function hasPermission(permissions: ReadonlySet<WidgetPermission>, permission: WidgetPermission): boolean {
  return permissions.has(permission)
}

/** 从简单参数对象中安全读取非空字符串键，Mock 只需模拟公开值而不承载宿主层校验实现。 */
function getStringParam(params: unknown, key: string): string | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined
  const value = (params as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/** 将 Mock 方法结果转为与 Capability Broker 相同的成功或失败响应，避免测试直接访问内存状态。 */
function createMockResponse(requestId: string, result?: unknown, error?: WidgetApiError): unknown {
  return error ? { requestId, ok: false, error } : { requestId, ok: true, ...(result === undefined ? {} : { result }) }
}

/**
 * 创建用于组件单元测试的内存 Host。
 *
 * Mock 复用 MessageChannel、公开 request/response/event DTO 和错误码；它不模拟 ZIP、iframe 或真实权限授予，真实 PaTab 重新导入仍是集成验收。
 */
export function createWidgetMockHost(options: WidgetMockOptions = {}): WidgetMockHost {
  const channel = new MessageChannel()
  const sessionId = 'mock-session'
  const permissions = new Set<WidgetPermission>(options.permissions ?? [])
  const storage = new Map<string, WidgetJsonValue>(Object.entries(options.storage ?? {}))
  const todos = new Map<string, WidgetTodo>((options.todos ?? []).map((todo) => [todo.id, { ...todo }]))
  let context = createMockContext(options.context, [...permissions])
  let openedSurface: 'detail' | 'settings' | undefined

  /** 发送一个经过同一会话标识包装的公开生命周期或领域事件。 */
  function sendEvent<TPayload>(event: WidgetEvent<TPayload>): void {
    channel.port1.postMessage(event)
  }

  /** 统一构造 Mock 事件，保证测试组件只能观察正式 SDK contracts 中允许的载荷。 */
  function emit<TPayload>(event: WidgetEvent<TPayload>['event'], payload: TPayload): void {
    sendEvent({ protocol: WIDGET_RPC_PROTOCOL, apiVersion: WIDGET_RPC_API_VERSION, sessionId, event, payload })
  }

  /** 处理组件发出的单个 SDK 请求，并把最小公开行为写回模拟端口。 */
  channel.port1.onmessage = (messageEvent) => {
    void (async () => {
      const request = messageEvent.data as { requestId?: unknown; method?: unknown; params?: unknown }
      if (typeof request.requestId !== 'string' || typeof request.method !== 'string') return
      let result: unknown
      let error: WidgetApiError | undefined
      const key = getStringParam(request.params, 'key')

      if (request.method === 'context.get') result = structuredClone(context)
      else if (request.method === 'storage.get' && key) result = storage.has(key) ? { found: true, value: cloneJson(storage.get(key)!) } : { found: false }
      else if (request.method === 'storage.keys') result = { keys: [...storage.keys()].sort() }
      else if (request.method === 'storage.set' && key) {
        const value = request.params && typeof request.params === 'object' ? (request.params as Record<string, unknown>).value : undefined
        storage.set(key, cloneJson(value as WidgetJsonValue))
        emit('storageChanged', { key, operation: 'set' })
      } else if (request.method === 'storage.remove' && key) {
        const removed = storage.delete(key)
        if (removed) emit('storageChanged', { key, operation: 'remove' })
        result = { removed }
      } else if (request.method === 'channel.publish') {
        const message = request.params && typeof request.params === 'object' ? (request.params as Record<string, unknown>).message : undefined
        emit('channelMessage', { message: cloneJson(message as WidgetJsonValue) })
      } else if (request.method === 'channel.subscribe' || request.method === 'channel.unsubscribe') result = undefined
      else if (request.method === 'ui.toast') options.onToast?.(getStringParam(request.params, 'message') ?? '')
      else if (request.method === 'ui.confirm') {
        const params = request.params as { title?: string; message?: string }
        const confirmed = typeof options.confirm === 'function'
          ? await options.confirm({ ...(params?.title ? { title: params.title } : {}), message: params?.message ?? '' })
          : options.confirm ?? false
        result = { confirmed }
      } else if (request.method === 'ui.openSurface') {
        const surface = getStringParam(request.params, 'surface')
        if (surface === 'detail' || surface === 'settings') openedSurface = surface
        else error = createWidgetMockError('SURFACE_NOT_DECLARED', '请求的 surface 未声明。')
      } else if (request.method === 'ui.closeSurface') openedSurface = undefined
      else if (request.method === 'ui.openExternal') result = { opened: false }
      else if (request.method === 'ui.openVariantPicker') result = undefined
      else if (request.method === 'network.fetch') {
        if (!options.network) error = createWidgetMockError('ORIGIN_NOT_ALLOWED', 'Mock 未配置网络来源。')
        else {
          const networkResult = await options.network(request.params as WidgetNetworkRequest)
          if ('code' in networkResult) error = networkResult
          else result = networkResult
        }
      } else if (request.method === 'todos.list') {
        error = hasPermission(permissions, 'todos.read') ? undefined : createWidgetMockError('PERMISSION_DENIED', 'Mock 未授予 todos.read。')
        result = error ? undefined : { items: [...todos.values()].map((todo) => ({ ...todo })) }
      } else if (request.method === 'todos.create') {
        error = hasPermission(permissions, 'todos.create') ? undefined : createWidgetMockError('PERMISSION_DENIED', 'Mock 未授予 todos.create。')
        if (!error) {
          const input = request.params as Pick<WidgetTodo, 'text' | 'important'> & { dueDate?: string }
          const todo: WidgetTodo = { id: `mock-${todos.size + 1}`, text: input.text, important: input.important ?? false, completed: false, ...(input.dueDate ? { dueDate: input.dueDate } : {}) }
          todos.set(todo.id, todo)
          result = { ...todo }
          emit('todoChanged', { change: 'created', id: todo.id })
        }
      } else if (request.method === 'todos.update' || request.method === 'todos.delete') {
        const required = request.method === 'todos.update' ? 'todos.update' : 'todos.delete'
        error = hasPermission(permissions, required) ? undefined : createWidgetMockError('PERMISSION_DENIED', `Mock 未授予 ${required}。`)
        const id = getStringParam(request.params, 'id')
        if (!error && (!id || !todos.has(id))) error = createWidgetMockError('INVALID_ARGUMENT', '待办不存在。')
        if (!error && id && request.method === 'todos.delete') {
          todos.delete(id)
          emit('todoChanged', { change: 'deleted', id })
        } else if (!error && id) {
          const patch = request.params as Partial<WidgetTodo>
          const todo = { ...todos.get(id)!, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.completed !== undefined ? { completed: patch.completed } : {}), ...(patch.important !== undefined ? { important: patch.important } : {}) }
          todos.set(id, todo)
          result = todo
          emit('todoChanged', { change: 'updated', id })
        }
      } else error = createWidgetMockError('UNKNOWN_METHOD', 'Mock 不支持该 API 方法。')
      channel.port1.postMessage(createMockResponse(request.requestId, result, error))
    })()
  }
  channel.port1.start()

  const client = new WidgetClient({ port: channel.port2, sessionId })
  const api = createWidgetApi(client)
  return {
    client,
    api,
    getStorage: () => Object.fromEntries([...storage.entries()].map(([key, value]) => [key, cloneJson(value)])),
    getOpenedSurface: () => openedSurface,
    emitTodoChanged: (event) => emit('todoChanged', event),
    setLocale: (locale) => {
      context = { ...context, locale }
      emit('localeChanged', { locale })
    },
    setSize: (size) => {
      const previousSize = context.size
      context = { ...context, size: { ...size } }
      emit('sizeChanged', { previousSize, size: { ...size } })
    },
    setTheme: (event) => {
      context = { ...context, theme: event.theme, reducedMotion: event.reducedMotion }
      emit('themeChanged', event)
    },
    setVariant: (variantId) => {
      const previousVariantId = context.variantId
      context = { ...context, ...(variantId ? { variantId } : {}) }
      if (!variantId) delete (context as { variantId?: string }).variantId
      emit('variantChanged', { ...(previousVariantId ? { previousVariantId } : {}), ...(variantId ? { variantId } : {}) })
    },
    close: () => client.close(),
  }
}
