<script setup lang="ts">
/**
 * TileItem —— 网格图块分发器
 * 职责（对所有图块类型统一）：
 * 1. 按 tile.type 分发渲染 ShortcutTile / FolderTile / 待办小组件
 * 2. 标注放置目标 data 属性：主屏用 slot（坐标），文件夹用 cell（下标）
 * 3. 绑定长按拖拽（来源 = 所在容器 + 下标）
 * 4. 拖拽中的视觉反馈：自己被拖走时留出空位（隐形占位）、被悬停时高亮
 * 主屏网格（自由摆放）与文件夹展开层（紧凑）复用同一个组件（zone 区分）。
 */
import { computed } from 'vue'
import type { DragSource, Tile } from '@/types'
import { useDragStore } from '@/stores/drag'
import { useLauncherStore } from '@/stores/launcher'
import { useLongPressDrag } from '@/composables/useLongPressDrag'
import { COLS, tileSize } from '@/utils/grid'
import ShortcutTile from './ShortcutTile.vue'
import FolderTile from './FolderTile.vue'
import TodoWidget from '@/components/widgets/TodoWidget.vue'

const props = defineProps<{
  tile: Tile
  zone: 'screen' | 'folder'
  containerId: string
  index: number
}>()

const drag = useDragStore()
const launcher = useLauncherStore()

/** 本图块处于紧凑模式的主屏（整格由容器接管放置、拖拽走让位重排） */
const isCompactScreen = computed(
  () => props.zone === 'screen' && launcher.settings.placementMode === 'compact',
)

/** 紧凑让位预览生效时，本图块的预览坐标（否则为 null，用自身坐标） */
const previewPos = computed(() => {
  if (!isCompactScreen.value || drag.previewScreenId !== props.containerId) return null
  return drag.previewPositions?.get(props.tile.id) ?? null
})

const source = computed<DragSource>(() =>
  props.zone === 'screen'
    ? { kind: 'screen', screenId: props.containerId, index: props.index }
    : { kind: 'folder', folderId: props.containerId, index: props.index },
)

const { onPointerdown } = useLongPressDrag(() => ({ tile: props.tile, source: source.value }))

/** 本图块正在被拖拽（主屏：原位留空；文件夹：半透明占位） */
const isDragSource = computed(() => drag.tile?.id === props.tile.id)
/** 文件夹内拖拽悬停在本单元格上（主屏的悬停高亮由空格放置层负责） */
const isHoverCell = computed(
  () =>
    props.zone === 'folder' &&
    drag.hoverKey === `cell:folder:${props.containerId}:${props.index}`,
)

/** 图标由长按拖拽接管触摸；小组件保留纵向滚动能力 */
const tileTouchAction = computed(() => (props.tile.type === 'widget' ? 'pan-y' : 'none'))

/** 主屏图块的网格定位（坐标 + 占位跨度）；文件夹内走自动流式排列 */
const cellStyle = computed(() => {
  if (props.zone !== 'screen') return { touchAction: tileTouchAction.value } as const
  const { w, h } = tileSize(props.tile)
  // 紧凑让位预览生效时按预览坐标渲染，否则用图块自身坐标
  const pos = previewPos.value
  const col = pos ? pos.col : props.tile.col ?? 0
  const row = pos ? pos.row : props.tile.row ?? 0
  return {
    gridColumn: `${col + 1} / span ${w}`,
    gridRow: `${row + 1} / span ${h}`,
    order: row * COLS + col,
    touchAction: tileTouchAction.value,
  } as const
})

</script>

<template>
  <div
    class="relative rounded-2xl transition-all duration-150"
    :class="[
      zone === 'screen' ? 'screen-tile' : '',
      zone === 'screen' && tile.type === 'widget' ? 'screen-tile--widget' : '',
      zone === 'screen' && isDragSource ? 'invisible' : '',
      zone === 'folder' && isDragSource ? 'opacity-30' : '',
      isDragSource ? 'pointer-events-none' : '',
      isHoverCell ? 'bg-white/25 ring-2 ring-white/70' : '',
    ]"
    :style="cellStyle"
    :data-drop="zone === 'folder' ? 'cell' : isCompactScreen ? undefined : 'slot'"
    :data-zone="zone === 'folder' ? 'folder' : undefined"
    :data-container="zone === 'folder' ? containerId : undefined"
    :data-index="zone === 'folder' ? index : undefined"
    :data-flip-tile="zone === 'screen' ? tile.id : undefined"
    :data-screen="zone === 'screen' && !isCompactScreen ? containerId : undefined"
    :data-col="zone === 'screen' && !isCompactScreen ? tile.col : undefined"
    :data-row="zone === 'screen' && !isCompactScreen ? tile.row : undefined"
    @pointerdown="onPointerdown"
  >
    <ShortcutTile v-if="tile.type === 'shortcut'" :shortcut="tile" :in-folder="zone === 'folder'" />
    <FolderTile v-else-if="tile.type === 'folder'" :folder="tile" />
    <TodoWidget v-else :tile-id="tile.id" />
  </div>
</template>
