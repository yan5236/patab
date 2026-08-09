import type { WidgetClient } from './client.js'
import type {
  WidgetChannelMessageEvent,
  WidgetConfirmParams,
  WidgetConfirmResult,
  WidgetContext,
  WidgetEventName,
  WidgetJsonValue,
  WidgetOpenExternalParams,
  WidgetOpenExternalResult,
  WidgetOpenSurfaceParams,
  WidgetPermission,
  WidgetStorageGetResult,
  WidgetStorageKeysResult,
  WidgetStorageRemoveResult,
  WidgetThemeChangedEvent,
  WidgetTodo,
  WidgetTodoChangedEvent,
  WidgetTodoCreateInput,
  WidgetTodoDeleteInput,
  WidgetTodoListRequest,
  WidgetTodoListResponse,
  WidgetTodoUpdateInput,
  WidgetNetworkRequest,
  WidgetNetworkResponse,
} from './index.js'

/** 表示 Manifest 可声明的一组权限；泛型只提供编译期提示，运行时授权仍永远由 Broker 实时判断。 */
export type WidgetPermissionSet = readonly WidgetPermission[]

/** 判断权限集合是否显式包含某项权限，为 todos 的类型级最小可见面服务。 */
type HasPermission<Permissions extends WidgetPermissionSet, Permission extends WidgetPermission> = Permission extends Permissions[number]
  ? true
  : false

/** 根据显式权限集合决定一个方法是否在 TypeScript 层可用；未指定泛型时保留全 API 以支持动态 Manifest。 */
type PermittedMethod<Permissions extends WidgetPermissionSet, Permission extends WidgetPermission, Method> =
  number extends Permissions['length'] ? Method : HasPermission<Permissions, Permission> extends true ? Method : never

/** 公开 storage API；实例范围由 MessagePort 会话派生，调用者永远不传 componentId 或 instanceId。 */
export interface WidgetStorageApi {
  readonly get: (key: string) => Promise<WidgetStorageGetResult>
  readonly keys: () => Promise<WidgetStorageKeysResult>
  readonly set: (key: string, value: WidgetJsonValue) => Promise<void>
  readonly remove: (key: string) => Promise<WidgetStorageRemoveResult>
  readonly onChanged: (listener: (event: { readonly key: string; readonly operation: 'set' | 'remove' }) => void) => () => void
}

/** 公开同实例通道 API；订阅请求与事件监听分开清理，避免 modal 关闭后留下 listener。 */
export interface WidgetChannelApi {
  readonly publish: (message: WidgetJsonValue) => Promise<void>
  readonly subscribe: (listener: (event: WidgetChannelMessageEvent) => void) => Promise<() => Promise<void>>
}

/** 公开宿主 UI API；所有界面仍由 PaTab 渲染并附带第三方来源标识。 */
export interface WidgetUiApi {
  readonly toast: (message: string) => Promise<void>
  readonly confirm: (params: WidgetConfirmParams) => Promise<WidgetConfirmResult>
  readonly openExternal: (params: WidgetOpenExternalParams) => Promise<WidgetOpenExternalResult>
  readonly openSurface: (params: WidgetOpenSurfaceParams) => Promise<void>
  readonly closeSurface: () => Promise<void>
  readonly openVariantPicker: () => Promise<void>
}

/** 公开网络 API；URL、请求头和响应的安全边界统一复用 SDK contracts 与宿主 Broker。 */
export interface WidgetNetworkApi {
  readonly fetch: (request: WidgetNetworkRequest) => Promise<WidgetNetworkResponse>
}

/** 根据显式 Manifest 权限细化后的待办 API；未获某项权限的方法在类型层不可调用，运行时仍保留 Broker 防线。 */
export interface WidgetTodosApi<Permissions extends WidgetPermissionSet> {
  readonly list: PermittedMethod<Permissions, 'todos.read', (request?: WidgetTodoListRequest) => Promise<WidgetTodoListResponse>>
  readonly create: PermittedMethod<Permissions, 'todos.create', (input: WidgetTodoCreateInput) => Promise<WidgetTodo>>
  readonly update: PermittedMethod<Permissions, 'todos.update', (input: WidgetTodoUpdateInput) => Promise<WidgetTodo>>
  readonly remove: PermittedMethod<Permissions, 'todos.delete', (input: WidgetTodoDeleteInput) => Promise<void>>
  readonly onChanged: PermittedMethod<Permissions, 'todos.read', (listener: (event: WidgetTodoChangedEvent) => void) => () => void>
}

/** 汇总组件开发者可调用的 API v1 模块，并提供统一生命周期事件订阅。 */
export interface WidgetApi<Permissions extends WidgetPermissionSet = readonly WidgetPermission[]> {
  readonly context: { readonly get: () => Promise<WidgetContext> }
  readonly storage: WidgetStorageApi
  readonly channel: WidgetChannelApi
  readonly ui: WidgetUiApi
  readonly todos: WidgetTodosApi<Permissions>
  readonly network: WidgetNetworkApi
  readonly on: <TPayload>(event: WidgetEventName, listener: (payload: TPayload) => void) => () => void
}

/** 将 event listener 的绑定集中为 SDK 公开 API，避免每个模块手写相同的 client.subscribe 调用。 */
function subscribeEvent<TPayload>(client: WidgetClient, event: WidgetEventName, listener: (payload: TPayload) => void): () => void {
  return client.subscribe(event, listener)
}

/**
 * 基于已连接的 WidgetClient 创建 API v1 模块。
 *
 * 此函数只把类型安全的公开方法映射到稳定 RPC 方法名，不复制权限、Schema、配额或错误码；所有真实授权和副作用仍由唯一 Capability Broker 决定。
 */
export function createWidgetApi<Permissions extends WidgetPermissionSet = readonly WidgetPermission[]>(client: WidgetClient): WidgetApi<Permissions> {
  const storage: WidgetStorageApi = {
    get: (key) => client.request<WidgetStorageGetResult>('storage.get', { key }),
    keys: () => client.request<WidgetStorageKeysResult>('storage.keys', {}),
    set: async (key, value) => { await client.request('storage.set', { key, value }) },
    remove: (key) => client.request<WidgetStorageRemoveResult>('storage.remove', { key }),
    onChanged: (listener) => subscribeEvent(client, 'storageChanged', listener),
  }
  const channel: WidgetChannelApi = {
    publish: async (message) => { await client.request('channel.publish', { message }) },
    async subscribe(listener) {
      await client.request('channel.subscribe', {})
      const unsubscribeEvent = subscribeEvent(client, 'channelMessage', listener)
      return async () => {
        unsubscribeEvent()
        await client.request('channel.unsubscribe', {})
      }
    },
  }
  const ui: WidgetUiApi = {
    toast: async (message) => { await client.request('ui.toast', { message }) },
    confirm: (params) => client.request<WidgetConfirmResult>('ui.confirm', params),
    openExternal: (params) => client.request<WidgetOpenExternalResult>('ui.openExternal', params),
    openSurface: async (params) => { await client.request('ui.openSurface', params) },
    closeSurface: async () => { await client.request('ui.closeSurface', {}) },
    openVariantPicker: async () => { await client.request('ui.openVariantPicker', {}) },
  }
  const todos: WidgetTodosApi<Permissions> = {
    list: ((request: WidgetTodoListRequest = {}) => client.request<WidgetTodoListResponse>('todos.list', request)) as WidgetTodosApi<Permissions>['list'],
    create: ((input: WidgetTodoCreateInput) => client.request<WidgetTodo>('todos.create', input)) as WidgetTodosApi<Permissions>['create'],
    update: ((input: WidgetTodoUpdateInput) => client.request<WidgetTodo>('todos.update', input)) as WidgetTodosApi<Permissions>['update'],
    remove: (async (input: WidgetTodoDeleteInput) => { await client.request('todos.delete', input) }) as WidgetTodosApi<Permissions>['remove'],
    onChanged: ((listener: (event: WidgetTodoChangedEvent) => void) => subscribeEvent(client, 'todoChanged', listener)) as WidgetTodosApi<Permissions>['onChanged'],
  }

  return {
    context: { get: () => client.request<WidgetContext>('context.get', {}) },
    storage,
    channel,
    ui,
    todos,
    network: { fetch: (request) => client.request<WidgetNetworkResponse>('network.fetch', request) },
    on: (event, listener) => subscribeEvent(client, event, listener),
  }
}

/** 将主题事件公开为具名辅助函数，便于组件只在关心颜色和动效时订阅精确载荷。 */
export function onWidgetThemeChanged(client: WidgetClient, listener: (event: WidgetThemeChangedEvent) => void): () => void {
  return subscribeEvent(client, 'themeChanged', listener)
}
