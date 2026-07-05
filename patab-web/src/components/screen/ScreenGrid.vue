<script setup lang="ts">
/**
 * ScreenGrid —— 单个应用屏幕的图标网格（固定分页网格 + 自由摆放）
 * - 固定 COLS×ROWS 网格铺满一屏；图块按各自 (col,row) 坐标定位，空位保留不回填
 * - 拖拽时渲染「空格放置层」：每个未被占用的格子是一个 slot 放置目标
 *   （排除正被拖走的图块，使其原格也变成可放置的空位 → 手机式留空/回位）
 * - 旧数据溢出一屏时降级为可滚动（罕见），保证不丢图块
 */
import { computed, ref } from 'vue'
import type { Screen } from '@/types'
import { useDragStore } from '@/stores/drag'
import { useLauncherStore } from '@/stores/launcher'
import { useGridFlip } from '@/composables/useGridFlip'
import { COLS, ROWS, rowMajorOrder, tileSize } from '@/utils/grid'
import TileItem from './TileItem.vue'

const props = defineProps<{ screen: Screen }>()

const drag = useDragStore()
const launcher = useLauncherStore()

/** 紧凑模式：整格网格作为放置面板 + 手机式让位；自由模式沿用空格 slot 放置层 */
const isCompact = computed(() => launcher.settings.placementMode === 'compact')

/** 紧凑模式按当前行主序渲染，保证手机端自动流式网格与数据坐标一致 */
const renderedTiles = computed(() =>
  isCompact.value ? rowMajorOrder(props.screen.tiles) : props.screen.tiles,
)

/** 网格容器引用，供 FLIP 采集各图块位置做让位滑动 */
const gridRef = ref<HTMLElement | null>(null)
useGridFlip(gridRef)

/** 正被拖走的本屏图块 id（用于把它的格子当作空位）；来源非本屏时为 null */
const draggedId = computed(() =>
  drag.tile && drag.source?.kind === 'screen' && drag.source.screenId === props.screen.id
    ? drag.tile.id
    : null,
)

/** 屏幕内已占用到的最大行（含溢出），用于判断是否需要滚动降级 */
const maxRow = computed(() => {
  let m = ROWS
  for (const t of props.screen.tiles) {
    if (!Number.isFinite(t.row)) continue
    m = Math.max(m, (t.row ?? 0) + tileSize(t).h)
  }
  return m
})

/** 内容溢出一屏（仅旧数据可能出现）：降级为固定行高 + 纵向滚动 */
const isOverflow = computed(() => maxRow.value > ROWS)

const gridStyle = computed(() =>
  isOverflow.value
    ? { gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridAutoRows: '106px' }
    : {
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
      },
)

/** 未被占用的可视格子（排除被拖走的图块），仅拖拽时用于渲染放置层 */
const emptyCells = computed(() => {
  // 扁平占位表（长度 ROWS*COLS，下标 = row*COLS+col），规避严格索引访问告警
  const occ = new Array<boolean>(ROWS * COLS).fill(false)
  for (const t of props.screen.tiles) {
    if (t.id === draggedId.value) continue
    if (!Number.isFinite(t.col) || !Number.isFinite(t.row)) continue
    const { w, h } = tileSize(t)
    const col0 = t.col ?? 0
    const row0 = t.row ?? 0
    for (let r = row0; r < row0 + h; r++) {
      for (let c = col0; c < col0 + w; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) occ[r * COLS + c] = true
      }
    }
  }
  const cells: { col: number; row: number }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!occ[r * COLS + c]) cells.push({ col: c, row: r })
    }
  }
  return cells
})
</script>

<template>
  <div
    ref="gridRef"
    class="screen-grid grid gap-3 p-2"
    :class="isOverflow ? 'overflow-y-auto' : 'h-full w-full overflow-hidden'"
    :style="gridStyle"
    :data-drop="isCompact ? 'grid' : undefined"
    :data-screen="isCompact ? screen.id : undefined"
  >
    <TileItem
      v-for="(tile, i) in renderedTiles"
      :key="tile.id"
      :tile="tile"
      zone="screen"
      :container-id="screen.id"
      :index="i"
    />

    <!-- 空格放置层：仅自由模式拖拽时出现（紧凑模式整格由容器接管让位） -->
    <template v-if="drag.isDragging && !isCompact">
      <div
        v-for="cell in emptyCells"
        :key="`${cell.col}-${cell.row}`"
        class="z-10 rounded-2xl transition-colors"
        :class="
          drag.hoverKey === `slot:${screen.id}:${cell.col}:${cell.row}`
            ? 'bg-white/25 ring-2 ring-white/70'
            : ''
        "
        :style="{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }"
        data-drop="slot"
        :data-screen="screen.id"
        :data-col="cell.col"
        :data-row="cell.row"
      />
    </template>

    <!-- 空屏幕引导（拖拽时隐藏，避免与放置层重叠） -->
    <div
      v-if="screen.tiles.length === 0 && !drag.isDragging"
      class="flex items-center justify-center text-sm text-white/70"
      style="grid-column: 1 / -1; grid-row: 1 / -1"
    >
      屏幕还是空的，右键空白处创建快捷方式吧
    </div>
  </div>
</template>

<style scoped>
/* 手机端主屏改为纵向流式网格，保留桌面端固定坐标网格。 */
@media (max-width: 640px) {
  .screen-grid {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)) !important;
    grid-template-rows: none !important;
    grid-auto-rows: 112px !important;
    align-content: start;
    gap: 1rem;
    height: 100%;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    padding: 0.25rem;
  }

  .screen-grid :deep(.screen-tile) {
    grid-column: auto !important;
    grid-row: auto !important;
  }

  .screen-grid :deep(.screen-tile--widget) {
    grid-column: span 3 !important;
    grid-row: span 3 !important;
    min-height: 220px;
  }
}
</style>
