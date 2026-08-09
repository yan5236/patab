---
sidebar_position: 3
---

# 事件、类型与错误码

## 事件

`WidgetEventName` 共 8 个事件名，均可通过 `api.on(name, listener)` 订阅（返回退订函数），部分能力另有专用订阅入口（`storage.onChanged`、`todos.onChanged`、`channel.subscribe`、`onWidgetThemeChanged`）：

| 事件名 | 载荷类型 | 结构 |
|---|---|---|
| `channelMessage` | `WidgetChannelMessageEvent` | `{ message: WidgetJsonValue }`，结构化克隆副本 |
| `localeChanged` | `WidgetLocaleChangedEvent` | `{ locale: 'zh-CN' \| 'en-US' }` |
| `sizeChanged` | `WidgetSizeChangedEvent` | `{ previousSize: WidgetTileSize; size: WidgetTileSize }` |
| `storageChanged` | `WidgetStorageChangedEvent` | `{ key: string; operation: 'set' \| 'remove' }`，刻意不含 value |
| `themeChanged` | `WidgetThemeChangedEvent` | `{ theme: 'light' \| 'dark'; reducedMotion: boolean; tokens?: WidgetThemeTokens }` |
| `todoChanged` | `WidgetTodoChangedEvent` | `{ change: 'created' \| 'updated' \| 'deleted'; id: string }` |
| `variantChanged` | `WidgetVariantChangedEvent` | `{ previousVariantId?: string; variantId?: string }` |
| `visibilityChanged` | `WidgetVisibilityChangedEvent` | `{ visible: boolean }`，隐藏不销毁实例存储或会话 |

事件 DTO 携带 `protocol`/`apiVersion`/`sessionId`，SDK 校验后才会投递给 listener；不匹配的端口消息被静默忽略。

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

通过 `api.context.get()` 获取；每次返回副本，事件载荷即变化后的当前快照。

## WidgetJsonValue

storage 与 channel 允许的唯一载荷形状——可跨 MessagePort 传递的纯 JSON：

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

`themeChanged` 事件可携带的版本化主题 token 快照：

```ts
interface WidgetThemeTokens {
  version: 1
  values: Readonly<Record<WidgetThemeTokenName, string>>
}
```

`WidgetThemeTokenName` 是 20 个 `--pt-*` token 名称的联合类型，完整列表见 [theme.css 与主题 token](./theme-css.md)。

## 权限类型

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

校验器拒绝：未知权限、同一列表内重复声明、同一权限同时出现在 `required` 与 `optional`。失败结果带 `INVALID_ARGUMENT` 错误与字段路径（如 `permissions.required[0]`）。

## 错误码

宿主 API 失败时通过 `WidgetApiError` 返回稳定错误码（`WidgetErrorCode`，共 19 个）：

| 错误码 | 触发场景 |
|---|---|
| `API_INCOMPATIBLE` | Manifest 的 `apiVersion` 与宿主 API 主版本不一致 |
| `CONCURRENCY_LIMIT` | 并发请求超限（总并发 16 / 网络 4） |
| `INSTANCE_DISABLED` | 实例因连续故障被自动停用 |
| `INTEGRITY_FAILED` | 完整性清单校验失败 |
| `INVALID_ARGUMENT` | 参数未通过契约校验 |
| `INVALID_PACKAGE` | 组件包不合法 |
| `INVALID_REQUEST` | RPC 消息形状/协议/会话不合法 |
| `MANIFEST_INVALID` | Manifest 未通过 Schema 校验 |
| `ORIGIN_NOT_ALLOWED` | 网络来源未声明/未授权，或 URL 不合法 |
| `PERMISSION_DENIED` | 权限未授予或已被撤销 |
| `QUOTA_EXCEEDED` | 实例存储超 1 MiB 配额 |
| `RATE_LIMITED` | 请求频率超限（10 秒 100 次） |
| `RESPONSE_TOO_LARGE` | 网络响应正文超 2 MiB |
| `SAFE_MODE_ACTIVE` | 宿主处于安全模式，第三方组件暂停运行 |
| `SIGNATURE_INVALID` | 签名校验失败 |
| `SURFACE_LIMIT_REACHED` | 同实例已有弹层，重复打开 |
| `SURFACE_NOT_DECLARED` | 请求的 surface 未在 Manifest 声明 |
| `TIMEOUT` | 宿主侧处理超时 |
| `UNKNOWN_METHOD` | 未知 RPC 方法名 |

错误消息面向用户、不包含宿主内部细节；`path` 字段只指向公开 DTO 的出错字段。全部错误码也可从 `WIDGET_ERROR_CODES` 常量数组读取。

## 校验结果类型

SDK 的纯校验函数统一返回：

```ts
type WidgetContractValidationResult =
  | { valid: true }
  | { valid: false; error: WidgetApiError }

function createWidgetContractValidationSuccess(): WidgetContractValidationSuccess
function createWidgetContractValidationFailure(
  code: WidgetErrorCode, message: string, path: string,
): WidgetContractValidationFailure
```
