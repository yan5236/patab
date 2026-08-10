# PaTab 项目说明

PaTab 是一个 Vue 3 + Vite 构建的浏览器起始页应用，目标是提供类桌面的快捷访问、分屏管理、Dock、待办小组件、壁纸配置和本地自定义组件体验。

## 技术栈

- 前端框架：Vue 3
- 构建工具：Vite
- 类型系统：TypeScript
- 状态管理：Pinia
- 样式：Tailwind CSS
- 图标：@lucide/vue
- 动效：motion-v
- 测试：Vitest、@vue/test-utils、jsdom
- 包管理：pnpm

## 项目结构

```text
patab-web/
├── public/              # 静态资源
├── src/
│   ├── components/      # Vue 组件
│   ├── composables/     # 组合式函数
│   ├── stores/          # Pinia 状态
│   ├── types/           # 全局类型
│   ├── utils/           # 纯工具函数
│   └── __tests__/       # 单元测试
├── vite.config.ts
└── package.json
```

## 环境要求

- Node.js：`^22.18.0 || >=24.12.0`
- pnpm：使用仓库已有 `pnpm-lock.yaml`

## 常用命令

```sh
cd patab-web
pnpm install
pnpm dev
pnpm build
pnpm build:extension
pnpm test:unit
pnpm run deploy
```

介绍站：

```sh
cd patab-introduction
pnpm run deploy
```

`patab-web` 和介绍站都通过 Cloudflare Pages 部署。`patab-web` 生产域名为 `https://patab.nanhaiblog.top`，介绍站生产域名为 `https://patab-introduction.nanhaiblog.top`。

## 自定义组件导入

组件商店支持选择本地 `.zip` 或 `.patab.zip`。PaTab 在安装前只完成 ZIP、Manifest、静态图片、完整性与签名审查，并要求用户确认声明的权限和精确 HTTPS 网络来源；审查过程不会运行组件代码。已安装组件包和授权保存在独立 IndexedDB，主屏只保留轻量实例引用。

同 ID 的高版本会进入更新审查：仍声明的旧授权可以保留，新增权限或网络来源需要再次确认。更新在临时版本中迁移并检查所有现有实例，成功后原子切换版本、数据和授权；失败或取消始终保留当前版本和数据。

组件运行在 24 小时内连续三次握手失败、超时或协议洪泛后会自动停用并显示稳定原因。PaTab 启动会记录第三方组件初始化；连续三次异常中断自动进入安全模式，核心界面和组件管理仍可使用，但不会创建任何第三方 iframe。用户可在组件商店退出安全模式，再逐个明确重新启用实例。

卸载先展示关联实例、版本和私有数据数量；取消不会变更数据。二次确认后，单个原子事务会删除组件包、授权、活动/回滚/暂存版本、私有数据、健康记录和关联主屏引用。

开发者工作流、Manifest、SDK、真实 PaTab 开发宿主、确定性打包、签名、更新迁移和故障排查见[自定义组件开发指南](./custom-component-development.md)。用户与审核人员可阅读[自定义组件安全说明](./custom-component-security.md)，了解安装前审查、sandbox 边界、网络权限、自动停用与仍无法由浏览器完全消除的 CPU/内存风险。

## 维护要求

- 新功能先阅读 `docs/ARCHITECTURE.md` 和 `docs/STYLE.md`。
- 涉及用户输入、URL、持久化或外部资源时，同时阅读 `docs/SECURITY.md`。
- 修改架构、数据结构或开发约定后，同步更新 `docs/` 和 `.project-memory/`。
