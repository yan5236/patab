---
sidebar_position: 2
---

# Manifest Configuration

`patab.manifest.json` is the widget's single manifest file, governed by a JSON Schema (Draft 2020-12, `$id: https://patab.nanhaiblog.top/schemas/widget-manifest-v1.json`). The scaffolder places a copy of the Schema at `schema/patab.manifest.schema.json` for editor completion. At runtime you can also obtain it from the `@patab/widget-sdk/schema` subpath export (`PATAB_WIDGET_MANIFEST_V1_SCHEMA`), or validate programmatically with `validatePatabWidgetManifestV1`.

The raw file is limited to 64 KiB; every single text field value is limited to 4096 characters.

## Complete Example

```json
{
  "schemaVersion": 1,
  "apiVersion": "1",
  "id": "com.example.my-widget",
  "version": "0.1.0",
  "name": { "default": "My Widget", "zh-CN": "我的组件", "en-US": "My Widget" },
  "description": { "default": "我的第一个 PaTab 组件。", "zh-CN": "我的第一个 PaTab 组件。", "en-US": "My first PaTab widget." },
  "developer": { "default": "你的团队", "zh-CN": "你的团队", "en-US": "Your team" },
  "surfaces": {
    "widget": { "entry": "surfaces/widget.html", "title": { "default": "组件", "zh-CN": "组件", "en-US": "Widget" } },
    "detail": { "entry": "surfaces/detail.html", "title": { "default": "详情", "zh-CN": "详情", "en-US": "Detail" }, "modalSize": "medium" },
    "settings": { "entry": "surfaces/settings.html", "title": { "default": "设置", "zh-CN": "设置", "en-US": "Settings" }, "modalSize": "small" }
  },
  "sizes": [{ "w": 2, "h": 2 }, { "w": 3, "h": 2 }],
  "defaultSize": { "w": 2, "h": 2 },
  "variants": [
    {
      "id": "compact",
      "name": { "default": "紧凑", "zh-CN": "紧凑", "en-US": "Compact" },
      "description": { "default": "紧凑显示", "zh-CN": "紧凑显示", "en-US": "Compact display" },
      "icon": "assets/icon.png",
      "supportedSizes": [{ "w": 2, "h": 2 }]
    }
  ],
  "defaultVariant": "compact",
  "permissions": { "optional": ["todos.read"] },
  "network": [
    {
      "origin": "https://api.example.com",
      "required": false,
      "reason": { "default": "获取示例数据", "zh-CN": "获取示例数据", "en-US": "Fetch example data" }
    }
  ],
  "assets": { "icon": "assets/icon.png", "screenshots": ["assets/screenshots/preview.png"] },
  "publisher": { "publicKey": "<SPKI DER 的 Base64>" }
}
```

## Field Reference

### Required Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` (constant) | Manifest Schema version |
| `apiVersion` | `"1"` (constant string) | SDK API major version required by the widget; installation is rejected on mismatch with the host (`API_INCOMPATIBLE`) |
| `id` | string | Widget ID, reverse-domain lowercase: `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`, max 128. Updates are identified by the same ID |
| `version` | string | Full semantic version (SemVer); updates only accept a higher version |
| `name` | LocalizedText | Widget name |
| `description` | LocalizedText | Widget description |
| `developer` | LocalizedText | Developer/team name |
| `surfaces` | object | Surface declarations, **must include `widget`**, see below |
| `sizes` | TileSize[] | Supported tile sizes, at least 1, no duplicates |
| `defaultSize` | TileSize | Default size |
| `assets` | object | Asset declarations, `icon` required, see below |

### Optional Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `variants` | Variant[] | Multi-type configuration (variants), see below |
| `defaultVariant` | string | The `id` of the default variant |
| `permissions` | object | Permission declarations: `{ required?: Permission[], optional?: Permission[] }`, see below |
| `network` | NetworkDeclaration[] | Network origin declarations, see below |
| `publisher` | `{ publicKey: string }` | Publisher Ed25519 public key (Base64 of SPKI DER), used together with signed packages |

All fields not listed are rejected (the Schema is `additionalProperties: false`).

### LocalizedText

All user-facing text is a localization object:

```json
{ "default": "必填回退文本", "zh-CN": "中文（可选）", "en-US": "English (optional)" }
```

Only the three keys `default`, `zh-CN`, and `en-US` are allowed; `default` is required, and each value is 1–4096 characters.

### surfaces

| Item | Description |
|---|---|
| Key name | Surface name: `^[a-z0-9]+(-[a-z0-9]+)*$`, max 64. `widget` (grid tile) must exist; `detail` and `settings` are optional modals |
| `entry` | Entry path, must match `^surfaces/[a-z0-9]+(-[a-z0-9]+)*\.html$`; the source corresponds to `src/surfaces/<name>.html` |
| `title` | LocalizedText, modal title |
| `modalSize` | Optional, `"small" \| "medium" \| "large"`, modal size |

### Sizes (TileSize)

`{ "w": integer, "h": integer }`; only four options are allowed: **`1×1`, `2×2`, `3×2`, `4×2`**.

:::note
The `1×1` size only displays the icon and name, and **does not start any surface** — widget code does not execute at 1×1.
:::

The Schema does not enforce `defaultSize ∈ sizes` or `defaultVariant ∈ variants`, but the installer relies on them, so keep both consistent.

### variants (optional)

Each variant declares:

| Field | Type | Description |
|---|---|---|
| `id` | string | 1–128 characters |
| `name` / `description` | LocalizedText | Name and description shown in the selector |
| `icon` | AssetPath | Variant icon (under `assets/`) |
| `supportedSizes` | TileSize[] | Sizes supported by this variant, at least 1 |

Users switch variants through the native selector rendered by the host, and the widget receives a `variantChanged` event (see [Runtime and Lifecycle](./runtime.md)).

### permissions (optional)

In API v1 the only declarable permissions are the 4 to-do permissions: `todos.read`, `todos.create`, `todos.update`, `todos.delete`.

- `required`: the user must grant all of them at install time, otherwise installation is not possible
- `optional`: the user can toggle each one individually and may revoke it at runtime; the widget should check `context.permissions.granted` before calling
- The same permission must not be declared twice, nor appear in both `required` and `optional`

Basic capabilities such as `storage`, `channel`, `ui`, and `network.fetch` do **not** require permission declarations (the network capability requires declaring `network` origins).

### network (optional)

Each origin that needs `network.fetch` access is declared separately:

| Field | Type | Description |
|---|---|---|
| `origin` | string | Exact HTTPS origin, matching `^https://[^/?#]+$` (no path/query/credentials), max 2048 |
| `required` | boolean | `true` means consent is required at install time, otherwise installation is not possible |
| `reason` | LocalizedText | Purpose description, shown to the user on the install confirmation page |

Calling `network.fetch` for an undeclared origin is rejected (`ORIGIN_NOT_ALLOWED`).

### assets

| Field | Type | Description |
|---|---|---|
| `icon` | AssetPath | Widget icon, **PNG or WebP** (JPEG not accepted), ≤ 512 KiB; the real format is sniffed from the file header magic bytes |
| `screenshots` | AssetPath[] | Optional, up to 5 images, PNG/JPEG/WebP, each ≤ 2 MiB and ≤ 2560×1440 |

Asset paths must start with `assets/`. All images are decoded for real and validated before installation.

### publisher (optional)

`{ "publicKey": "<SPKI DER 的 Base64>" }`: the publisher's Ed25519 public key. After generating a key pair with `patab-widget keygen`, **manually** paste the printed public key into this field, then sign with `pack --sign`. An update package for the same widget ID that changes the public key is treated as a different publisher and blocked from overwriting. See [Package Format and Distribution](../package-format.md) for details.
