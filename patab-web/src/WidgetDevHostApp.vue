<script setup lang="ts">
import type { WidgetDevSessionDescriptor } from '@patab/widget-sdk/dev-host'

import App from './App.vue'
import WidgetDevHostBanner from './components/custom-components/WidgetDevHostBanner.vue'

/** 专用开发根组件把真实 PaTab 与显式开发标识组合，正式入口不会导入此文件。 */
defineProps<{ descriptor: WidgetDevSessionDescriptor }>()
</script>

<template>
  <App />
  <WidgetDevHostBanner :descriptor="descriptor" />
</template>
