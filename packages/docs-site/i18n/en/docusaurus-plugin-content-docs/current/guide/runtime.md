---
sidebar_position: 3
---

# Runtime and Lifecycle

## Startup and Handshake

The first thing every surface does after starting is connect to the host:

```ts
import { connectPatabWidgetClient, createWidgetApi } from '@patab/widget-sdk'

const client = await connectPatabWidgetClient()
const api = createWidgetApi(client)
```

Key behaviors:

- Communication **does not use `window.postMessage`**. After the iframe loads, the host completes a two-stage handshake that writes a `MessagePort` and a one-time session ID into the sandbox document's globals (`__PATAB_WIDGET_PORT__`, `__PATAB_WIDGET_SESSION_ID__`). The SDK only accepts this transferred port, and all subsequent API calls go over the port.
- `connectPatabWidgetClient()` resolves once the port is ready; it waits **5 seconds** by default (`WIDGET_CLIENT_CONNECT_TIMEOUT_MS`) and rejects with `WidgetClientError('CLIENT_CONNECT_TIMEOUT')` on timeout.
- The host likewise requires the surface to **complete the handshake within 5 seconds**, otherwise startup is considered failed and the iframe is destroyed; 3 consecutive startup failures within 24 hours automatically disable the instance.
- The SDK has no lifecycle hooks like `mount`/`destroy`/`ready` — "ready" is `connectPatabWidgetClient()` resolving, and teardown on unload is handled by `client.close()` (idempotent; it rejects all pending requests and clears event listeners).

## Context (WidgetContext)

```ts
const context = await api.context.get()
```

`context.get()` returns a read-only snapshot of the current surface (each call returns a copy):

| Field | Type | Description |
|---|---|---|
| `componentId` | string | Manifest `id` |
| `instanceId` | string | Instance ID (the same component can be added to the grid multiple times, each as an independent instance) |
| `componentVersion` | string | SemVer of the currently running version |
| `apiVersion` | `1` | RPC API major version |
| `surface` | string | Current surface name (e.g. `widget`/`detail`/`settings`) |
| `size` | TileSize | Current tile size |
| `variantId` | string? | Current variant; `undefined` when not used |
| `locale` | `'zh-CN' \| 'en-US'` | Host's current language |
| `theme` | `'light' \| 'dark'` | Host's current theme |
| `reducedMotion` | boolean | Whether the user prefers reduced motion |
| `visible` | boolean | Whether the current surface is visible |
| `permissions` | PermissionSnapshot | `{ granted: Permission[], networkOrigins: string[] }`, a permission snapshot taken at handshake time |

:::caution
`permissions` is a snapshot, not a live grant. Even if the user revokes a permission afterwards, the snapshot does not change — but the host Broker re-checks the grant on every call in real time, so the next call after revocation immediately gets `PERMISSION_DENIED`. Components should handle errors on critical calls.
:::

## Surface Model

- The **`widget` surface** runs inside a grid tile; at `1×1` size only the icon and name are rendered, and no component code is executed.
- The **`detail` / `settings` surfaces** are modal overlays whose shell is rendered by the host, opened only by an explicit request from the component:

```ts
await api.ui.openSurface({ surface: 'detail' })   // or 'settings'
await api.ui.closeSurface()                        // close itself from inside the modal surface
```

The modal shell (title, third-party origin badge, focus management, ESC to close) is the host's responsibility. Only one modal is allowed per instance at a time; opening a second one returns `SURFACE_LIMIT_REACHED`; a surface not declared in the Manifest returns `SURFACE_NOT_DECLARED`.

## Variants

If the Manifest declares `variants`, the user can switch between them via the host's native picker. A component cannot switch variants itself; it can only:

- Read the current value via `context.variantId`
- Subscribe to the `variantChanged` event to react to changes
- Call `api.ui.openVariantPicker()` to ask the host to open the picker

## Visibility and Size

- When the page switches or the tab is hidden, the host broadcasts `visibilityChanged`. **Being hidden does not destroy instance storage or the MessagePort session** — the surface keeps running once it becomes visible again.
- When the user resizes a tile, the host broadcasts `sizeChanged` (carrying `previousSize` and the new `size`).

## Event Overview

All 8 events can be subscribed via `api.on(name, listener)`, which returns an unsubscribe function:

| Event | Payload highlights |
|---|---|
| `themeChanged` | `{ theme, reducedMotion, tokens? }` |
| `localeChanged` | `{ locale }` |
| `sizeChanged` | `{ previousSize, size }` |
| `variantChanged` | `{ previousVariantId?, variantId? }` |
| `visibilityChanged` | `{ visible }` |
| `storageChanged` | `{ key, operation }` (deliberately excludes the value) |
| `channelMessage` | `{ message }` |
| `todoChanged` | `{ change, id }` |

For full payload types and subscription examples, see [Events, Types, and Error Codes](../sdk/events-and-types.md).

## Error Handling Conventions

- Failed host API calls reject with `WidgetApiRequestError`, whose `apiError` is `{ code, message, path? }` — `code` is one of the 19 stable error codes and **never** contains internal host exceptions or stack traces.
- Local SDK failures (not connected, timed out, closed) reject with `WidgetClientError`, whose `code` is `CLIENT_UNAVAILABLE | CLIENT_CONNECT_TIMEOUT | CLIENT_REQUEST_TIMEOUT | CLIENT_CLOSED`.
- A single request times out after 12 seconds by default (`WIDGET_CLIENT_REQUEST_TIMEOUT_MS`, overridable via `requestTimeoutMs` at connect time).

```ts
try {
  await api.todos.list()
} catch (error) {
  if (error instanceof WidgetApiRequestError && error.apiError.code === 'PERMISSION_DENIED') {
    // 权限被撤销，降级为本地展示
  }
}
```
