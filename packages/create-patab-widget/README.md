# create-patab-widget

PaTab 自定义组件的官方项目脚手架，提供 `vue-ts` 与 `vanilla-ts` 两套模板。

## 用法

```bash
pnpm create patab-widget
# 或直接提供项目名和模板，跳过对应问题
pnpm create patab-widget my-widget --template vue-ts
# 或
npm create patab-widget my-widget -- --template vanilla-ts
```

不带参数时，交互式终端会依次询问项目名和模板。只提供项目名时则仅询问模板。

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
pnpm run pack   # 类型检查 + 构建 + 校验 + 确定性 ZIP 打包
```

最终的 `.patab.zip` 通过 PaTab 的"添加自定义组件"入口导入安装。

## 维护者发布

本包在工作区内使用 `workspace:*` 依赖 `@patab/widget-sdk`，发布时必须使用 pnpm：

```bash
pnpm --dir packages/create-patab-widget pack --pack-destination <临时目录>
pnpm --dir packages/create-patab-widget publish --access public
```

pnpm 会把 tarball 中的 `workspace:*` 转换为 SDK 的实际版本，同时保留源码中的 workspace 链接便利性。发布前必须检查 tarball 内的 `package/package.json`；禁止使用不会执行该转换的 `npm publish`。

## License

MIT
