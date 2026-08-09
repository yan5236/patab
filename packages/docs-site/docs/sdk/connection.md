---
sidebar_position: 1
---

# 连接与客户端

`@patab/widget-sdk`（v1.0.0）是纯 ESM 包，提供子路径导出：

| 导入路径 | 内容 |
|---|---|
| `@patab/widget-sdk` | 主入口：全部导出（含 client、api、testing） |
| `@patab/widget-sdk/client` | `WidgetClient`、`connectPatabWidgetClient`、错误类 |
| `@patab/widget-sdk/api` | `createWidgetApi`、`onWidgetThemeChanged` 与 API 类型 |
| `@patab/widget-sdk/contracts` | 纯契约子集（类型、常量、校验器），不含 client/api/testing |
| `@patab/widget-sdk/schema` | `PATAB_WIDGET_MANIFEST_V1_SCHEMA`（Manifest JSON Schema） |
| `@patab/widget-sdk/testing` | Mock 宿主（`createWidgetMockHost` 等） |
| `@patab/widget-sdk/theme.css` | 主题语义类样式表 |

SDK 元数据：

```ts
import { WIDGET_SDK_METADATA } from '@patab/widget-sdk'
// { packageName: '@patab/widget-sdk', sdkVersion: '1.0.0', supportedApiMajor: 1 }
```

## connectPatabWidgetClient

```ts
function connectPatabWidgetClient(options?: WidgetClientConnectOptions): Promise<WidgetClient>

interface WidgetClientConnectOptions {
  target?: Window              // 默认当前 window
  timeoutMs?: number           // 等待端口就绪的超时，默认 5000
  requestTimeoutMs?: number    // 单请求超时，默认 12000
  createRequestId?: () => string  // 自定义请求 ID 生成器
}
```

宿主在 iframe 握手完成后，把 `MessagePort` 与一次性 `sessionId` 写入 sandbox 文档的全局，并派发同文档事件通知 SDK。`connectPatabWidgetClient` 读取到端口后 resolve；超时 reject `WidgetClientError('CLIENT_CONNECT_TIMEOUT')`；在无 `window` 的环境 reject `CLIENT_UNAVAILABLE`。

组件代码通常不需要关心握手细节——在 surface 顶部 `await connectPatabWidgetClient()` 即可。

## WidgetClient

```ts
class WidgetClient {
  constructor(options: WidgetClientOptions)
  get sessionId(): string
  request<TResult>(method: string, params: unknown): Promise<TResult>
  subscribe<TPayload>(event: WidgetEventName, listener: (payload: TPayload) => void): () => void
  close(): void
}

interface WidgetClientOptions {
  port: MessagePort
  sessionId: string
  requestTimeoutMs?: number
  createRequestId?: () => string
}
```

- `sessionId`：本会话一次性标识。**不应**把它发送到任何外部服务。
- `request`：发送 RPC 请求并等待响应。响应失败时 reject `WidgetApiRequestError`；超时（默认 12 秒，`WIDGET_CLIENT_REQUEST_TIMEOUT_MS`）reject `WidgetClientError('CLIENT_REQUEST_TIMEOUT')`。
- `subscribe`：订阅宿主事件，返回退订函数。单个 listener 抛错不会影响其它 listener。
- `close()`：幂等。拒绝所有挂起请求（`CLIENT_CLOSED`）、清空监听器并关闭端口。

绝大多数代码不直接使用 `WidgetClient`，而是包一层 [createWidgetApi](./api.md)。

## 错误类型

```ts
class WidgetClientError extends Error {
  readonly code: 'CLIENT_CLOSED' | 'CLIENT_CONNECT_TIMEOUT' | 'CLIENT_REQUEST_TIMEOUT' | 'CLIENT_UNAVAILABLE'
}

class WidgetApiRequestError extends Error {
  readonly apiError: WidgetApiError   // { code: WidgetErrorCode; message: string; path?: string }
}
```

- `WidgetClientError`：SDK 本地端口生命周期故障（未连接、超时、已关闭）。
- `WidgetApiRequestError`：宿主 Broker 返回的 API 失败。`apiError.code` 是 19 个[稳定错误码](./events-and-types.md#错误码)之一；`path` 只指向公开 DTO 字段。**绝不**包装或暴露宿主内部异常。

## RPC 协议（信息参考）

开发者一般不直接接触协议层，以下供调试参考：

- 协议常量：`WIDGET_RPC_PROTOCOL = 'patab-widget'`，`WIDGET_RPC_API_VERSION = 1`
- 请求 DTO：`{ protocol, apiVersion, sessionId, requestId, method, params }`
- 响应 DTO：`{ requestId, ok: true, result? }` 或 `{ requestId, ok: false, error: WidgetApiError }`
- 事件 DTO：`{ protocol, apiVersion, sessionId, event, payload }`——SDK 校验协议、版本与会话 ID，不匹配的端口消息被静默忽略
- 默认请求 ID 为 `sdk-<crypto.randomUUID()>`，格式受限且自动防重复

## 版本兼容性

```ts
function evaluateWidgetApiCompatibility(
  requestedApiVersion: number | string,
  supportedApiVersion?: number,   // 默认 WIDGET_RPC_API_VERSION = 1
): WidgetApiCompatibility
```

判断 Manifest 的字符串 `apiVersion` 或 RPC 数字版本是否与当前 API 主版本一致。不兼容时返回 `compatible: false` 及固定 `API_INCOMPATIBLE` 错误。CLI 与宿主在安装组件前都会执行该检查。
