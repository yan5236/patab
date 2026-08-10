<script setup lang="ts">
import type { WidgetDevSessionDescriptor } from '@patab/widget-sdk/dev-host'

/** 顶部开发标识只接收已校验的公开描述，不显示 token、本机路径或组件源码。 */
defineProps<{ descriptor: WidgetDevSessionDescriptor }>()
</script>

<template>
  <div class="pointer-events-none fixed left-1/2 top-3 z-[100] -translate-x-1/2">
    <div class="rounded-full border border-white/25 bg-slate-950/80 px-4 py-2 text-xs text-white shadow-xl backdrop-blur-xl">
      <span class="font-semibold">PaTab 组件开发</span>
      <span class="mx-2 text-white/35">·</span>
      <span class="text-white/75">
        {{ descriptor.component.manifest.id }}@{{ descriptor.component.manifest.version }}
      </span>
      <span class="mx-2 text-white/35">·</span>
      <span class="text-amber-200">HMR 仅供开发，发布前仍需 check / pack</span>
    </div>
  </div>
</template>
