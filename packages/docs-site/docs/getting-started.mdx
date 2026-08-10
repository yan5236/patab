---
sidebar_position: 2
---

# 快速开始

本指南带你在几分钟内创建、调试、打包并安装第一个 PaTab 组件。

## 环境要求

- Node.js `^22.18.0 || >=24.12.0`
- 任一包管理器（npm / pnpm / yarn 均可）

## 1. 用脚手架创建项目

```bash
npm create patab-widget@latest my-widget
```

也可以用 `pnpm create patab-widget my-widget` 或 `npx create-patab-widget my-widget`——三者调用的是同一个脚手架。

交互式终端会询问模板：

```text
选择模板：1) vue-ts  2) vanilla-ts [1]：
```

- `vue-ts`（默认，回车即选）：Vue 3 SFC + `@vitejs/plugin-vue`
- `vanilla-ts`：原生 TypeScript，无框架

也可以直接用 `--template` 跳过提问（CI 等非交互环境**必须**使用该选项）：

```bash
npx create-patab-widget my-widget --template vanilla-ts
```

脚手架只生成文件，不会自动安装依赖。目标目录已存在时会拒绝覆盖。

## 2. 安装依赖并启动本地模拟器

```bash
cd my-widget
pnpm install
pnpm dev
```

`pnpm dev` 实际执行 `patab-widget dev`，启动本地模拟器后输出：

```text
模拟器已启动：http://127.0.0.1:5174/__patab_widget_simulator__
```

在浏览器打开该地址即可看到模拟器：右侧是运行在 `sandbox="allow-scripts"` iframe 中的组件 surface，左侧控制面板可以切换 surface、尺寸、variant、主题、语言、减少动画偏好，并 mock 确认框、网络响应与 toast 日志。模拟器基于 Vite dev server，修改源码即时热更新。

:::warning[模拟器 ≠ 宿主直连]

PaTab 宿主**没有**调试 URL 接入口，开发期不会把本地地址填进 PaTab。模拟器是独立的本地调试环境；要验证真实集成效果，需按下面步骤打包后重新导入 PaTab。

:::

## 3. 校验与构建

```bash
pnpm check   # 校验 Manifest + 构建全部 surface + 完整性/配额检查（不写 ZIP）
pnpm build   # 仅验证每个 surface 能构建为自包含 HTML（不落盘产物）
```

## 4. 打包为可分发文件

```bash
pnpm pack
```

`pack` 会先强制运行项目的 `type-check`（`tsc --noEmit`），然后构建并内联全部 surface、生成完整性清单、执行完整包校验，最终写出确定性 ZIP：

```text
组件包已生成：<id>-<version>.patab.zip（未签名）
```

产物默认位于 `dist/<id>-<version>.patab.zip`。相同输入两次 `pack` 产出的 ZIP 字节完全一致。

如需签名分发，先用 `patab-widget keygen` 生成 Ed25519 密钥对，把输出的公钥填入 `patab.manifest.json` 的 `publisher.publicKey`，再执行 `patab-widget pack --sign <私钥路径>`。详见 [CLI 参考](./cli.md)。

## 5. 在 PaTab 中安装

打开 PaTab 新标签页，通过组件导入入口选择生成的 `.patab.zip` 文件。PaTab 会静态审查包（Manifest、素材、完整性、签名，全程不执行组件代码），展示组件的名称、版本、开发者、签名状态、权限与网络来源声明；确认必需的权限与网络来源后即可安装，随后将组件以图块形式添加到网格。

## 下一步

- [项目结构](./guide/project-structure.md)：了解脚手架生成的每个文件
- [Manifest 配置](./guide/manifest.md)：声明 surfaces、尺寸、variants、权限与网络来源
- [运行时与生命周期](./guide/runtime.md)：组件如何与宿主握手、获取上下文、打开弹层
- [Widget SDK 参考](./sdk/connection.md)：全部 API 的签名与示例
