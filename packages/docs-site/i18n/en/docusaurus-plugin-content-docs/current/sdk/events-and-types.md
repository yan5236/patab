---
sidebar_position: 3
---

# Events, Types, and Error Codes

## Events

`WidgetEventName` has 8 event names in total, all subscribable via `api.on(name, listener)` (which returns an unsubscribe function). Some capabilities additionally have dedicated subscription entry points (`storage.onChanged`, `todos.onChanged`, `channel.subscribe`, `onWidgetThemeChanged`):

| Event name | Payload type | Shape |
|---|---|---|
| `channelMessage` | `WidgetChannelMessageEvent` | `{ message: WidgetJsonValue }`, a structured-clone copy |
| `localeChanged` | `WidgetLocaleChangedEvent` | `{ locale: 'zh-CN' \| 'en-US' }` |
| `sizeChanged` | `WidgetSizeChangedEvent` | `{ previousSize: WidgetTileSize; size: WidgetTileSize }` |
| `storageChanged` | `WidgetStorageChangedEvent` | `{ key: string; operation: 'set' \| 'remove' }`, deliberately without the value |
| `themeChanged` | `WidgetThemeChangedEvent` | `{ theme: 'light' \| 'dark'; reducedMotion: boolean; tokens?: WidgetThemeTokens }` |
| `todoChanged` | `WidgetTodoChangedEvent` | `{ change: 'created' \| 'updated' \| 'deleted'; id: string }` |
| `variantChanged` | `WidgetVariantChangedEvent` | `{ previousVariantId?: string; variantId?: string }` |
| `visibilityChanged` | `WidgetVisibilityChangedEvent` | `{ visible: boolean }`; hiding does not destroy instance storage or the session |

Event DTOs carry `protocol`/`apiVersion`/`sessionId`, and the SDK validates them before delivering to listeners; mismatched port messages are silently ignored.

## WidgetContext

```ts
interface WidgetContext {
  componentId: string
  instanceId: string
  componentVersion: string
  apiVersion: 1
  surface: string
  size: WidgetTileSize          // {w:1,h:1} | {w:2,h:2} | {w:3,h:2} | {w:4,h:2}
  variantId?: string
  locale: 'zh-CN' | 'en-US'
  theme: 'light' | 'dark'
  reducedMotion: boolean
  visible: boolean
  permissions: WidgetPermissionSnapshot
}

interface WidgetPermissionSnapshot {
  granted: readonly WidgetPermission[]
  networkOrigins: readonly `https://${string}`[]
}
```

Obtained via `api.context.get()`; each call returns a copy, and event payloads are the current snapshot after the change.

## WidgetJsonValue

The only payload shape allowed by storage and channel — plain JSON that can be transferred across a MessagePort:

```ts
type WidgetJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly WidgetJsonValue[]
  | { readonly [key: string]: WidgetJsonValue }
```

## WidgetThemeTokens

A versioned theme-token snapshot that the `themeChanged` event may carry:

```ts
interface WidgetThemeTokens {
  version: 1
  values: Readonly<Record<WidgetThemeTokenName, string>>
}
```

`WidgetThemeTokenName` is a union type of the 20 `--pt-*` token names; see [theme.css and Theme Tokens](./theme-css.md) for the full list.

## Permission Types

```ts
const WIDGET_TODO_PERMISSIONS = ['todos.read', 'todos.create', 'todos.update', 'todos.delete'] as const
const WIDGET_PERMISSIONS = WIDGET_TODO_PERMISSIONS   // v1 全部可声明权限

type WidgetPermission = (typeof WIDGET_PERMISSIONS)[number]
type WidgetPermissionSet = readonly WidgetPermission[]

interface WidgetPermissionDeclarations {
  required?: readonly WidgetPermission[]
  optional?: readonly WidgetPermission[]
}

function validateWidgetPermissionDeclarations(
  declarations: WidgetPermissionDeclarations | undefined,
): WidgetContractValidationResult
```

The validator rejects: unknown permissions, duplicate declarations within the same list, and the same permission appearing in both `required` and `optional`. Failure results carry an `INVALID_ARGUMENT` error with a field path (e.g. `permissions.required[0]`).

## Error Codes

When a host API fails, it returns a stable error code via `WidgetApiError` (`WidgetErrorCode`, 19 in total):

| Error code | Trigger scenario |
|---|---|
| `API_INCOMPATIBLE` | The Manifest's `apiVersion` does not match the host's API major version |
| `CONCURRENCY_LIMIT` | Concurrent request limit exceeded (16 total / 4 network) |
| `INSTANCE_DISABLED` | The instance was automatically disabled due to consecutive failures |
| `INTEGRITY_FAILED` | Integrity manifest verification failed |
| `INVALID_ARGUMENT` | An argument failed contract validation |
| `INVALID_PACKAGE` | The widget package is invalid |
| `INVALID_REQUEST` | The RPC message shape/protocol/session is invalid |
| `MANIFEST_INVALID` | The Manifest failed Schema validation |
| `ORIGIN_NOT_ALLOWED` | The network origin is not declared/authorized, or the URL is invalid |
| `PERMISSION_DENIED` | A permission has not been granted or has been revoked |
| `QUOTA_EXCEEDED` | Instance storage exceeded the 1 MiB quota |
| `RATE_LIMITED` | Request rate limit exceeded (100 requests per 10 seconds) |
| `RESPONSE_TOO_LARGE` | The network response body exceeded 2 MiB |
| `SAFE_MODE_ACTIVE` | The host is in safe mode; third-party widgets are paused |
| `SIGNATURE_INVALID` | Signature verification failed |
| `SURFACE_LIMIT_REACHED` | The instance already has an overlay open; a duplicate open was requested |
| `SURFACE_NOT_DECLARED` | The requested surface is not declared in the Manifest |
| `TIMEOUT` | Host-side processing timed out |
| `UNKNOWN_METHOD` | Unknown RPC method name |

Error messages are user-facing and contain no host-internal details; the `path` field only points to the offending field of a public DTO. All error codes can also be read from the `WIDGET_ERROR_CODES` constant array.

## Validation Result Types

The SDK's pure validation functions uniformly return:

```ts
type WidgetContractValidationResult =
  | { valid: true }
  | { valid: false; error: WidgetApiError }

function createWidgetContractValidationSuccess(): WidgetContractValidationSuccess
function createWidgetContractValidationFailure(
  code: WidgetErrorCode, message: string, path: string,
): WidgetContractValidationFailure
```
