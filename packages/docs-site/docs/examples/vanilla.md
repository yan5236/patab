---
sidebar_position: 1
---

# vanilla-widget 示例

`examples/vanilla-widget` 是 `vanilla-ts` 模板的官方示例：原生 TypeScript、无框架、零 Vite 配置。它与 `npx create-patab-widget my-widget --template vanilla-ts` 生成的项目结构一致。

## 目录结构

```text
vanilla-widget/
├── patab.manifest.json
├── schema/patab.manifest.schema.json
├── package.json
├── tsconfig.json
├── assets/
│   ├── icon.png
│   └── screenshots/preview.png
└── src/
    ├── env.d.ts                 # /// <reference types="vite/client" />
    ├── widget.spec.ts           # Mock 宿主单元测试
    └── surfaces/
        ├── widget.html / widget.ts
        ├── detail.html / detail.ts
        └── settings.html / settings.ts
```

## Manifest 要点

```json
{
  "id": "com.example.examples-vanilla-widget",
  "surfaces": {
    "widget":   { "entry": "surfaces/widget.html",   "title": { "default": "组件", "...": "..." } },
    "detail":   { "entry": "surfaces/detail.html",   "title": { "...": "..." }, "modalSize": "medium" },
    "settings": { "entry": "surfaces/settings.html", "title": { "...": "..." }, "modalSize": "small" }
  },
  "sizes": [{ "w": 2, "h": 2 }, { "w": 3, "h": 2 }],
  "defaultSize": { "w": 2, "h": 2 },
  "variants": [
    { "id": "compact",  "supportedSizes": [{ "w": 2, "h": 2 }], "...": "..." },
    { "id": "expanded", "supportedSizes": [{ "w": 3, "h": 2 }], "...": "..." }
  ],
  "defaultVariant": "compact",
  "permissions": { "optional": ["todos.read"] }
}
```

演示了三个 surface（widget 图块 + detail/settings 弹层）、双尺寸、双 variant，以及**可选权限** `todos.read` 的声明方式。

## 入口 HTML

每个 surface 一个极简 HTML 骨架，仅含挂载点与模块脚本：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>widget</title>
</head>
<body>
  <main id="app"></main>
  <script type="module" src="./widget.ts"></script>
</body>
</html>
```

打包时 CLI 会把 `./widget.ts` 构建产物内联进这个 HTML，产出完全自包含的 `surfaces/widget.html`。

## 入口 TS 讲解

```ts
import '@patab/widget-sdk/theme.css'
import { connectPatabWidgetClient, createWidgetApi, type WidgetThemeChangedEvent } from '@patab/widget-sdk'

async function start(): Promise<void> {
  // 1. 连接宿主：等待 MessagePort 握手完成
  const client = await connectPatabWidgetClient()
  const api = createWidgetApi(client)

  // 2. 读取上下文：surface 名、variant、主题、权限快照
  const context = await api.context.get()

  const root = document.querySelector<HTMLElement>('#app')
  if (!root) return
  root.innerHTML = '<h1>' + context.surface + '</h1><p>' + (context.variantId ?? 'default') + '</p><button class="pt-button">保存示例</button>'

  // 3. 实例存储：点击按钮把当前 surface 写入实例私有存储
  root.querySelector('button')?.addEventListener('click', () => {
    void api.storage.set('lastSurface', context.surface)
  })

  // 4. 事件订阅：主题变化时更新根节点标记
  api.on<WidgetThemeChangedEvent>('themeChanged', (event) => {
    document.documentElement.dataset.theme = event.theme
  })

  // 5. 可选权限：先检查 granted 快照再调用，未授权时静默降级
  if (context.permissions.granted.includes('todos.read')) {
    void api.todos.list().catch(() => undefined)
  }
}

void start()
```

逐条要点：

1. **连接**：`connectPatabWidgetClient()` 是唯一入口，组件不接触 `window.parent`/`postMessage`。
2. **上下文**：`context.get()` 提供渲染所需的环境信息（这里渲染了 surface 名与 variant ID）。
3. **存储**：`storage.set` 演示实例私有存储——不同实例（同一组件多次添加到网格）的数据互不可见。
4. **主题**：导入 `theme.css` 获得 `pt-*` 语义类（按钮用了 `.pt-button`），并订阅 `themeChanged` 做自定义响应。注意示例中的 `pt-card`/`pt-title`/`pt-muted` 不是 SDK 契约类，实际项目中请使用 [theme.css](../sdk/theme-css.md) 列出的语义类。
5. **权限降级**：`todos.read` 是可选权限，用户可能未开启或随时撤销——先查快照、再 `.catch()` 兜底是推荐写法（撤销后调用会得到 `PERMISSION_DENIED`）。

## 单元测试

```ts
import { expect, it } from 'vitest'
import { createWidgetMockHost } from '@patab/widget-sdk/testing'

it('读取 Mock 存储', async () => {
  const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } })
  await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' })
  host.close()
})
```

用 [Mock 宿主](../sdk/testing.md) 注入初始存储，走真实 RPC 协议断言读取结果。运行 `pnpm test`（`vitest run`）。

## 本地运行

```bash
cd examples/vanilla-widget
pnpm install
pnpm dev      # 打开真实 PaTab 开发宿主并自动挂载组件
pnpm check && pnpm run pack && pnpm exec patab-widget inspect dist/*.patab.zip
```
