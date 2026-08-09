---
sidebar_position: 4
---

# Manifest Contract and Validators

## Manifest Types

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

For field-level constraints (ID format, SemVer, surface naming, entry regex, origin regex, etc.), see [Manifest Configuration](../guide/manifest.md).

## JSON Schema Export

```ts
import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from '@patab/widget-sdk/schema'
```

The Draft 2020-12 Manifest v1 Schema (`$id: https://patab.nanhaiblog.top/schemas/widget-manifest-v1.json`). The scaffold copies it into the project's `schema/patab.manifest.schema.json` for editor use.

## validatePatabWidgetManifestV1

```ts
function validatePatabWidgetManifestV1(value: unknown): WidgetManifestValidationResult
// { valid: true } 或 { valid: false; path: string }
```

Uses a build-time precompiled Ajv standalone validator (no `unsafe-eval` dependency, so it runs under MV3 CSP). On failure, `path` is the JSON Pointer of the first error; it carries neither the raw Ajv error object nor the input content.

## Network Contract Validators and Constants

```ts
function validateWidgetNetworkRequest(input: WidgetNetworkRequest): WidgetContractValidationResult
function validateWidgetNetworkResponse(input: WidgetNetworkResponse): WidgetContractValidationResult
```

The validation matches what the host Broker enforces: HTTPS without user info, method allowlist, header count/length/newline-injection/dangerous-header checks, body size, status code range, and the response-header allowlist. Companion constants:

| Constant | Value |
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
| `WIDGET_NETWORK_FORBIDDEN_REQUEST_HEADER_NAMES` | `['cookie','host','origin','referer']` (the `proxy-` and `sec-` prefixes are also forbidden) |
| `WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST` | `['cache-control','content-language','content-length','content-type','etag','last-modified']` |

## Todo Contract Validators and Constants

```ts
function validateWidgetTodoCreateInput(input: WidgetTodoCreateInput): WidgetContractValidationResult
function validateWidgetTodoUpdateInput(input: WidgetTodoUpdateInput): WidgetContractValidationResult
function validateWidgetTodoDeleteInput(input: WidgetTodoDeleteInput): WidgetContractValidationResult
function validateWidgetTodoListRequest(input: WidgetTodoListRequest): WidgetContractValidationResult
```

| Constant | Value |
|---|---|
| `WIDGET_TODO_TEXT_MAX_LENGTH` | 500 |
| `WIDGET_TODO_ID_MAX_LENGTH` | 128 |
| `WIDGET_TODO_CURSOR_MAX_LENGTH` | 256 |
| `WIDGET_TODO_PAGE_LIMIT_MAX` | 100 |

Dates must be real `YYYY-MM-DD` dates (e.g. February 30 is rejected).
