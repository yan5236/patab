# PaTab 自定义组件开发指南

本指南面向使用 PaTab API v1 构建本地组件 ZIP 的开发者。组件不进入宿主 Vue 应用，也不应依赖 PaTab 的 Pinia、DOM、Tailwind 类或 Chrome 扩展 API；运行时仅通过公开 SDK 与宿主 Capability Broker 交互。

## 快速开始

环境要求：Node.js `^22.18.0 || >=24.12.0` 与 pnpm。创建项目后，按下面顺序开发和验收：

```sh
npx create-patab-widget
cd my-widget
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm run pack
```

脚手架提供 `vue-ts` 与 `vanilla-ts` 两种模板。两者的最终产物契约相同，因此也可以使用其他 Vite 框架；CLI 只验证最终 ZIP，不根据源码框架作特殊放行。

`dev` 会打开 CLI 内置的真实 PaTab 开发宿主、自动安装并放置当前组件，同时保留 Vite HMR；`check` 执行 Manifest、权限、配额和生产 HTML 检查，`build` 为每个 surface 生成独立的自包含 HTML，`pack` 则完成类型检查、构建、完整性、可选签名、确定性 ZIP 与生成后复检。真实 PaTab 开发宿主仍是本地 Web 环境，MV3 扩展与最终 ZIP 重新导入仍是发布前必须进行的验收。

## 项目结构

```text
my-widget/
├── patab.manifest.json       # 公开身份、API、surface、权限与静态素材
├── src/
│   └── surfaces/             # widget、detail、settings 的源码与 HTML 入口
├── assets/
│   ├── icon.png              # 安装前静态展示图标
│   └── screenshots/          # 安装前静态截图
├── schema/                   # 脚手架复制的 Manifest Schema
├── tests/                    # 组件自身测试
├── package.json
└── vite.config.ts
```

最终 ZIP 只能包含 `patab.manifest.json`、Manifest 声明的 `surfaces/*.html`、Manifest 声明的静态 `assets/`、`integrity.json` 和可选的 `signature.json`。不要把源码、source map、开发服务器配置、私钥、口令或测试夹具放进 ZIP。

## Manifest v1

`patab.manifest.json` 是安装前唯一可信的组件声明。最小示例如下：

```json
{
  "schemaVersion": 1,
  "apiVersion": "1",
  "id": "com.example.focus-timer",
  "version": "1.0.0",
  "name": { "default": "Focus timer", "zh-CN": "专注计时" },
  "description": { "default": "A local timer component" },
  "developer": { "default": "Example developer" },
  "sizes": [{ "w": 2, "h": 2 }, { "w": 3, "h": 2 }],
  "defaultSize": { "w": 2, "h": 2 },
  "surfaces": {
    "widget": {
      "entry": "surfaces/widget.html",
      "title": { "default": "Focus timer" }
    }
  },
  "assets": { "icon": "assets/icon.png" }
}
```

- `schemaVersion` 必须为 `1`，`apiVersion` 必须为字符串 `"1"`。
- `id` 使用小写反向域名形式，`version` 使用 SemVer；同一 ID 的低版本或同版本不能覆盖已安装版本。
- `name`、`description`、`developer` 与 surface 标题是本地化文本，使用当前语言的 `zh-CN` / `en-US`，缺失时回退 `default`。
- `widget` surface 必需；`detail` 与 `settings` 可选。入口必须位于 `surfaces/`，名称只用小写字母、数字和连字符。
- 尺寸只允许 `1×1`、`2×2`、`3×2`、`4×2`，并且 `defaultSize` 必须属于 `sizes`。1×1 由 PaTab 显示图标和名称，不会启动第三方 widget surface。
- 图标仅接受 PNG/WebP 且不超过 512 KiB；截图仅接受 PNG/JPEG/WebP，最多 5 张，单张不超过 2 MiB 与 2560×1440。

完整 JSON Schema 可从 `@patab/widget-sdk/schema` 获取，脚手架也会在 `schema/` 中复制匹配版本。不要手写绕过 Schema 的附加字段；CLI 与导入端都会拒绝它们。

## Surfaces 与 variants

每个 surface 都会被独立构建为自包含 HTML。生产 HTML 不得保留动态 import、远程脚本、远程样式、开发 HMR client、source map 或运行期外部资源。PaTab 会在运行前注入 CSP，surface 不能自行放宽它。

`detail` 和 `settings` 必须在 Manifest 中显式声明，并由 SDK 的 UI API 请求打开。PaTab 负责 `BaseModal` 外壳、第三方来源标识、焦点、ESC、遮罩、移动端尺寸与单实例单弹窗限制；组件不应创建嵌套对话框或假定可访问父页面 DOM。

若组件需要多个静态类型，可声明 `variants` 与 `defaultVariant`。每个 variant 都要声明支持尺寸，且这些尺寸必须是顶层 `sizes` 的子集。首次添加和后续切换均由 PaTab 的原生选择器完成，组件会通过生命周期事件收到 `variantChanged`。

## SDK、生命周期与主题

从 `@patab/widget-sdk` 创建客户端，并只使用 API v1 的公开方法。SDK 提供 context、实例 storage、同实例 channel、宿主 UI、todos 与受控 network API；每次调用都可能因用户撤销授权而失败，因此必须处理结构化错误码，不能依赖宿主异常文本。

surface 启动时可读取组件 ID、实例 ID、组件版本、API 版本、surface、尺寸、variant、语言、主题与权限快照。主题、语言、尺寸、variant、visibility 与 storage 变化以生命周期事件发送；应在下一动画帧前应用新的公开主题 token。

样式只能使用 SDK 的 `theme.css` 所公开的 `--pt-*` token 与 `pt-*` 语义类。不要引用 PaTab 的私有 `--theme-*`、Tailwind 类或选择器。SDK 默认样式在 `prefers-reduced-motion: reduce` 时禁用非必要过渡与循环动画；组件自己的动画也必须遵守该偏好。

## 权限与数据 API

基础 context、storage、channel 与受控 UI 不需要 Manifest grant。待办能力必须逐项声明：`todos.read`、`todos.create`、`todos.update`、`todos.delete`。安装时必需权限必须获准，可选权限可不选；运行中撤销后，后续调用会立即得到 `PERMISSION_DENIED`。

实例 storage 永远按组件与 `instanceId` 隔离，单实例最大 1 MiB。写入只接受可结构化克隆、可安全序列化的值，失败不会部分写入。channel 只在同一实例的存活 surface 间发送不超过 64 KiB 的 JSON 副本。

`ui.toast`、`ui.confirm`、详情/设置 surface、variant picker 与 HTTPS 外链都由宿主呈现。外链还需要有效用户手势与用户看到的目标 origin 确认；不能调用 `alert`、`confirm`、`window.open` 或操作父窗口。

## 网络 API

网络来源必须在 Manifest 的 `network` 中以精确 HTTPS origin 声明，并附带本地化用途说明。网页端受 CORS 限制，扩展端在安装或更新确认的有效用户手势中申请精确可选 host permission；两端都不会自动扩大授权。

`network.fetch` 不携带浏览器 Cookie，固定使用无凭据请求、无 referrer、10 秒超时、2 MiB 响应上限并拒绝任何重定向。不要请求 localhost、裸 IP、带凭据 URL、危险端口，或设置 Cookie、Host、Origin、Referer、`Proxy-*`、`Sec-*` 等头。Authorization 可在单次请求中显式传入，但绝不能写入日志、UI 或 ZIP。

## 本地真实 PaTab 开发宿主

运行 `pnpm dev` 后，CLI 默认在 loopback 端口启动并打开真实 PaTab 页面。当前 Manifest 会自动安装到随机会话数据库，默认尺寸与 variant 的单个实例通过真实 launcher action 放入主屏；刷新同一页面不会重复添加。页面顶部会显示组件 ID、版本和“开发 HMR 不等于生产校验”的提示。

组件仍运行在 opaque `sandbox="allow-scripts"` iframe 中，SDK 请求继续经过生产 SandboxAdapter、握手、Capability Broker、权限、频率与体积限制。surface 入口被标记为 Vite HMR 边界，源码保存后只更新组件 iframe，不刷新 PaTab 外壳或重新打包 ZIP。

开发会话使用随机 launcher key、启动安全 key 与 IndexedDB 名称，不读取或写入 `patab:v1` 和 `patab-custom-components`。服务只接受 `127.0.0.1`、`localhost` 或 `::1`；默认浏览器打开可用 `--no-open` 关闭，显式端口用 `--port` 设置。新的 CLI 进程会创建新的隔离会话，不能恢复上一进程的测试数据。

开发 CSP 只额外允许当前精确 loopback HTTP/WebSocket 来源以承载 Vite 模块和 HMR，不会放宽生产 CSP。开发完成后仍应运行 `check` 与 `pack`，并分别在生产 Web 与 MV3 扩展中重新导入 ZIP。

## 打包、确定性与签名

```sh
# 先生成项目目录外的口令加密私钥；按提示将 publicKey 写入 Manifest publisher。
patab-widget keygen

# 默认生成未签名包。
patab-widget pack

# 指定项目目录外的私钥后生成已签名包。
patab-widget pack --sign /safe/path/widget.ed25519.pem

# 任意 ZIP 可在不执行 surface 的情况下复检。
patab-widget inspect dist/com.example.focus-timer-1.0.0.patab.zip
```

`keygen` 生成 AES-256-CBC 口令加密的 Ed25519 PKCS#8 私钥；不要提交、复制到 ZIP 或通过命令行参数传入口令。交互终端会无回显读取口令；受保护 CI 可以使用 `PATAB_WIDGET_KEY_PASSPHRASE`。口令错误、私钥格式错误或签名失败会让 `pack` 失败，绝不会退化为未签名包。

相同输入、工具版本与签名密钥的两次 `pack` 必须生成字节完全一致的 ZIP。发布前应执行两次 pack 并比较字节，再对两个输出运行 `inspect`。安装端会拒绝无效签名、完整性不匹配、额外文件和相同组件 ID 的发布者换钥；未签名包可安装，但 PaTab 会明确显示未签名状态。

## 更新与迁移

更新只接受同一 ID 的更高 SemVer。新增权限、网络来源或发布者密钥变化必须重新确认；取消和失败始终保留旧版本、旧授权与实例数据。更新时 PaTab 先把包和实例数据放入 staged 状态，若声明 `migration` surface，它只能访问自己的 staged storage，最长 5 秒，且没有 UI、todos、network、channel 或外链能力。

所有现有实例完成迁移与离屏健康握手后，PaTab 才会原子切换活动版本、授权和数据；任何失败都会清理 staged 内容并恢复旧状态。因此迁移必须幂等、可超时中断，并能处理旧数据缺失或格式未知的情况。

## 故障排查

| 症状 | 处理方式 |
| --- | --- |
| `check` 报 Manifest 或 package 错误 | 先检查 Schema 路径、声明的 surface/asset 是否存在、尺寸与 variant 是否互相匹配。 |
| `pack` 报外链、dynamic import 或 source map | 检查 Vite 插件与最终 HTML；生产 surface 必须完全自包含。 |
| 已签名包被拒绝 | 确认 Manifest `publisher.publicKey` 与私钥匹配，且未修改签名后参与 integrity 的任意文件。 |
| Web 网络请求失败 | 确认精确 HTTPS origin 已声明并被授权，目标服务允许 CORS；PaTab 不提供代理回退。 |
| MV3 网络请求失败 | 除 Manifest grant 外，确认用户在安装/更新时允许了浏览器的精确 host permission；撤销后必须重新确认。 |
| iframe 启动失败或被停用 | 检查 SDK 握手、生产 CSP 和消息大小/频率；连续三次失败会停用实例。 |
| PaTab 进入安全模式 | 检查组件启动是否在前一次会话异常中断；退出安全模式后，只重新启用已审查且可信的实例。 |

关于安装前审查、sandbox、权限与剩余风险，请同时阅读[自定义组件安全说明](./custom-component-security.md)。
