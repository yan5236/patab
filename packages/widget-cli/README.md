# @patab/widget-cli

PaTab 自定义组件的官方命令行工具：Manifest 校验、surface 构建、确定性 ZIP 打包、Ed25519 签名与本地开发模拟器。

## 安装

```bash
npm install -g @patab/widget-cli
# 或作为项目开发依赖
npm install -D @patab/widget-cli
```

## 命令

| 命令 | 说明 |
|------|------|
| `patab-widget dev` | 启动本地 HMR 沙箱模拟器，可切换 surface、尺寸、浅色/深色、语言、variant 与权限 Mock |
| `patab-widget check` | 校验 Manifest、JSON Schema、API 版本、surface、权限、域名与配额 |
| `patab-widget build` | 用 Vite 为每个 surface 生成独立的自包含 HTML（内联 JS、CSS、图片与字体） |
| `patab-widget pack` | 完整流水线：清理 → 类型检查 → 构建 → 校验 → SHA-256 完整性 → 可选 Ed25519 签名 → 确定性 ZIP → 生成后自检 |
| `patab-widget inspect <zip>` | 以与 PaTab 导入端相同的规则检查已有组件包，输出结构、权限、哈希与签名报告 |
| `patab-widget keygen` | 生成口令保护、默认保存于项目外的 Ed25519 签名密钥 |

## 选项

- `--root <目录>`：组件项目根目录（默认当前目录）
- `--out <文件>`：`pack` 输出路径
- `--sign <私钥>`：`pack` 时用 Ed25519 私钥签名（交互读取口令）
- `--host` / `--port`：`dev` 模拟器监听地址
- `--key-out <文件>`：`keygen` 私钥输出路径

> `pack` 强制执行完整流水线，刻意不提供跳过安全校验的开关；未签名包仍可打包安装，但会被明确标识为"未签名"。

## License

MIT
