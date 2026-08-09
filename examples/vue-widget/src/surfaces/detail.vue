<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { connectPatabWidgetClient, createWidgetApi, type WidgetContext } from '@patab/widget-sdk'

const context = ref<WidgetContext>()
const api = ref<ReturnType<typeof createWidgetApi>>()

/** 连接 SDK 并读取公开 context，主题变化仍由宿主 token 注入。 */
onMounted(async () => {
  const client = await connectPatabWidgetClient()
  api.value = createWidgetApi(client)
  context.value = await api.value.context.get()
  if (context.value.permissions.granted.includes('todos.read')) void api.value.todos.list().catch(() => undefined)
})

/** 将当前 surface 写入实例私有存储，不直接访问 localStorage。 */
function save(): void {
  if (api.value && context.value) void api.value.storage.set('lastSurface', context.value.surface)
}
</script>

<template><main class="pt-card"><h1 class="pt-title">{{ context?.surface ?? 'detail' }}</h1><p class="pt-muted">{{ context?.variantId ?? 'default' }}</p><button class="pt-button" @click="save">保存示例</button></main></template>
