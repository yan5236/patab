# @patab/widget-sdk

PaTab 自定义组件的官方 SDK：TypeScript 类型、运行时 API 客户端、Manifest 校验与测试工具。第三方组件通过本 SDK 与 PaTab 宿主的安全 Capability Broker 通信，组件代码只运行在隔离的 sandbox iframe 中，永远不会进入宿主页面上下文。

## 安装

```bash
npm install @patab/widget-sdk
```

## 快速开始

```ts
import { connectPatabWidgetClient, createWidgetApi } from '@patab/widget-sdk'

const client = connectPatabWidgetClient({ target: window.parent /* ... */ })
const api = createWidgetApi(client)

await api.ui.toast({ text: 'Hello from my widget!' })
```

完整可运行的组件项目使用官方脚手架创建：

```bash
npx create-patab-widget my-widget --template vue-ts
```

## 入口

| 入口 | 内容 |
|------|------|
| `@patab/widget-sdk` | 主入口：类型、协议常量、Manifest 校验 |
| `@patab/widget-sdk/client` | 与宿主通信的 `WidgetClient` |
| `@patab/widget-sdk/api` | 领域 API（`storage` / `todos` / `network` / `ui` / `channel`） |
| `@patab/widget-sdk/contracts` | 公开 DTO 与契约类型 |
| `@patab/widget-sdk/schema` | `patab.manifest.json` 的 JSON Schema |
| `@patab/widget-sdk/testing` | 本地开发与测试用的 Mock 宿主 |
| `@patab/widget-sdk/theme.css` | 官方主题 CSS 变量与 `pt-*` 语义样式 |

## 兼容性

SDK 版本、Manifest Schema 版本与运行时 API 版本各自独立；`WIDGET_SDK_METADATA` 提供 SDK 自身元数据，宿主在导入组件时按 `apiVersion` 做兼容性协商。

## License

MIT
