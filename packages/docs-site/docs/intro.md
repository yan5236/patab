---
sidebar_position: 1
slug: /
---

# PaTab 自定义组件平台

PaTab 是一个本地优先的浏览器新标签页工作台。除了内置的搜索、快捷方式、文件夹与待办，PaTab 还提供**自定义组件（Widget）平台**：开发者可以编写自己的组件，以图块（Tile）形式放到新标签页的网格上运行。

## 平台能力

- **框架无关**：使用任意前端技术栈（原生 TypeScript、Vue 等）编写组件，工具链只校验最终产物，不限制源码框架。官方脚手架首发 `vue-ts` 与 `vanilla-ts` 两个模板。
- **公开 SDK**：通过 `@patab/widget-sdk` 与宿主交互——读取上下文、读写实例私有存储、调用宿主 UI（toast、确认框、外链、弹层）、订阅主题/语言/尺寸等生命周期事件，以及按权限访问待办数据和受控网络请求。
- **完整工具链**：`create-patab-widget` 脚手架一键创建项目；`@patab/widget-cli` 提供本地模拟器调试、校验、构建、打包与签名。
- **可分发**：组件打包为确定性的 `.patab.zip` 文件（标准 ZIP 归档），支持 Ed25519 可选签名，可直接分享给其他 PaTab 用户导入安装。

## 架构一图流

组件**不进入宿主应用**：第三方代码运行在不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe 中，无法访问宿主 DOM、Pinia、localStorage 或浏览器扩展 API。组件与宿主之间的唯一通道是握手时由宿主转移给 iframe 的 `MessagePort`，所有 API 调用都经过宿主侧唯一的 **Capability Broker** 逐次校验（协议版本、会话身份、消息形状、权限、配额与频率）。

```text
┌─ PaTab 宿主 ────────────────────────────────┐
│                                             │
│   Capability Broker  ── 存储 / 待办 / UI / 网络 │
│        ▲                                    │
│        │ MessagePort RPC（patab-widget / v1）│
│        ▼                                    │
│   ┌─────────────────────────────┐           │
│   │ sandbox iframe（组件 surface）│          │
│   │  @patab/widget-sdk           │           │
│   └─────────────────────────────┘           │
└─────────────────────────────────────────────┘
```

## 文档地图

- [快速开始](./getting-started.mdx)：用脚手架创建、调试、打包并安装你的第一个组件
- [开发指南](./guide/project-structure.md)：项目结构、Manifest、生命周期、能力、主题与多语言、本地调试与测试
- [Widget SDK 参考](./sdk/connection.md)：`@patab/widget-sdk` 全部 API、事件、类型与错误码
- [CLI 参考](./cli.md)：`patab-widget` 的全部命令与选项
- [包格式与分发](./package-format.md)：`.patab.zip` 的物理格式、完整性与签名
- [安全模型](./security.md)：沙箱、CSP、Broker 校验、配额与故障恢复
- [示例解析](./examples/vanilla.md)：vanilla 与 Vue 两个官方示例的关键代码讲解

:::tip
PaTab 主项目源码见 [GitHub - yan5236/patab](https://github.com/yan5236/patab)，插件相关工具链位于仓库的 `packages/` 目录，官方示例位于 `examples/` 目录。
:::
