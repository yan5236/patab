---
sidebar_position: 2
---

# Manifest 配置

`patab.manifest.json` 是组件的唯一清单文件，遵循 JSON Schema（Draft 2020-12，`$id: https://patab.nanhaiblog.top/schemas/widget-manifest-v1.json`）。脚手架会把 Schema 副本放在 `schema/patab.manifest.schema.json` 供编辑器补全；运行时也可通过 `@patab/widget-sdk/schema` 子路径导出获取（`PATAB_WIDGET_MANIFEST_V1_SCHEMA`），或用 `validatePatabWidgetManifestV1` 编程校验。

原始文件最大 64 KiB；所有文本字段单值最长 4096 字符。

## 完整示例

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

## 字段参考

### 顶层必填字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | `1`（常量） | Manifest Schema 版本 |
| `apiVersion` | `"1"`（常量字符串） | 组件要求的 SDK API 主版本；与宿主不一致时拒绝安装（`API_INCOMPATIBLE`） |
| `id` | string | 组件 ID，反向域名式小写：`^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`，最长 128。更新以同 ID 识别 |
| `version` | string | 完整语义化版本（SemVer），更新仅接受更高版本 |
| `name` | LocalizedText | 组件名称 |
| `description` | LocalizedText | 组件描述 |
| `developer` | LocalizedText | 开发者/团队名称 |
| `surfaces` | object | Surface 声明，**必须包含 `widget`**，见下文 |
| `sizes` | TileSize[] | 支持的图块尺寸，至少 1 个、不重复 |
| `defaultSize` | TileSize | 默认尺寸 |
| `assets` | object | 素材声明，必填 `icon`，见下文 |

### 顶层可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `variants` | Variant[] | 多类型配置（变体），见下文 |
| `defaultVariant` | string | 默认 variant 的 `id` |
| `permissions` | object | 权限声明：`{ required?: Permission[], optional?: Permission[] }`，见下文 |
| `network` | NetworkDeclaration[] | 网络来源声明，见下文 |
| `publisher` | `{ publicKey: string }` | 发布者 Ed25519 公钥（SPKI DER 的 Base64），配合签名包使用 |

所有未列出的字段都会被拒绝（Schema 为 `additionalProperties: false`）。

### LocalizedText

所有面向用户的文本均为本地化对象：

```json
{ "default": "必填回退文本", "zh-CN": "中文（可选）", "en-US": "English (optional)" }
```

只允许 `default`、`zh-CN`、`en-US` 三个键，`default` 必填，每个值 1–4096 字符。

### surfaces

| 项 | 说明 |
|---|---|
| 键名 | surface 名称：`^[a-z0-9]+(-[a-z0-9]+)*$`，最长 64。`widget`（网格图块）必须存在；`detail`、`settings` 为可选弹层 |
| `entry` | 入口路径，必须匹配 `^surfaces/[a-z0-9]+(-[a-z0-9]+)*\.html$`，源码对应 `src/surfaces/<name>.html` |
| `title` | LocalizedText，弹层标题 |
| `modalSize` | 可选，`"small" \| "medium" \| "large"`，弹层尺寸 |

### 尺寸（TileSize）

`{ "w": 整数, "h": 整数 }`，只允许四档：**`1×1`、`2×2`、`3×2`、`4×2`**。

:::note
`1×1` 尺寸只显示图标与名称，**不会启动任何 surface**——组件代码在 1×1 下不会执行。
:::

Schema 不强制 `defaultSize ∈ sizes`、`defaultVariant ∈ variants`，但安装端以此为准，请保持二者一致。

### variants（可选）

每个 variant 声明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 1–128 字符 |
| `name` / `description` | LocalizedText | 选择器中展示的名称与描述 |
| `icon` | AssetPath | variant 图标（`assets/` 下） |
| `supportedSizes` | TileSize[] | 该 variant 支持的尺寸，至少 1 个 |

用户通过宿主渲染的原生选择器切换 variant，组件收到 `variantChanged` 事件（见 [运行时与生命周期](./runtime.md)）。

### permissions（可选）

API v1 全部可声明权限只有 4 个待办权限：`todos.read`、`todos.create`、`todos.update`、`todos.delete`。

- `required`：安装时用户必须全部同意，否则不能安装
- `optional`：用户可逐项开关，运行时可被撤销；组件应检查 `context.permissions.granted` 后调用
- 同一权限不得重复声明，也不得同时出现在 `required` 与 `optional` 中

`storage`、`channel`、`ui`、`network.fetch` 等基础能力**不需要**声明权限（网络能力需声明 `network` 来源）。

### network（可选）

需要 `network.fetch` 访问的每个来源单独声明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `origin` | string | 精确 HTTPS origin，匹配 `^https://[^/?#]+$`（不含路径/查询/凭据），最长 2048 |
| `required` | boolean | `true` 表示安装时必须同意，否则无法安装 |
| `reason` | LocalizedText | 用途说明，安装确认页向用户展示 |

未声明的来源调用 `network.fetch` 会被拒绝（`ORIGIN_NOT_ALLOWED`）。

### assets

| 字段 | 类型 | 说明 |
|---|---|---|
| `icon` | AssetPath | 组件图标，**PNG 或 WebP**（不接受 JPEG），≤ 512 KiB，按文件头魔数嗅探真实格式 |
| `screenshots` | AssetPath[] | 可选，最多 5 张，PNG/JPEG/WebP，单张 ≤ 2 MiB、≤ 2560×1440 |

素材路径必须以 `assets/` 开头。所有图片在安装前会被真实解码校验。

### publisher（可选）

`{ "publicKey": "<SPKI DER 的 Base64>" }`：发布者 Ed25519 公钥。用 `patab-widget keygen` 生成密钥对后**手动**把输出的公钥填入此字段，再使用 `pack --sign` 签名。同一组件 ID 的更新包若换了公钥会被视为不同发布者而阻止覆盖。详见 [包格式与分发](../package-format.md)。
