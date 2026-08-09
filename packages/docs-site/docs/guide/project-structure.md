---
sidebar_position: 1
---

# 项目结构

脚手架生成的组件项目目录结构如下（`vue-ts` 模板会多出 `vite.config.ts` 与三个 `.vue` 文件）：

```text
my-widget/
├── patab.manifest.json            # 组件清单（固定文件名，工具链唯一配置来源）
├── schema/
│   └── patab.manifest.schema.json # Manifest JSON Schema 副本，供编辑器补全
├── package.json
├── tsconfig.json
├── src/
│   ├── env.d.ts
│   ├── widget.spec.ts             # 基于 Mock 宿主的单元测试示例
│   └── surfaces/
│       ├── widget.html            # 网格图块 surface（必须存在）
│       ├── widget.ts
│       ├── detail.html            # 详情弹层 surface（可选）
│       ├── detail.ts
│       ├── settings.html          # 设置弹层 surface（可选）
│       └── settings.ts
└── assets/
    ├── icon.png                   # 组件图标
    └── screenshots/
        └── preview.png            # 预览截图（可选，最多 5 张）
```

## 关键约定

- **`patab.manifest.json`** 是工具链读取的唯一配置文件，没有额外的 CLI 配置文件。字段详见 [Manifest 配置](./manifest.md)。
- **Surface 源码位置**：Manifest 中 `surfaces.<name>.entry` 声明为 `surfaces/<name>.html`，对应的源码必须位于 `src/surfaces/<name>.html`。每个 surface 是一个独立 HTML 入口，由项目自己的 Vite 配置单独构建。
- **素材路径** 相对项目根（如 `assets/icon.png`），只允许出现在 `assets/` 下。
- **`package.json` scripts**：脚手架生成以下脚本，其中 `type-check` 会被 `pack` 强制调用：

```json
{
  "scripts": {
    "dev": "patab-widget dev",
    "check": "patab-widget check",
    "build": "patab-widget build",
    "pack": "patab-widget pack",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

## 最终包内允许的文件

`pack` 采用**白名单制**：包内只允许出现 Manifest 声明过的文件，多一个、少一个都会被拒绝。固定内容：

- `patab.manifest.json`（规范 JSON 序列化）
- 每个 surface 一个完全自包含的 HTML（JS/CSS/图片/字体全部内联为 data URL，禁止外链资源、动态 `import()`、HMR client、source map）
- Manifest 声明的素材：icon、screenshots、variants 图标
- `integrity.json`（SHA-256 完整性清单）
- `signature.json`（仅签名打包时）

## 依赖说明

| 依赖 | 作用 |
|---|---|
| `@patab/widget-sdk` | 组件运行时代码（dependencies） |
| `@patab/widget-cli` | 开发/校验/打包工具链（devDependencies），内含 Vite |
| `vue` + `@vitejs/plugin-vue` | 仅 `vue-ts` 模板 |

`vanilla-ts` 模板没有 `vite.config.ts`（零配置）；`vue-ts` 模板的 `vite.config.ts` 仅注册 Vue 插件。CLI 只校验最终自包含 HTML，你可以按需添加其它 Vite 插件。
