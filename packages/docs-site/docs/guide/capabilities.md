---
sidebar_position: 4
---

# 能力：存储、待办、网络与宿主 UI

本页概览组件可调用的宿主能力及其边界。完整签名见 [WidgetApi 方法](../sdk/api.md)；所有限额同时列在[安全模型](../security.md)中。

## 实例存储（storage）

每个组件实例拥有独立的私有键值存储，作用域由 MessagePort 会话派生——组件永远无法跨实例或跨组件读写，也**不能**直接使用 `localStorage`（sandbox 隔离使宿主存储不可达）。

```ts
await api.storage.set('lastSurface', 'widget')
const { found, value } = await api.storage.get('lastSurface')
const { keys } = await api.storage.keys()
const { removed } = await api.storage.remove('lastSurface')
const unsubscribe = api.storage.onChanged((event) => {
  // event: { key: string, operation: 'set' | 'remove' }，刻意不携带 value
})
```

约束：

- 值必须是纯 JSON（`WidgetJsonValue`：`null | boolean | number | string | 数组 | 普通对象`），函数、循环引用、宿主对象会被拒绝。
- **单实例配额 1 MiB**，由宿主事务在提交前计量，超限返回 `QUOTA_EXCEEDED`。
- 键最长 256 字符。
- `storage.get` 用 `{ found, value? }` 区分「键不存在」与「值为 JSON null」。

## 实例通道（channel）

同一实例的多个 surface（如图块与弹层）之间可互发消息：

```ts
await api.channel.publish({ type: 'refresh' })
const unsubscribe = await api.channel.subscribe((event) => {
  // event.message 是发送方消息的结构化克隆副本
})
await unsubscribe()   // 同时移除监听并退订
```

消息仅限同一 `instanceId`，单条最大 64 KiB，纯 JSON。不同实例、不同组件之间无法通信。

## 待办（todos）

访问用户待办数据需要在 Manifest 声明权限，且每项权限独立：

| 方法 | 所需权限 |
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

- 待办文本最长 500 字符；`list` 支持游标分页（`cursor` + `limit`，单页上限 100）。
- `update` 的 `dueDate` 传 `null` 表示显式清除；日期必须是真实存在的 `YYYY-MM-DD`。
- 写操作成功后宿主向全部存活 surface 广播 `todoChanged` 事件。
- 宿主每次调用都重查授权，撤销后下一次调用立即 `PERMISSION_DENIED`。

## 受控网络（network.fetch）

`network.fetch` 是组件唯一的网络出口（surface CSP 中 `connect-src 'none'` 禁止组件直接发网络请求）：

```ts
const response = await api.network.fetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: { 'Accept': 'application/json' },
})
// response: { status: number, headers: Record<string, string>, body: string }
```

约束（同时由 SDK 校验与宿主 Broker 强制）：

- URL 必须是已在 Manifest `network` 中声明并获用户同意的 HTTPS origin；禁止 localhost、裸 IP、带凭据的 URL 与 Fetch 规范危险端口。未授权来源返回 `ORIGIN_NOT_ALLOWED`。
- 方法白名单：`GET | POST | PUT | PATCH | DELETE`。
- **无 Cookie**（`credentials: 'omit'`）、无 referrer、**拒绝一切重定向**。
- 请求正文 ≤ 1 MiB；URL ≤ 2048 字符；请求头 ≤ 32 个（名称 ≤ 128 字符、值 ≤ 8 KiB）。
- 禁止请求头：`cookie`、`host`、`origin`、`referer`，以及 `proxy-`、`sec-` 前缀。
- 响应正文 ≤ 2 MiB（超限 `RESPONSE_TOO_LARGE`）；响应头只透传白名单：`cache-control`、`content-language`、`content-length`、`content-type`、`etag`、`last-modified`。
- 10 秒超时；单实例最多 4 个并发网络请求（超限 `CONCURRENCY_LIMIT`）。
- `Authorization` 头可显式传入，但不会被记录。

Web 端受目标站点 CORS 约束（PaTab 不提供代理绕过）；浏览器扩展端通过可选 host permission 实现，用户可随时撤销。

## 宿主 UI（ui）

所有界面由宿主渲染并附带第三方来源标识，组件无法伪装系统界面：

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

- `confirm`：取消、ESC、遮罩关闭统一返回 `{ confirmed: false }`。标题 ≤ 120、正文 ≤ 1000、按钮文案 ≤ 40 字符。
- `openExternal`：仅 HTTPS URL（≤ 2048 字符）；要求**有效用户手势**且宿主确认目标 origin 后才以 `noopener,noreferrer` 打开新标签页；被拦截时返回 `{ opened: false }` 而不抛异常。
- `toast`：文本 ≤ 500 字符；10 秒内最多 3 次。
- 组件内禁止调用 `alert`/`confirm`/`window.open`（sandbox 不提供这些能力），一律使用 SDK。

## 频率与体积限制速查

宿主 Broker 对每次调用强制执行：

| 限制 | 值 |
|---|---|
| 单个 RPC 请求体积 | 256 KiB |
| 单条 channel 消息 | 64 KiB |
| 请求频率 | 10 秒窗口 100 次 |
| 并发请求 | 16（其中网络 4） |
| toast | 10 秒 3 次 |
| 连续超限 | 3 次触发洪泛保护，销毁 iframe |

超限错误码：`RATE_LIMITED`、`CONCURRENCY_LIMIT`。
