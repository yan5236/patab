# create-patab-widget

PaTab 自定义组件的官方项目脚手架，提供 `vue-ts` 与 `vanilla-ts` 两套模板。

## 用法

```bash
pnpm create patab-widget my-widget --template vue-ts
# 或
npm create patab-widget my-widget -- --template vanilla-ts
```

模板选择：

- `vue-ts`：Vue 3 + TypeScript
- `vanilla-ts`：原生 TypeScript，零框架

非交互环境（CI）必须显式传入 `--template`。

## 生成的项目

```text
my-widget/
├── patab.manifest.json   # 组件清单，绑定官方 JSON Schema
├── src/surfaces/         # widget、detail、settings 的源码与 HTML 入口
├── assets/               # 安装前静态展示的图标与截图
├── schema/               # 脚手架复制的 Manifest Schema
├── tests/                # 组件自身测试
├── vite.config.ts
└── package.json
```

## 开发与打包

```bash
cd my-widget
pnpm install
pnpm dev    # 本地 HMR 沙箱模拟器
pnpm check  # Manifest 与资源校验
pnpm pack   # 类型检查 + 构建 + 校验 + 确定性 ZIP 打包
```

最终的 `.patab.zip` 通过 PaTab 的"添加自定义组件"入口导入安装。

## License

MIT
