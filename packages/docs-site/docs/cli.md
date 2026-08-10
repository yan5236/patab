---
sidebar_position: 5
---

# CLI 参考

`@patab/widget-cli` 提供 `patab-widget` 命令，用于组件的本地调试、校验、构建、打包与签名。Node 要求 `^22.18.0 || >=24.12.0`。

```text
patab-widget <dev|check|build|pack|inspect|keygen> [--root 目录] [--out 文件] [--sign 私钥]
```

无参数运行时打印帮助并以退出码 1 结束；`patab-widget help` 退出码为 0；未知命令报 `CHECK_FAILED`。

## 通用约定

- **配置来源**：CLI 只读项目根的 `patab.manifest.json`（用 SDK Schema 校验 + API 版本兼容性检查），没有独立的 CLI 配置文件。
- **输出**：所有输出为单行 JSON `{"ok": true|false, "code": "...", "message": "..."}`；成功退出码 0，失败 1。错误不泄露绝对路径、密钥或底层工具原始异常。
- **参数风格**：只有长选项，空格取值（`--root dir`，不支持 `--root=dir`）。任何未知参数直接报错——刻意不提供 `--force` 之类绕过安全校验的开关。
- **稳定错误码**：`API_INCOMPATIBLE | BUILD_FAILED | CHECK_FAILED | INTEGRITY_FAILED | INVALID_PACKAGE | MANIFEST_INVALID | SIGNATURE_INVALID | TYPE_CHECK_FAILED`。

## 选项

| 选项 | 适用命令 | 含义 | 默认 |
|---|---|---|---|
| `--root 目录` | 全部 | 组件项目根目录 | 当前工作目录 |
| `--host 地址` | `dev` | 监听地址 | `127.0.0.1` |
| `--port 端口` | `dev` | 监听端口（1–65535） | `5174`（strictPort，占用即失败） |
| `--no-open` | `dev` | 启动服务但不主动打开浏览器 | 默认打开 |
| `--out 文件` | `pack` | 输出 ZIP 路径（相对项目根） | `dist/<id>-<version>.patab.zip` |
| `--sign 私钥` | `pack` | PKCS#8 PEM 私钥路径（相对项目根） | 不签名 |
| `--key-out 文件` | `keygen` | 私钥输出路径 | 项目外 `.patab-widget-keys/` |

## dev — 真实 PaTab 开发宿主

```bash
patab-widget dev [--root 目录] [--host loopback] [--port 端口] [--no-open]
```

启动 CLI 内置的真实 PaTab 开发宿主并自动放置当前组件。surface 运行在 `sandbox="allow-scripts"` iframe 中，SDK 请求经过生产 SandboxAdapter 与 Capability Broker；源码入口使用 Vite HMR，PaTab 外壳不会被组件更新替换。launcher、安全状态和组件数据库按随机会话隔离，且服务只接受 `127.0.0.1`、`localhost` 或 `::1`。Ctrl+C 退出。详见[本地调试与测试](./guide/testing.md)。

## check — 校验项目

```bash
patab-widget check [--root 目录]
```

加载 Manifest → 构建全部 surface → 生成完整性清单 → 执行完整包校验（文件集、图片、配额、完整性、签名规则），**不写 ZIP**。成功输出 `组件校验通过：<id>@<version>`。

:::note
`check` **不运行** TypeScript 类型检查；类型检查只在 `pack` 中强制执行。
:::

## build — 验证可构建性

```bash
patab-widget build [--root 目录]
```

用项目自己的 Vite 配置把每个 surface 构建为完全自包含的 HTML 并报告数量（`已构建 N 个自包含 surface。`）。产物在临时目录中构建后即删除，**不落盘**——该命令用于验证可构建性。

## pack — 打包

```bash
patab-widget pack [--root 目录] [--out 文件] [--sign 私钥]
```

完整流水线：

1. 加载并校验 Manifest 与 API 版本兼容性
2. **强制运行项目的 `npm run type-check`**（失败报 `TYPE_CHECK_FAILED`）
3. 构建并内联全部 surface + 读取声明素材 + 规范 JSON Manifest → 生成 `integrity.json`（SHA-256 完整性清单）
4. 传入 `--sign` 时用 Ed25519 私钥生成 `signature.json`；**签名失败直接中断，不回退为未签名包**
5. 打包前执行与 `check` 相同的全量校验
6. 写出**确定性 ZIP**（Deflate 级别 9、mtime 固定 1980-01-01、条目按路径排序）：相同输入两次打包字节完全一致
7. 原子落盘：先写临时目录 → 对临时包完整 `inspect` 自检 → `rename` 到最终路径 → 再 `inspect` 最终包；任何失败删除临时产物

成功输出：`组件包已生成：<fileName>（已签名|未签名）`。`pack` 不接受额外位置参数。

## inspect — 复检成品包

```bash
patab-widget inspect <zip路径> [--root 目录]
```

读取 ZIP → 中央目录结构校验 → 解压 → 与 `check` 相同的完整校验（Manifest Schema、文件集、图片、完整性、签名；签名状态仅允许 `unsigned` 或 `valid`）。成功输出 `组件包检查通过：<id>@<version>`。`inspect` 永不执行 surface 代码，也不泄露归档路径或 HTML 内容。

## keygen — 生成签名密钥对

```bash
patab-widget keygen [--root 目录] [--key-out 文件]
```

生成 Ed25519 密钥对用于包签名：

- 私钥：PKCS#8 PEM，**AES-256-CBC 口令加密**，权限 `0o600`，文件已存在则拒绝覆盖
- 口令：交互终端两次输入（不回显），至少 12 字符；非交互环境通过环境变量 **`PATAB_WIDGET_KEY_PASSPHRASE`** 提供
- 默认输出到**项目根之外**的 `<项目父目录>/.patab-widget-keys/<id>.ed25519.pem`，避免误提交版本控制
- 输出的 `publicKeyBase64` 需**手动**填入 `patab.manifest.json` 的 `publisher.publicKey`

## 典型工作流

```bash
patab-widget dev          # 开发调试
patab-widget check        # 提交前校验
patab-widget pack         # 产出 dist/<id>-<version>.patab.zip
patab-widget inspect dist/<id>-<version>.patab.zip
patab-widget keygen       # 需要签名时先生成密钥
patab-widget pack --sign ../.patab-widget-keys/<id>.ed25519.pem
```
