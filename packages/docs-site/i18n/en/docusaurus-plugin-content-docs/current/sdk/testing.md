---
sidebar_position: 6
---

# Mock Host (Testing)

The `@patab/widget-sdk/testing` subpath (also exported from the main entry) provides a mock host built on a real `MessageChannel` and the real RPC protocol — tests go through exactly the same public protocol as production, without bypassing any contract.

:::note
The mock host only simulates RPC behavior; it does **not** simulate ZIP packaging, the iframe sandbox, or the real permission-granting flow.
:::

## createWidgetMockHost

```ts
function createWidgetMockHost(options?: WidgetMockOptions): WidgetMockHost

interface WidgetMockOptions {
  context?: Partial<WidgetContext>                  // 覆盖默认 context
  permissions?: readonly WidgetPermission[]          // 已授予权限（默认空）
  storage?: Record<string, WidgetJsonValue>          // 初始实例存储
  todos?: readonly WidgetTodo[]                      // 初始待办数据
  network?: WidgetMockNetworkHandler                 // network.fetch 的处理函数
  confirm?: boolean | ((params: { title?: string; message: string }) => boolean | Promise<boolean>)
  onToast?: (message: string) => void
}

type WidgetMockNetworkHandler = (
  request: WidgetNetworkRequest,
) => WidgetNetworkResponse | WidgetApiError | Promise<WidgetNetworkResponse | WidgetApiError>
```

Default context: `componentId: 'dev.mock.widget'`, `instanceId: 'mock-instance'`, `surface: 'widget'`, `size: {w:2,h:2}`, `locale: 'zh-CN'`, `theme: 'light'`.

## WidgetMockHost

```ts
interface WidgetMockHost {
  client: WidgetClient            // 已连接的真实客户端（sessionId 固定 'mock-session'）
  api: WidgetApi                  // createWidgetApi(client)
  getStorage(): Record<string, WidgetJsonValue>
  getOpenedSurface(): 'detail' | 'settings' | undefined
  emitTodoChanged(event: WidgetTodoChangedEvent): void
  setLocale(locale: 'zh-CN' | 'en-US'): void
  setSize(size: WidgetTileSize): void
  setTheme(event: WidgetThemeChangedEvent): void
  setVariant(variantId?: string): void
  close(): void
}
```

`setLocale` / `setSize` / `setTheme` / `setVariant` broadcast the corresponding events to the widget, for testing event-response logic.

The mock implements the behavior of all RPC methods: ungranted permissions return `PERMISSION_DENIED`, unknown methods return `UNKNOWN_METHOD`, an unconfigured network handler returns `ORIGIN_NOT_ALLOWED`, and an undeclared surface returns `SURFACE_NOT_DECLARED`; write operations broadcast the corresponding `storageChanged` / `todoChanged` events.

## createWidgetMockError

```ts
function createWidgetMockError(code: WidgetErrorCode, message: string): WidgetApiError
```

Used together with the `network` handler to construct failure responses.

## Example

```ts
import { expect, it } from 'vitest'
import { createWidgetMockHost } from '@patab/widget-sdk/testing'

it('读取 Mock 存储', async () => {
  const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } })
  await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' })
  host.close()
})

it('无权限时拒绝读取待办', async () => {
  const host = createWidgetMockHost()   // 默认无权限
  await expect(host.api.todos.list()).rejects.toMatchObject({
    apiError: { code: 'PERMISSION_DENIED' },
  })
  host.close()
})
```
