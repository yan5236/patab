---
sidebar_position: 2
---

# WidgetApi Methods

```ts
function createWidgetApi<Permissions extends WidgetPermissionSet = readonly WidgetPermission[]>(
  client: WidgetClient,
): WidgetApi<Permissions>
```

Creates an API v1 module on top of a connected `WidgetClient`. Each method maps to a stable RPC method name; **all real authorization, quotas, and side effects are decided live by the host Capability Broker** — the SDK does not cache authorization results.

The optional `Permissions` generic only provides compile-time hints: once a permission set is passed explicitly, undeclared `todos.*` methods become `never` at the TypeScript level; the runtime defenses are unaffected.

## context

```ts
api.context.get(): Promise<WidgetContext>
```

Returns a read-only snapshot of the current surface's context (see [Events, Types, and Error Codes](./events-and-types.md#widgetcontext) for the fields).

## storage

Instance-private key-value storage (see [Capabilities](./../guide/capabilities.md#instance-storage-storage) for the constraints):

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

Messaging between surfaces of the same instance:

```ts
api.channel.publish(message: WidgetJsonValue): Promise<void>
api.channel.subscribe(
  listener: (event: WidgetChannelMessageEvent) => void,   // { message: WidgetJsonValue }
): Promise<() => Promise<void>>
```

`subscribe` first registers the subscription with the host and then attaches the event listener; the returned unsubscribe function removes the listener first and then unregisters the subscription.

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

All UI is rendered by the host and labeled as third-party content. `openExternal` returns `{ opened: false }` when blocked by the browser.

## todos

Requires the corresponding permissions declared in the Manifest (see [Manifest Configuration](../guide/manifest.md#permissions-optional)):

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

No cookies, no referrer, redirects refused, 10-second timeout, 4 concurrent requests per instance. For the full constraints, see [Capabilities: Controlled Network](../guide/capabilities.md#controlled-network-networkfetch).

## on

Unified event subscription (see [Events, Types, and Error Codes](./events-and-types.md) for all 8 events and their payloads):

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

A named helper for subscribing to `themeChanged`, equivalent to `api.on('themeChanged', listener)`.
