<script setup lang="ts">
/**
 * AppIcon —— 快捷方式图标
 * 按候选链依次尝试加载图片（自定义图标 → favicon 服务 → 站点 favicon.ico），
 * 全部失败时渲染"首字母 + 配色背景"兜底图标（SVG 实现，随任意尺寸缩放）。
 * 尺寸由父元素决定（本组件铺满），供屏幕图块 / Dock / 文件夹缩略图 / 弹窗预览复用。
 */
import { computed, ref, watch } from 'vue'
import { faviconCandidates, firstGlyph } from '@/utils/favicon'

const props = defineProps<{
  name: string
  url?: string
  iconUrl?: string
  /** 兜底图标背景色 */
  color: string
}>()

const candidates = computed(() => faviconCandidates(props.url ?? '', props.iconUrl))
/** 已失败的候选数量，指向下一个待尝试地址 */
const failCount = ref(0)

// 网址/图标变化时重置尝试进度
watch(candidates, () => {
  failCount.value = 0
})

const src = computed(() => candidates.value[failCount.value])
</script>

<template>
  <div class="h-full w-full overflow-hidden rounded-[inherit]">
    <!-- 图片图标：白底衬托，favicon 居中 -->
    <div v-if="src" class="flex h-full w-full items-center justify-center bg-white">
      <img
        :src="src"
        :alt="name"
        draggable="false"
        loading="lazy"
        class="h-3/5 w-3/5 object-contain"
        @error="failCount++"
      >
    </div>
    <!-- 兜底：首字母色块（SVG 文字随图标尺寸等比缩放） -->
    <svg v-else viewBox="0 0 100 100" class="h-full w-full" :style="{ backgroundColor: color }">
      <text
        x="50"
        y="52"
        text-anchor="middle"
        dominant-baseline="central"
        fill="white"
        font-size="46"
        font-weight="600"
      >
        {{ firstGlyph(name) }}
      </text>
    </svg>
  </div>
</template>
