---
sidebar_position: 4
---

# Manifest 契约与校验器

## Manifest 类型

```ts
interface PatabWidgetManifestV1 {
  schemaVersion: 1
  apiVersion: '1'
  id: string
  version: string
  name: LocalizedText
  description: LocalizedText
  developer: LocalizedText
  surfaces: WidgetSurfaceDeclarations
  sizes: readonly WidgetTileSize[]
  defaultSize: WidgetTileSize
  variants?: readonly WidgetVariantDeclaration[]
  defaultVariant?: string
  permissions?: WidgetPermissionDeclarations
  network?: readonly WidgetNetworkDeclaration[]
  assets: WidgetAssets
  publisher?: WidgetPublisher
}

type LocalizedText = { default: string; 'zh-CN'?: string; 'en-US'?: string }
type WidgetTileSize = { w: 1; h: 1 } | { w: 2; h: 2 } | { w: 3; h: 2 } | { w: 4; h: 2 }
type WidgetAssetPath = `assets/${string}`
type SurfaceEntryPath = `surfaces/${string}.html`
type WidgetModalSize = 'small' | 'medium' | 'large'

interface WidgetSurfaceDeclaration {
  entry: SurfaceEntryPath
  title: LocalizedText
  modalSize?: WidgetModalSize
}
type WidgetSurfaceDeclarations = Record<string, WidgetSurfaceDeclaration> & { widget: WidgetSurfaceDeclaration }

interface WidgetNetworkDeclaration {
  origin: `https://${string}`
  required: boolean
  reason: LocalizedText
}

interface WidgetAssets {
  icon: WidgetAssetPath
  screenshots?: readonly WidgetAssetPath[]   // ≤ 5
}

interface WidgetVariantDeclaration {
  id: string
  name: LocalizedText
  description: LocalizedText
  icon: WidgetAssetPath
  supportedSizes: readonly WidgetTileSize[]
}

interface WidgetPublisher { publicKey: string }
```

字段级约束（ID 格式、SemVer、surface 命名、entry 正则、origin 正则等）见 [Manifest 配置](../guide/manifest.md)。

## JSON Schema 导出

```ts
import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from '@patab/widget-sdk/schema'
```

Draft 2020-12 的 Manifest v1 Schema（`$id: https://patab.nanhaiblog.top/schemas/widget-manifest-v1.json`）。脚手架会把它复制到项目的 `schema/patab.manifest.schema.json` 供编辑器使用。

## validatePatabWidgetManifestV1

```ts
function validatePatabWidgetManifestV1(value: unknown): WidgetManifestValidationResult
// { valid: true } 或 { valid: false; path: string }
```

使用构建期预编译的 Ajv standalone 校验器（无 `unsafe-eval` 依赖，可在 MV3 CSP 下运行）。失败时 `path` 为首个错误的 JSON Pointer，不携带 Ajv 原始错误对象或输入内容。

## 网络契约校验器与常量

```ts
function validateWidgetNetworkRequest(input: WidgetNetworkRequest): WidgetContractValidationResult
function validateWidgetNetworkResponse(input: WidgetNetworkResponse): WidgetContractValidationResult
```

校验内容与宿主 Broker 一致：HTTPS 且无用户信息、方法白名单、请求头数量/长度/换行注入/危险头、正文大小、状态码范围、响应头白名单。配套常量：

| 常量 | 值 |
|---|---|
| `WIDGET_NETWORK_HTTP_METHODS` | `['GET','POST','PUT','PATCH','DELETE']` |
| `WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES` | 1 MiB |
| `WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES` | 2 MiB |
| `WIDGET_NETWORK_TIMEOUT_MS` | 10_000 |
| `WIDGET_NETWORK_CONCURRENCY_MAX` | 4 |
| `WIDGET_NETWORK_URL_MAX_LENGTH` | 2_048 |
| `WIDGET_NETWORK_HEADER_COUNT_MAX` | 32 |
| `WIDGET_NETWORK_HEADER_NAME_MAX_LENGTH` | 128 |
| `WIDGET_NETWORK_HEADER_VALUE_MAX_BYTES` | 8_192 |
| `WIDGET_NETWORK_FORBIDDEN_REQUEST_HEADER_NAMES` | `['cookie','host','origin','referer']`（另禁 `proxy-`、`sec-` 前缀） |
| `WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST` | `['cache-control','content-language','content-length','content-type','etag','last-modified']` |

## 待办契约校验器与常量

```ts
function validateWidgetTodoCreateInput(input: WidgetTodoCreateInput): WidgetContractValidationResult
function validateWidgetTodoUpdateInput(input: WidgetTodoUpdateInput): WidgetContractValidationResult
function validateWidgetTodoDeleteInput(input: WidgetTodoDeleteInput): WidgetContractValidationResult
function validateWidgetTodoListRequest(input: WidgetTodoListRequest): WidgetContractValidationResult
```

| 常量 | 值 |
|---|---|
| `WIDGET_TODO_TEXT_MAX_LENGTH` | 500 |
| `WIDGET_TODO_ID_MAX_LENGTH` | 128 |
| `WIDGET_TODO_CURSOR_MAX_LENGTH` | 256 |
| `WIDGET_TODO_PAGE_LIMIT_MAX` | 100 |

日期必须是真实存在的 `YYYY-MM-DD`（如 2 月 30 日会被拒绝）。
