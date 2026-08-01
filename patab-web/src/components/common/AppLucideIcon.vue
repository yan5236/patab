<script setup lang="ts">
/**
 * AppLucideIcon —— 持久化图标名的统一渲染入口
 * 自动兼容旧 Emoji 与非法名称，调用方只需传入原始字符串。
 */
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { LucideIcon } from '@lucide/vue'
import { getCommonScreenIconComponent } from '@/utils/screenIcons'

const props = defineProps<{ name: string }>()
const iconComponent = shallowRef<LucideIcon>()
let requestId = 0

/** 按名称异步载入图标，并忽略快速切换名称时已经过期的请求。 */
async function updateIcon(name: string) {
  const currentRequest = ++requestId
  const commonIcon = getCommonScreenIconComponent(name)
  if (commonIcon) {
    iconComponent.value = commonIcon
    return
  }
  const { loadScreenIconComponent } = await import('@/utils/screenIconLibrary')
  const component = await loadScreenIconComponent(name)
  if (currentRequest === requestId) iconComponent.value = component
}

watch(() => props.name, updateIcon, { immediate: true })
onBeforeUnmount(() => requestId++)
</script>

<template>
  <component :is="iconComponent" v-if="iconComponent" aria-hidden="true" />
</template>
