---
sidebar_position: 2
---

# WidgetApi 方法

```ts
function createWidgetApi<Permissions extends WidgetPermissionSet = readonly WidgetPermission[]>(
  client: WidgetClient,
): WidgetApi<Permissions>
```

基于已连接的 `WidgetClient` 创建 API v1 模块。每个方法映射到一个稳定 RPC 方法名；**真实授权、配额与副作用全部由宿主 Capability Broker 实时决定**，SDK 不缓存授权结果。

可选的 `Permissions` 泛型只提供编译期提示：显式传入权限集合后，未声明的 `todos.*` 方法在 TypeScript 层变为 `never`；运行时防线不受影响。

## context

```ts
api.context.get(): Promise<WidgetContext>
```

返回当前 surface 的只读上下文快照（字段见 [事件、类型与错误码](./events-and-types.md#widgetcontext)）。

## storage

实例私有键值存储（约束见 [能力](./../guide/capabilities.md#实例存储storage)）：

```ts
api.storage.get(key: string): Promise<WidgetStorageGetResult>          // { found: boolean; value?: WidgetJsonValue }
api.storage.keys(): Promise<WidgetStorageKeysResult>                   // { keys: readonly string[] }
api.storage.set(key: string, value: WidgetJsonValue): Promise<void>
api.storage.remove(key: string): Promise<WidgetStorageRemoveResult>    // { removed: boolean }
api.storage.onChanged(
  listener: (event: { key: string; operation: 'set' | 'remove' }) => void,
): () => void
```

## channel

同实例 surface 间消息：

```ts
api.channel.publish(message: WidgetJsonValue): Promise<void>
api.channel.subscribe(
  listener: (event: WidgetChannelMessageEvent) => void,   // { message: WidgetJsonValue }
): Promise<() => Promise<void>>
```

`subscribe` 先向宿主注册订阅再挂事件监听；返回的退订函数先移除监听再注销订阅。

## ui

```ts
api.ui.toast(message: string): Promise<void>

api.ui.confirm(params: WidgetConfirmParams): Promise<WidgetConfirmResult>
interface WidgetConfirmParams {
  title?: string          // ≤ 120 字符
  message: string         // ≤ 1000 字符
  confirmLabel?: string   // ≤ 40 字符
  cancelLabel?: string    // ≤ 40 字符
}
interface WidgetConfirmResult { confirmed: boolean }   // 取消/ESC/遮罩关闭均为 false

api.ui.openExternal(params: WidgetOpenExternalParams): Promise<WidgetOpenExternalResult>
interface WidgetOpenExternalParams { url: string }     // 仅 HTTPS，≤ 2048 字符，需用户手势
interface WidgetOpenExternalResult { opened: boolean }

api.ui.openSurface(params: WidgetOpenSurfaceParams): Promise<void>
interface WidgetOpenSurfaceParams { surface: 'detail' | 'settings' }

api.ui.closeSurface(): Promise<void>
api.ui.openVariantPicker(): Promise<void>
```

所有 UI 由宿主渲染并标识第三方来源。`openExternal` 被浏览器拦截时返回 `{ opened: false }`。

## todos

需要 Manifest 声明对应权限（见 [Manifest 配置](../guide/manifest.md#permissions可选)）：

```ts
api.todos.list(request?: WidgetTodoListRequest): Promise<WidgetTodoListResponse>   // 需 todos.read
api.todos.create(input: WidgetTodoCreateInput): Promise<WidgetTodo>                // 需 todos.create
api.todos.update(input: WidgetTodoUpdateInput): Promise<WidgetTodo>                // 需 todos.update
api.todos.remove(input: WidgetTodoDeleteInput): Promise<void>                      // 需 todos.delete
api.todos.onChanged(listener: (event: WidgetTodoChangedEvent) => void): () => void // 需 todos.read

interface WidgetTodo {
  id: string
  text: string            // ≤ 500 字符
  completed: boolean
  dueDate?: string        // YYYY-MM-DD（真实存在的日期）
  important: boolean
}

interface WidgetTodoListRequest { cursor?: string; limit?: number }   // limit ≤ 100
interface WidgetTodoListResponse { items: readonly WidgetTodo[]; nextCursor?: string }

interface WidgetTodoCreateInput { text: string; dueDate?: string; important?: boolean }
interface WidgetTodoUpdateInput {
  id: string
  text?: string
  completed?: boolean
  dueDate?: string | null   // null = 显式清除截止日期
  important?: boolean
}
interface WidgetTodoDeleteInput { id: string }
interface WidgetTodoChangedEvent { change: 'created' | 'updated' | 'deleted'; id: string }
```

## network

```ts
api.network.fetch(request: WidgetNetworkRequest): Promise<WidgetNetworkResponse>

interface WidgetNetworkRequest {
  url: string                                  // HTTPS，origin 已在 Manifest 声明并获授权
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>             // ≤ 32 个；禁 cookie/host/origin/referer 与 proxy-/sec- 前缀
  body?: string                                // ≤ 1 MiB
}
interface WidgetNetworkResponse {
  status: number                               // 100–599
  headers: Record<string, string>              // 仅白名单响应头
  body: string                                 // ≤ 2 MiB
}
```

无 Cookie、无 referrer、拒绝重定向、10 秒超时、单实例并发 4。完整约束见 [能力：受控网络](../guide/capabilities.md#受控网络networkfetch)。

## on

统一事件订阅（全部 8 个事件及载荷见 [事件、类型与错误码](./events-and-types.md)）：

```ts
api.on<TPayload>(event: WidgetEventName, listener: (payload: TPayload) => void): () => void
```

## onWidgetThemeChanged

```ts
function onWidgetThemeChanged(
  client: WidgetClient,
  listener: (event: WidgetThemeChangedEvent) => void,
): () => void
```

订阅 `themeChanged` 的具名辅助函数，与 `api.on('themeChanged', listener)` 等价。
