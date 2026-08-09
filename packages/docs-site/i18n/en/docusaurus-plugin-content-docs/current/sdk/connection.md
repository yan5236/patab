---
sidebar_position: 1
---

# Connection and Client

`@patab/widget-sdk` (v1.0.0) is a pure ESM package with subpath exports:

| Import path | Contents |
|---|---|
| `@patab/widget-sdk` | Main entry: all exports (including client, api, testing) |
| `@patab/widget-sdk/client` | `WidgetClient`, `connectPatabWidgetClient`, error classes |
| `@patab/widget-sdk/api` | `createWidgetApi`, `onWidgetThemeChanged`, and API types |
| `@patab/widget-sdk/contracts` | Pure contract subset (types, constants, validators); no client/api/testing |
| `@patab/widget-sdk/schema` | `PATAB_WIDGET_MANIFEST_V1_SCHEMA` (Manifest JSON Schema) |
| `@patab/widget-sdk/testing` | Mock host (`createWidgetMockHost`, etc.) |
| `@patab/widget-sdk/theme.css` | Theme semantic-class stylesheet |

SDK metadata:

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

After the iframe handshake completes, the host writes the `MessagePort` and a one-time `sessionId` into the sandbox document's global scope and dispatches a same-document event to notify the SDK. `connectPatabWidgetClient` resolves once it reads the port; on timeout it rejects with `WidgetClientError('CLIENT_CONNECT_TIMEOUT')`; in an environment without `window` it rejects with `CLIENT_UNAVAILABLE`.

Widget code usually does not need to care about the handshake details — just `await connectPatabWidgetClient()` at the top of the surface.

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

- `sessionId`: a one-time identifier for this session. You **should not** send it to any external service.
- `request`: sends an RPC request and waits for the response. Rejects with `WidgetApiRequestError` when the response reports failure; on timeout (default 12 seconds, `WIDGET_CLIENT_REQUEST_TIMEOUT_MS`) rejects with `WidgetClientError('CLIENT_REQUEST_TIMEOUT')`.
- `subscribe`: subscribes to host events and returns an unsubscribe function. A listener that throws does not affect other listeners.
- `close()`: idempotent. Rejects all pending requests (`CLIENT_CLOSED`), clears listeners, and closes the port.

Most code does not use `WidgetClient` directly, but wraps it with [createWidgetApi](./api.md).

## Error Types

```ts
class WidgetClientError extends Error {
  readonly code: 'CLIENT_CLOSED' | 'CLIENT_CONNECT_TIMEOUT' | 'CLIENT_REQUEST_TIMEOUT' | 'CLIENT_UNAVAILABLE'
}

class WidgetApiRequestError extends Error {
  readonly apiError: WidgetApiError   // { code: WidgetErrorCode; message: string; path?: string }
}
```

- `WidgetClientError`: local port lifecycle failures on the SDK side (not connected, timeout, already closed).
- `WidgetApiRequestError`: an API failure returned by the host Broker. `apiError.code` is one of the 19 [stable error codes](./events-and-types.md#error-codes); `path` only points to public DTO fields. It **never** wraps or exposes host-internal exceptions.

## RPC Protocol (Informational)

Developers generally do not touch the protocol layer directly; the following is provided for debugging reference:

- Protocol constants: `WIDGET_RPC_PROTOCOL = 'patab-widget'`, `WIDGET_RPC_API_VERSION = 1`
- Request DTO: `{ protocol, apiVersion, sessionId, requestId, method, params }`
- Response DTO: `{ requestId, ok: true, result? }` or `{ requestId, ok: false, error: WidgetApiError }`
- Event DTO: `{ protocol, apiVersion, sessionId, event, payload }` — the SDK validates the protocol, version, and session ID; mismatched port messages are silently ignored
- The default request ID is `sdk-<crypto.randomUUID()>`, with a restricted format and automatic deduplication

## Version Compatibility

```ts
function evaluateWidgetApiCompatibility(
  requestedApiVersion: number | string,
  supportedApiVersion?: number,   // 默认 WIDGET_RPC_API_VERSION = 1
): WidgetApiCompatibility
```

Determines whether the Manifest's string `apiVersion` or the RPC numeric version matches the current API major version. When incompatible, it returns `compatible: false` along with a fixed `API_INCOMPATIBLE` error. Both the CLI and the host run this check before installing a widget.
