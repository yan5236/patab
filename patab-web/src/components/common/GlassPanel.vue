<script setup lang="ts">
/**
 * GlassPanel —— 毛玻璃容器
 * 统一全站的半透明模糊卡片外观（Dock / 文件夹 / 弹窗 / 小组件共用）
 * 圆角、内边距等由调用方通过 class 追加；strong 提高不透明度（用于弹窗等需要更好可读性的场景）
 */
withDefaults(defineProps<{ strong?: boolean }>(), { strong: false })
</script>

<template>
  <div
    class="theme-glass-panel border shadow-lg backdrop-blur-2xl"
    :class="strong ? 'is-strong' : ''"
  >
    <slot />
  </div>
</template>
