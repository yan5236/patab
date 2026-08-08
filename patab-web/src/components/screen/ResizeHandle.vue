<script setup lang="ts">
/**
 * ResizeHandle —— 图块「调整尺寸」拖拽柄
 * 白色圆形 + 斜向双箭头，悬浮在图块右下角；按住拖动在允许尺寸间变换。
 * data-nodrag 避免触发长按拖拽引擎；pointerdown 由父级 useTileResize 接管。
 */
import { MoveDiagonal2 } from '@lucide/vue'

const emit = defineEmits<{ (e: 'resize-start', event: PointerEvent): void }>()
</script>

<template>
  <button
    data-nodrag
    class="absolute -bottom-2 -right-2 z-30 hidden h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600 shadow-md transition-transform duration-150 hover:scale-110 sm:flex"
    @pointerdown="emit('resize-start', $event)"
    @click.stop
    @contextmenu.stop
  >
    <MoveDiagonal2 :size="13" :stroke-width="2.5" />
  </button>
</template>
