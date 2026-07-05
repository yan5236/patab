<script setup lang="ts">
/**
 * DockItem —— Dock 栏中的一个快捷方式
 * 悬停：轻微放大 + 上方名称气泡（设计稿要求）
 * 长按拖动可重排 / 拖回屏幕；右键：移出 Dock / 编辑 / 删除
 */
import { computed } from 'vue'
import { Pencil, SquareArrowUp, Trash2 } from '@lucide/vue'
import type { Shortcut } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useDragStore } from '@/stores/drag'
import { useLongPressDrag } from '@/composables/useLongPressDrag'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{ item: Shortcut; index: number }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const drag = useDragStore()

const { onPointerdown } = useLongPressDrag(() => ({
  tile: props.item,
  source: { kind: 'dock', index: props.index },
}))

const isDragSource = computed(() => drag.tile?.id === props.item.id)
/** 拖拽悬停在本位置（即将插入到这里） */
const isHovered = computed(() => drag.hoverKey === `dock:${props.index}`)

function open() {
  window.location.href = props.item.url
}

/** 移出 Dock：放回当前屏幕末尾 */
function moveOut() {
  const screen = ui.currentScreen
  if (!screen) return
  launcher.handleDrop(
    props.item.id,
    { kind: 'dock', index: props.index },
    { kind: 'cell', zone: 'screen', containerId: screen.id, index: screen.tiles.length },
  )
}

function onMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    { label: '移出 Dock', icon: SquareArrowUp, action: moveOut },
    {
      label: '编辑',
      icon: Pencil,
      action: () => ui.openModal({ type: 'shortcut-edit', shortcutId: props.item.id }),
    },
    {
      label: '删除',
      icon: Trash2,
      danger: true,
      action: () => launcher.removeTile(props.item.id),
    },
  ])
}

</script>

<template>
  <div
    class="group relative shrink-0"
    style="touch-action: none"
    data-drop="dock"
    :data-index="index"
    @pointerdown="onPointerdown"
  >
    <!-- 悬停名称气泡 -->
    <div
      class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-800/85 px-2.5 py-1 text-xs text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100"
    >
      {{ item.name }}
    </div>

    <button
      class="block h-12 w-12 cursor-pointer rounded-2xl shadow shadow-black/15 transition-all duration-150 hover:scale-110"
      :class="[
        isDragSource ? 'opacity-30' : '',
        isHovered ? 'translate-x-1 ring-2 ring-sky-300' : '',
      ]"
      @click="open"
      @contextmenu="onMenu"
    >
      <AppIcon :name="item.name" :url="item.url" :icon-url="item.iconUrl" :color="item.color" />
    </button>
  </div>
</template>
