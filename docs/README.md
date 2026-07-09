# PaTab 项目说明

PaTab 是一个 Vue 3 + Vite 构建的浏览器起始页应用，目标是提供类桌面的快捷访问、分屏管理、Dock、待办小组件和壁纸配置体验。

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

## 维护要求

- 新功能先阅读 `docs/ARCHITECTURE.md` 和 `docs/STYLE.md`。
- 涉及用户输入、URL、持久化或外部资源时，同时阅读 `docs/SECURITY.md`。
- 修改架构、数据结构或开发约定后，同步更新 `docs/` 和 `.project-memory/`。
