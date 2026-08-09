<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="PaTab：把浏览器新标签页变成由搜索、快捷方式、文件夹、待办和 Dock 组成的本地工作台" />
</p>

<p align="center">
  <a href="https://patab.nanhaiblog.top"><strong>在线体验</strong></a>
  ·
  <a href="https://patab-introduction.nanhaiblog.top">产品介绍</a>
  ·
  <a href="https://patab-introduction.nanhaiblog.top/install/">安装指南</a>
  ·
  <a href="https://patab-introduction.nanhaiblog.top/changelog/">更新日志</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white" alt="Vue 3.5" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6.0" />
  <img src="https://img.shields.io/badge/Chrome%20%2F%20Edge-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 与 Edge Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-21B28A" alt="MIT License" />
</p>

## 先看效果

<p align="center">
  <img src="./assets/pc-screenshot.jpg" width="72%" alt="PaTab 桌面端：搜索、快捷方式、文件夹、待办与 Dock 组成的浏览器工作台" />
  &nbsp;
  <img src="./assets/mobile-screenshot.jpg" width="23%" alt="PaTab 移动端纵向工作台界面" />
</p>

PaTab 是一个本地优先的浏览器起始页。它用熟悉的桌面布局整理常用网站、搜索入口与待办事项，同时提供网页版和 Chrome / Edge Manifest V3 新标签页扩展。

## 为什么用 PaTab

- **桌面式整理**：8×4 磁贴网格、多屏分页、自由或紧凑布局，把不同场景分开收纳。
- **搜索一步直达**：预置 7 个搜索引擎，支持实时联想与自定义搜索模板。
- **拖拽完成归类**：快捷方式、文件夹、屏幕与 Dock 共享自然的拖放体验。
- **待办就在眼前**：智能列表、自定义清单、日期、星标和排序无需切换应用。
- **按你的环境显示**：自定义壁纸、浅色 / 深色 / 跟随系统主题，以及中英文界面。
- **数据留在本机**：无需注册，桌面配置保存在当前浏览器的 `localStorage`，不会上传到 PaTab 服务器。

## 使用方式

### 在线使用

打开 [patab.nanhaiblog.top](https://patab.nanhaiblog.top)，无需安装即可体验完整界面。

### 接管浏览器新标签页

Chrome 与 Edge 商店版本仍在准备中。现在可以从 [GitHub Releases](https://github.com/yan5236/patab/releases/latest/download/patab-extension.zip) 下载离线包，并按照 [安装指南](https://patab-introduction.nanhaiblog.top/install/) 手动加载。

> 网页版与扩展版运行在不同的浏览器存储空间，配置不会自动同步。

## 本地开发

环境要求：Node.js `^22.18.0 || >=24.12.0`，并使用仓库锁定的 pnpm 依赖。

```bash
git clone https://github.com/yan5236/patab.git
cd patab
pnpm install
pnpm dev:web
```

主应用运行在 `http://localhost:6109`。介绍站位于 `patab-introduction/`，开发端口为 `6108`（`pnpm dev:intro`）。

本仓库是 pnpm monorepo，依赖安装只在根目录执行一次，所有子项目共享根目录的 `pnpm-lock.yaml`。

### 常用命令

```bash
# 仓库根目录
pnpm dev:web             # 启动主应用
pnpm dev:intro           # 启动介绍站
pnpm build               # 构建全部子项目
pnpm test                # 运行全部测试

# patab-web/
pnpm dev                 # 启动主应用
pnpm build               # 构建网页版
pnpm build:extension     # 构建 MV3 扩展
pnpm test:unit           # 运行单元测试

# patab-introduction/
pnpm dev                 # 启动介绍站
pnpm build               # 构建介绍站
```

## 自定义组件开发

PaTab 支持从组件商店导入本地 `.zip` / `.patab.zip` 第三方组件。安装前只审查 Manifest、静态素材、完整性、签名与用户确认的权限；第三方代码仅在隔离 sandbox iframe 中运行，不能直接访问宿主 DOM、Pinia、浏览器本地存储或扩展 API。

开发者请阅读[自定义组件开发指南](./docs/custom-component-development.md)，其中包含脚手架、Manifest、SDK、主题、模拟器、打包、签名、更新与故障排查。安装前的安全边界、剩余风险与安全使用建议见[自定义组件安全说明](./docs/custom-component-security.md)。

## 项目组成

```text
patab/
├── patab-web/            # Vue 3 主应用与 Chrome / Edge MV3 扩展构建
├── patab-introduction/   # React 介绍站、安装指南、更新日志与法律页面
├── packages/             # 自定义组件平台：SDK、ZIP 包基础库、CLI 与脚手架
├── examples/             # 自定义组件官方示例（Vanilla 与 Vue）
├── scripts/              # CI 使用的示例与签名验证脚本
├── assets/               # README 与产品展示资源
├── docs/                 # 架构、安全和代码风格文档
└── NOTICE                # 生产依赖开放源代码许可清单
```

| 部分 | 技术 |
| --- | --- |
| 主应用 | Vue 3、TypeScript、Pinia、Tailwind CSS、motion-v、vue-i18n |
| 构建与测试 | Vite 8、Vitest、Vue Test Utils、jsdom |
| 介绍站 | React 19、GSAP、Tailwind CSS、Vite |
| 浏览器扩展 | Chrome / Edge Manifest V3，与网页版共享 Vue 业务源码 |
| 组件平台 | `packages/` 下的 widget-sdk、widget-package、widget-cli、create-patab-widget |

更完整的模块职责和依赖方向见 [架构说明](./docs/ARCHITECTURE.md)。

## 参与开发

开始修改前，请先阅读：

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)：模块职责与依赖方向
- [STYLE.md](./docs/STYLE.md)：代码风格、组件化和测试约定
- [SECURITY.md](./docs/SECURITY.md)：输入、持久化与扩展权限边界
- [custom-component-development.md](./docs/custom-component-development.md)：自定义组件开发、打包与迁移流程
- [custom-component-security.md](./docs/custom-component-security.md)：第三方组件公开安全说明与剩余风险

提交变更前至少运行：

```bash
pnpm --dir patab-web build
pnpm --dir patab-web test:unit -- --run
```

欢迎通过 [Issues](https://github.com/yan5236/patab/issues) 提交问题与建议。

## 许可证

PaTab 基于 [MIT License](./license) 开源。第三方生产依赖许可见 [NOTICE](./NOTICE)。

© 2026 yan5236
