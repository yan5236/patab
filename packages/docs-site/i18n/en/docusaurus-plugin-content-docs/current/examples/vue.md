---
sidebar_position: 2
---

# vue-widget Example

`examples/vue-widget` is the official example for the `vue-ts` template: Vue 3 SFC + `@vitejs/plugin-vue`. Its structure is the same as the vanilla example, with only an added `vite.config.ts` and one `.vue` file per surface.

## Differences from the vanilla Example

| Item | vanilla-widget | vue-widget |
|---|---|---|
| Framework | None (plain TS manipulating the DOM) | Vue 3.5 SFC |
| Vite config | None (zero-config) | `vite.config.ts` registering the Vue plugin |
| Surface entry | `widget.ts` renders directly | `widget.ts` mounts + `widget.vue` component |
| Theme response | Subscribes to the `themeChanged` event | Relies on host token injection (CSS follows automatically) |
| Dependencies | `@patab/widget-sdk` | Adds `vue`, `@vitejs/plugin-vue` |

The Manifest, tsconfig, and test files are character-for-character identical to vanilla (only the widget ID/name differ).

## vite.config.ts

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()] })
```

The CLI only validates the final self-contained HTML and does not restrict Vite plugins — frameworks like React/Svelte work the same way, as long as they can build to self-contained HTML.

## Entry TS: Mounting

```ts
import { createApp } from 'vue'
import '@patab/widget-sdk/theme.css'
import App from './widget.vue'

createApp(App).mount('#app')
```

Each surface has one mount script + one SFC (`widget`/`detail`/`settings` share the same structure).

## SFC Walkthrough

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

Key points:

1. **Async connection goes in `onMounted`**: `connectPatabWidgetClient()` is asynchronous; the template uses optional chaining as a fallback for first-frame rendering (`context?.surface ?? 'widget'`).
2. **Reactive context**: storing the `WidgetContext` in a `ref` naturally wires SDK data into Vue rendering. To react to theme/locale changes, additionally subscribe to `themeChanged`/`localeChanged` and update the `ref`.
3. **No manual theme handling needed**: this example does not subscribe to `themeChanged` — when the theme switches, the host writes the new `--pt-*` tokens directly onto the sandbox root node, and any CSS referencing the tokens (including the `theme.css` semantic classes) follows automatically.

## Testing and Running

Unit tests are exactly the same as vanilla (Mock Host + vitest). To run locally:

```bash
cd examples/vue-widget
pnpm install
pnpm dev      # 打开 http://127.0.0.1:5174/__patab_widget_simulator__
pnpm check && pnpm pack
```

The repo-root `scripts/verify-widget-examples.mjs` runs check/build/deterministic pack comparison/inspect on both examples in sequence, plus keygen-signed packing and signature verification — a useful reference for CI integration.
