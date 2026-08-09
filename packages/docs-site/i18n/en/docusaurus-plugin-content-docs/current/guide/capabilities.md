---
sidebar_position: 4
---

# Capabilities: Storage, Todos, Network, and Host UI

This page gives an overview of the host capabilities a component can call and their boundaries. For full signatures, see [WidgetApi methods](../sdk/api.md); all limits are also listed in the [Security Model](../security.md).

## Instance Storage (storage)

Each component instance has its own private key-value store, scoped by the MessagePort session — a component can never read or write across instances or components, and it **cannot** use `localStorage` directly (sandbox isolation makes host storage unreachable).

```ts
await api.storage.set('lastSurface', 'widget')
const { found, value } = await api.storage.get('lastSurface')
const { keys } = await api.storage.keys()
const { removed } = await api.storage.remove('lastSurface')
const unsubscribe = api.storage.onChanged((event) => {
  // event: { key: string, operation: 'set' | 'remove' }，刻意不携带 value
})
```

Constraints:

- Values must be plain JSON (`WidgetJsonValue`: `null | boolean | number | string | array | plain object`); functions, circular references, and host objects are rejected.
- **Per-instance quota is 1 MiB**, metered by the host transaction before commit; exceeding it returns `QUOTA_EXCEEDED`.
- Keys are limited to 256 characters.
- `storage.get` uses `{ found, value? }` to distinguish "key does not exist" from "value is JSON null".

## Instance Channel (channel)

Multiple surfaces of the same instance (e.g. a tile and a modal) can send messages to each other:

```ts
await api.channel.publish({ type: 'refresh' })
const unsubscribe = await api.channel.subscribe((event) => {
  // event.message 是发送方消息的结构化克隆副本
})
await unsubscribe()   // 同时移除监听并退订
```

Messages are limited to the same `instanceId`, up to 64 KiB each, plain JSON only. Communication between different instances or different components is not possible.

## Todos (todos)

Accessing the user's todo data requires permissions declared in the Manifest, and each permission is independent:

| Method | Required permission |
|---|---|
| `todos.list` / `todos.onChanged` | `todos.read` |
| `todos.create` | `todos.create` |
| `todos.update` | `todos.update` |
| `todos.remove` | `todos.delete` |

```ts
if (context.permissions.granted.includes('todos.read')) {
  const { items, nextCursor } = await api.todos.list({ limit: 50 })
}
```

- Todo text is limited to 500 characters; `list` supports cursor pagination (`cursor` + `limit`, max 100 per page).
- For `update`, passing `null` for `dueDate` explicitly clears it; dates must be real `YYYY-MM-DD` dates.
- After a successful write, the host broadcasts a `todoChanged` event to all live surfaces.
- The host re-checks the grant on every call; after revocation, the next call immediately returns `PERMISSION_DENIED`.

## Controlled Network (network.fetch)

`network.fetch` is the component's only network egress (the surface CSP's `connect-src 'none'` forbids components from making network requests directly):

```ts
const response = await api.network.fetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: { 'Accept': 'application/json' },
})
// response: { status: number, headers: Record<string, string>, body: string }
```

Constraints (validated by the SDK and enforced by the host Broker):

- The URL must be an HTTPS origin already declared in the Manifest `network` section and consented to by the user; localhost, bare IPs, URLs with credentials, and ports deemed dangerous by the Fetch spec are forbidden. Unauthorized origins return `ORIGIN_NOT_ALLOWED`.
- Method whitelist: `GET | POST | PUT | PATCH | DELETE`.
- **No cookies** (`credentials: 'omit'`), no referrer, and **all redirects are rejected**.
- Request body ≤ 1 MiB; URL ≤ 2048 characters; ≤ 32 request headers (name ≤ 128 characters, value ≤ 8 KiB).
- Forbidden request headers: `cookie`, `host`, `origin`, `referer`, plus any `proxy-` or `sec-` prefix.
- Response body ≤ 2 MiB (`RESPONSE_TOO_LARGE` when exceeded); only whitelisted response headers are passed through: `cache-control`, `content-language`, `content-length`, `content-type`, `etag`, `last-modified`.
- 10-second timeout; at most 4 concurrent network requests per instance (`CONCURRENCY_LIMIT` when exceeded).
- An `Authorization` header may be passed explicitly, but it is never logged.

On the Web platform, requests are subject to the target site's CORS policy (PaTab does not provide a proxy bypass); on the browser-extension platform, this is implemented via an optional host permission that the user can revoke at any time.

## Host UI (ui)

All UI is rendered by the host and carries a third-party origin badge; components cannot impersonate system UI:

```ts
await api.ui.toast('已保存')
const { confirmed } = await api.ui.confirm({
  title: '删除数据？',
  message: '该操作不可撤销。',
  confirmLabel: '删除',
  cancelLabel: '取消',
})
const { opened } = await api.ui.openExternal({ url: 'https://example.com' })
```

- `confirm`: cancelling, pressing ESC, or closing via the overlay all return `{ confirmed: false }`. Title ≤ 120 characters, body ≤ 1000, button labels ≤ 40.
- `openExternal`: HTTPS URLs only (≤ 2048 characters); requires a **valid user gesture**, and the host opens a new tab with `noopener,noreferrer` only after confirming the target origin; when blocked, it returns `{ opened: false }` instead of throwing.
- `toast`: text ≤ 500 characters; at most 3 calls within 10 seconds.
- Calling `alert`/`confirm`/`window.open` inside a component is forbidden (the sandbox does not provide them); always use the SDK.

## Rate and Size Limits Quick Reference

Enforced by the host Broker on every call:

| Limit | Value |
|---|---|
| Single RPC request size | 256 KiB |
| Single channel message | 64 KiB |
| Request rate | 100 calls per 10-second window |
| Concurrent requests | 16 (of which 4 network) |
| toast | 3 per 10 seconds |
| Repeated violations | 3 consecutive violations trigger flood protection and destroy the iframe |

Error codes for exceeding limits: `RATE_LIMITED`, `CONCURRENCY_LIMIT`.
