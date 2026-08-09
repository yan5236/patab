---
sidebar_position: 3
---

# 运行时与生命周期

## 启动与握手

每个 surface 启动后的第一件事是连接宿主：

```ts
import { connectPatabWidgetClient, createWidgetApi } from '@patab/widget-sdk'

const client = await connectPatabWidgetClient()
const api = createWidgetApi(client)
```

关键行为：

- 通信**不走 `window.postMessage`**。宿主在 iframe 加载后完成两段握手，把一个 `MessagePort` 与一次性会话 ID 写入 sandbox 文档的全局（`__PATAB_WIDGET_PORT__`、`__PATAB_WIDGET_SESSION_ID__`），SDK 只接受这个已转移的端口，之后一切 API 调用都在端口上进行。
- `connectPatabWidgetClient()` 在端口就绪后 resolve；默认等待 **5 秒**（`WIDGET_CLIENT_CONNECT_TIMEOUT_MS`），超时 reject `WidgetClientError('CLIENT_CONNECT_TIMEOUT')`。
- 宿主侧同样要求 surface 在 **5 秒内完成握手**，否则判定启动失败并销毁 iframe；24 小时内连续 3 次启动失败会自动停用该实例。
- SDK 没有 `mount`/`destroy`/`ready` 之类的生命周期钩子——「就绪」就是 `connectPatabWidgetClient()` resolve，卸载清理由 `client.close()` 承担（幂等，会拒绝所有挂起请求并清空事件监听）。

## 上下文（WidgetContext）

```ts
const context = await api.context.get()
```

`context.get()` 返回当前 surface 的只读快照（每次调用返回副本）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `componentId` | string | Manifest `id` |
| `instanceId` | string | 实例 ID（同一组件可被多次添加到网格，每次一个独立实例） |
| `componentVersion` | string | 当前运行版本的 SemVer |
| `apiVersion` | `1` | RPC API 主版本 |
| `surface` | string | 当前 surface 名（如 `widget`/`detail`/`settings`） |
| `size` | TileSize | 当前图块尺寸 |
| `variantId` | string? | 当前 variant；未使用时为 `undefined` |
| `locale` | `'zh-CN' \| 'en-US'` | 宿主当前语言 |
| `theme` | `'light' \| 'dark'` | 宿主当前主题 |
| `reducedMotion` | boolean | 用户是否偏好减少动画 |
| `visible` | boolean | 当前 surface 是否可见 |
| `permissions` | PermissionSnapshot | `{ granted: Permission[], networkOrigins: string[] }`，握手时刻的权限快照 |

:::caution
`permissions` 是快照而非实时授权。即使用户随后撤销权限，快照不会变——但宿主 Broker 每次调用都会实时重查授权，被撤销后的下一次调用会立即得到 `PERMISSION_DENIED`。组件应对关键调用做好错误处理。
:::

## Surface 模型

- **`widget` surface** 运行在网格图块中；`1×1` 尺寸只渲染图标和名称，不执行任何组件代码。
- **`detail` / `settings` surface** 是宿主渲染外壳的弹层（modal），由组件显式请求打开：

```ts
await api.ui.openSurface({ surface: 'detail' })   // 或 'settings'
await api.ui.closeSurface()                        // 在弹层 surface 内关闭自己
```

弹层外壳（标题、第三方来源标识、焦点管理、ESC 关闭）由宿主负责。同一实例同时只允许一个弹层，重复打开会返回 `SURFACE_LIMIT_REACHED`；未在 Manifest 声明的 surface 会返回 `SURFACE_NOT_DECLARED`。

## Variants

若 Manifest 声明了 `variants`，用户可通过宿主原生选择器切换。组件不能自己切换 variant，只能：

- 通过 `context.variantId` 读取当前值
- 订阅 `variantChanged` 事件响应变化
- 调用 `api.ui.openVariantPicker()` 请宿主打开选择器

## 可见性与尺寸

- 页面切换或标签页隐藏时，宿主广播 `visibilityChanged`。**隐藏不会销毁实例存储或 MessagePort 会话**，surface 恢复可见后继续运行。
- 用户调整图块尺寸时广播 `sizeChanged`（携带 `previousSize` 与新 `size`）。

## 事件一览

全部 8 个事件都可通过 `api.on(name, listener)` 订阅，返回退订函数：

| 事件 | 载荷要点 |
|---|---|
| `themeChanged` | `{ theme, reducedMotion, tokens? }` |
| `localeChanged` | `{ locale }` |
| `sizeChanged` | `{ previousSize, size }` |
| `variantChanged` | `{ previousVariantId?, variantId? }` |
| `visibilityChanged` | `{ visible }` |
| `storageChanged` | `{ key, operation }`（刻意不含 value） |
| `channelMessage` | `{ message }` |
| `todoChanged` | `{ change, id }` |

完整载荷类型与订阅示例见 [事件、类型与错误码](../sdk/events-and-types.md)。

## 错误处理约定

- 宿主 API 失败 reject `WidgetApiRequestError`，其 `apiError` 为 `{ code, message, path? }`——`code` 是 19 个稳定错误码之一，**绝不**包含宿主内部异常或堆栈。
- SDK 本地故障（未连接、超时、已关闭）reject `WidgetClientError`，`code` 为 `CLIENT_UNAVAILABLE | CLIENT_CONNECT_TIMEOUT | CLIENT_REQUEST_TIMEOUT | CLIENT_CLOSED`。
- 单个请求默认 12 秒超时（`WIDGET_CLIENT_REQUEST_TIMEOUT_MS`，可在连接时通过 `requestTimeoutMs` 覆盖）。

```ts
try {
  await api.todos.list()
} catch (error) {
  if (error instanceof WidgetApiRequestError && error.apiError.code === 'PERMISSION_DENIED') {
    // 权限被撤销，降级为本地展示
  }
}
```
