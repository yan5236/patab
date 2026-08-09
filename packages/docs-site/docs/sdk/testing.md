---
sidebar_position: 6
---

# Mock 宿主（测试）

`@patab/widget-sdk/testing` 子路径（主入口同样导出）提供基于真实 `MessageChannel` 与真实 RPC 协议的 Mock 宿主——测试走的是与生产完全相同的公开协议，不绕过任何契约。

:::note
Mock 宿主只模拟 RPC 行为，**不模拟** ZIP、iframe 沙箱或真实权限授予流程。
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

默认 context：`componentId: 'dev.mock.widget'`、`instanceId: 'mock-instance'`、`surface: 'widget'`、`size: {w:2,h:2}`、`locale: 'zh-CN'`、`theme: 'light'`。

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

`setLocale` / `setSize` / `setTheme` / `setVariant` 会向组件广播对应事件，用于测试事件响应逻辑。

Mock 实现了全部 RPC 方法的行为：权限未授予返回 `PERMISSION_DENIED`、未知方法返回 `UNKNOWN_METHOD`、未配置 network handler 时返回 `ORIGIN_NOT_ALLOWED`、未声明 surface 返回 `SURFACE_NOT_DECLARED`；写操作后会广播对应的 `storageChanged` / `todoChanged` 事件。

## createWidgetMockError

```ts
function createWidgetMockError(code: WidgetErrorCode, message: string): WidgetApiError
```

配合 `network` handler 构造失败响应。

## 示例

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
