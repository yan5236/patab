---
sidebar_position: 6
---

# 包格式与分发

## 物理格式

组件包是**标准 ZIP 归档**，约定扩展名 `.patab.zip`（PaTab 导入时接受 `.zip` 与 `.patab.zip`）。没有任何自定义文件头或魔数，任何 ZIP 工具都能打开。

打包是**确定性**的：Deflate 压缩级别 9、所有条目 mtime 固定为 `1980-01-01 00:00:00`、条目按路径排序——相同输入两次 `pack` 产出的 ZIP 字节完全一致，可复现构建便于校验与审计。

## 包内结构（白名单制）

包内只允许出现 Manifest 声明过的文件，多一个、少一个都会被安装端拒绝：

```text
<id>-<version>.patab.zip
├── patab.manifest.json     # 组件清单（规范 JSON 序列化，≤ 64 KiB）
├── surfaces/
│   ├── widget.html         # 每个 surface 一个完全自包含 HTML
│   ├── detail.html
│   └── settings.html
├── assets/                 # Manifest 声明的素材（icon、screenshots、variant 图标）
│   └── ...
├── integrity.json          # SHA-256 完整性清单（必填）
└── signature.json          # Ed25519 签名（可选）
```

### Surface HTML

每个 surface 由 CLI 用项目自己的 Vite 配置单独构建并完全内联：`<script src>` 内联为 `<script>`、样式内联为 `<style>`、图片/字体等转为 data URL。拒绝项：

- 动态 `import()`、`import.meta.hot`、`@vite/client`（HMR）
- 任何外链资源（`http(s)://`、协议相对 `//`、外部脚本/样式/图片）
- `srcset`、source map 引用
- 构建后仍残留外部脚本/样式/资源

宿主安装后还会再次检查：surface 自带 CSP meta、`meta refresh`、`<base>`、`<iframe>`、`<object>`、`<embed>` 等均被拒绝，然后才注入生产 CSP。详见[安全模型](./security.md)。

### integrity.json

```json
{
  "schemaVersion": 1,
  "algorithm": "sha256",
  "files": [{ "path": "surfaces/widget.html", "sha256": "<64 位小写 hex>" }]
}
```

- 覆盖包内全部文件（**除** `integrity.json` 与 `signature.json` 自身），按路径严格递增排序
- 安装端逐个重算哈希：缺失、额外、哈希不符均拒绝
- 以规范 JSON（JCS，键排序、无空白）序列化，保证浏览器与 Node 字节一致

### signature.json（可选）

```json
{ "schemaVersion": 1, "algorithm": "ed25519", "signature": "<标准 Base64>" }
```

- 签名输入是 `{"integrity": ..., "manifest": ...}` 的规范 JSON 字节
- 公钥取自 Manifest 的 `publisher.publicKey`（SPKI DER 的 Base64），由 `patab-widget keygen` 生成后手动填入
- 验签状态四态：`unsigned`（未签名，可安装但明确标识）、`valid`、`invalid`（拒绝）、`publisher-key-changed`（同 ID 换公钥，按不同发布者阻止覆盖更新）

## 体积与结构限额

安装端对 ZIP 与包内容强制执行：

| 限制 | 值 |
|---|---|
| 压缩包总大小 | ≤ 10 MiB |
| 声明解压总大小 | ≤ 30 MiB |
| 单文件声明解压大小 | ≤ 5 MiB |
| 文件数 | ≤ 100 |
| 单文件声明压缩比 | ≤ 100（防 ZIP 炸弹） |
| Manifest 原始大小 | ≤ 64 KiB |
| 图标 | PNG/WebP，≤ 512 KiB |
| 截图 | ≤ 5 张，PNG/JPEG/WebP，单张 ≤ 2 MiB、≤ 2560×1440 |

解压按流式逐块核对**实际**大小（不信任中央目录声明值），超限立即终止，失败绝不返回部分文件。ZIP 层面还拒绝：ZIP64、多磁盘、加密条目、非 UTF-8 文件名、符号链接等特殊文件、大小写冲突路径、尾部拼接垃圾。

路径规则：必须 NFC 规范化，禁止 `\`、空段、`.`/`..` 段、绝对路径与盘符。图片按文件头魔数嗅探真实格式并真实解码（不信任扩展名）。

## 安装流程

1. 用户选择 `.zip` / `.patab.zip` 文件
2. 流式解压 Worker 校验 ZIP 结构与配额（全程不创建 DOM/iframe）
3. 静态审查：Manifest Schema、文件集、图片解码、完整性、签名
4. 审查页展示名称/版本/开发者/签名状态/权限/网络用途，用户逐项确认必需的权限与网络来源（扩展端在复选框手势中申请对应 origin 的可选 host permission）
5. 原子写入独立 IndexedDB，随后在网格创建轻量实例引用

## 更新与回滚

- 仅接受**同 ID、更高 SemVer** 的包作为更新；换了公钥按不同发布者阻止覆盖
- 新增权限、新增网络来源或换钥都会暂停并要求用户重新确认
- 更新采用 staged 机制：新版本数据先写入暂存区，可选的 `migration` surface 在离屏沙箱中迁移实例数据（只能访问 staged 存储，无 UI/todos/network/channel/外链，与离屏健康握手合计 5 秒预算），全实例健康握手通过后单事务原子切换，失败自动回滚；保留一个回滚版本

## 分发建议

- 未签名包可以安装，但审查页会明确标识；正式发布建议 `keygen` + `pack --sign`
- 私钥默认保存在项目外的 `.patab-widget-keys/`，口令保护（≥ 12 字符），不要提交版本控制
- 发布前用 `patab-widget inspect` 独立复检成品包
