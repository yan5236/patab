---
sidebar_position: 2
---

# vue-widget 示例

`examples/vue-widget` 是 `vue-ts` 模板的官方示例：Vue 3 SFC + `@vitejs/plugin-vue`。结构与 vanilla 示例相同，仅多 `vite.config.ts` 与每个 surface 一份 `.vue` 文件。

## 与 vanilla 示例的差异

| 项 | vanilla-widget | vue-widget |
|---|---|---|
| 框架 | 无（原生 TS 操作 DOM） | Vue 3.5 SFC |
| Vite 配置 | 无（零配置） | `vite.config.ts` 注册 Vue 插件 |
| surface 入口 | `widget.ts` 直接渲染 | `widget.ts` 挂载 + `widget.vue` 组件 |
| 主题响应 | 订阅 `themeChanged` 事件 | 依赖宿主 token 注入（CSS 自动跟随） |
| 依赖 | `@patab/widget-sdk` | 增加 `vue`、`@vitejs/plugin-vue` |

Manifest、tsconfig、测试文件与 vanilla 逐字一致（仅组件 ID/名称不同）。

## vite.config.ts

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()] })
```

CLI 只校验最终自包含 HTML，不限制 Vite 插件——React/Svelte 等框架同理，只要能构建为自包含 HTML 即可。

## 入口 TS：挂载

```ts
import { createApp } from 'vue'
import '@patab/widget-sdk/theme.css'
import App from './widget.vue'

createApp(App).mount('#app')
```

每个 surface 一份挂载脚本 + 一份 SFC（`widget`/`detail`/`settings` 结构相同）。

## SFC 讲解

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { connectPatabWidgetClient, createWidgetApi, type WidgetContext } from '@patab/widget-sdk'

const context = ref<WidgetContext>()
const api = ref<ReturnType<typeof createWidgetApi>>()

onMounted(async () => {
  // 1. 挂载后连接宿主并读取上下文
  const client = await connectPatabWidgetClient()
  api.value = createWidgetApi(client)
  context.value = await api.value.context.get()

  // 2. 可选权限降级（同 vanilla 示例）
  if (context.value.permissions.granted.includes('todos.read')) {
    void api.value.todos.list().catch(() => undefined)
  }
})

function save(): void {
  // 3. 实例存储（替代 localStorage）
  if (api.value && context.value) {
    void api.value.storage.set('lastSurface', context.value.surface)
  }
}
</script>

<template>
  <main>
    <h1>{{ context?.surface ?? 'widget' }}</h1>
    <p>{{ context?.variantId ?? 'default' }}</p>
    <button class="pt-button" @click="save">保存示例</button>
  </main>
</template>
```

要点：

1. **异步连接放在 `onMounted`**：`connectPatabWidgetClient()` 是异步的，模板用可选链兜底首帧渲染（`context?.surface ?? 'widget'`）。
2. **响应式上下文**：把 `WidgetContext` 存入 `ref`，SDK 数据自然接入 Vue 渲染。若需响应主题/语言变化，再订阅 `themeChanged`/`localeChanged` 更新 `ref`。
3. **主题无需手动处理**：该示例不订阅 `themeChanged`——宿主在主题切换时直接把新 `--pt-*` token 写入 sandbox 根节点，引用 token 的 CSS（含 `theme.css` 语义类）自动跟随。

## 测试与运行

单元测试与 vanilla 完全相同（Mock 宿主 + vitest）。本地运行：

```bash
cd examples/vue-widget
pnpm install
pnpm dev      # 打开 http://127.0.0.1:5174/__patab_widget_simulator__
pnpm check && pnpm pack
```

仓库根的 `scripts/verify-widget-examples.mjs` 会对两个示例依次执行 check/build/确定性 pack 比对/inspect，以及 keygen 签名打包与验签，可作为 CI 集成参考。
