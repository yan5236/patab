# @patab/widget-package

PaTab 自定义组件的 ZIP 与完整性共享基础包：统一的 fflate ZIP 原语、中央目录安全检查、SHA-256 完整性清单、Ed25519 签名与规范化 JSON。

本包面向 Node（CLI）与浏览器（PaTab 导入端）导出相同语义，确保两端对组件包格式的校验规则完全一致。

## 入口

| 入口 | 内容 |
|------|------|
| `@patab/widget-package` | 主入口（Node 与浏览器通用） |
| `@patab/widget-package/node` | Node / CLI 端入口 |
| `@patab/widget-package/browser` | 浏览器端：Worker 解压、静态图片解码（安装前安全预览图标与截图） |

## 包含

- fflate 统一封装（ZIP 读写原语，避免引入第二套归档实现）
- ZIP 中央目录安全检查（路径穿越、重复路径、异常条目）
- SHA-256 完整性清单（`integrity.json`）
- Ed25519 签名编码（`signature.json`）
- 规范化 JSON（哈希前序化）

> 本包是 `@patab/widget-cli` 与 PaTab 宿主导入端的共享实现，通常通过 `@patab/widget-cli` 间接使用，不面向最终用户。

## License

MIT
