/**
 * drag store —— 拖拽会话状态
 *
 * 由 useLongPressDrag 引擎写入，供以下消费方读取：
 * - App.vue 顶层渲染跟随指针的"幽灵图标"
 * - 各放置目标组件高亮当前悬停位置
 *
 * 拖拽落点的实际数据移动由 launcher store 的 handleDrop 完成。
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { DragSource, DropTarget, Tile } from '@/types'

/** 把 DropTarget 序列化成稳定字符串，供组件比较"我是否被悬停" */
export function dropTargetKey(target: DropTarget | null): string {
  if (!target) return ''
  switch (target.kind) {
    case 'cell':
      return `cell:${target.zone}:${target.containerId}:${target.index}`
    case 'slot':
      return `slot:${target.screenId}:${target.col}:${target.row}`
    case 'grid':
      return `grid:${target.screenId}:${target.index}`
    case 'folder-tile':
      return `folder-tile:${target.folderId}`
    case 'dock':
      return `dock:${target.index}`
    case 'pager':
      return `pager:${target.screenId}`
    case 'folder-outside':
      return 'folder-outside'
  }
}

export const useDragStore = defineStore('drag', () => {
  /** 当前被拖拽的图块（null = 未在拖拽） */
  const tile = shallowRef<Tile | null>(null)
  /** 被拖拽图块的来源位置 */
  const source = shallowRef<DragSource | null>(null)
  /** 指针实时坐标（供幽灵图标跟随） */
  const pointerX = ref(0)
  const pointerY = ref(0)
  /** 来源图块的实际像素尺寸（供幽灵图标等比还原，尤其是整卡小组件） */
  const sourceWidth = ref(0)
  const sourceHeight = ref(0)
  /** 当前悬停的放置目标 */
  const hoverTarget = shallowRef<DropTarget | null>(null)

  /* ---------- 紧凑模式「让位」预览 ---------- */
  /** 预览生效的屏幕 id（null = 未在紧凑预览） */
  const previewScreenId = ref<string | null>(null)
  /** 该屏各图块的预览坐标（id → {col,row}），含被拖图块的落点 */
  const previewPositions = shallowRef<Map<string, { col: number; row: number }> | null>(null)
  /** 被拖图块在有序序列中的插入下标（供落位提交） */
  const compactIndex = ref(0)

  const isDragging = computed(() => tile.value !== null)
  const hoverKey = computed(() => dropTargetKey(hoverTarget.value))

  /** 开始拖拽会话 */
  function start(
    dragTile: Tile,
    dragSource: DragSource,
    x: number,
    y: number,
    width = 0,
    height = 0,
  ) {
    tile.value = dragTile
    source.value = dragSource
    pointerX.value = x
    pointerY.value = y
    sourceWidth.value = width
    sourceHeight.value = height
    hoverTarget.value = null
  }

  /** 指针移动时更新坐标与悬停目标 */
  function update(x: number, y: number, target: DropTarget | null) {
    pointerX.value = x
    pointerY.value = y
    hoverTarget.value = target
  }

  /** 写入紧凑模式让位预览（拖拽悬停在某主屏网格上时） */
  function setCompactPreview(
    screenId: string,
    positions: Map<string, { col: number; row: number }>,
    index: number,
  ) {
    previewScreenId.value = screenId
    previewPositions.value = positions
    compactIndex.value = index
  }

  /** 清除紧凑预览（指针离开网格 / 结束拖拽时） */
  function clearCompactPreview() {
    previewScreenId.value = null
    previewPositions.value = null
    compactIndex.value = 0
  }

  /** 结束拖拽会话（无论是否成功放置） */
  function end() {
    tile.value = null
    source.value = null
    sourceWidth.value = 0
    sourceHeight.value = 0
    hoverTarget.value = null
    clearCompactPreview()
  }

  return {
    tile,
    source,
    pointerX,
    pointerY,
    sourceWidth,
    sourceHeight,
    hoverTarget,
    previewScreenId,
    previewPositions,
    compactIndex,
    isDragging,
    hoverKey,
    start,
    update,
    setCompactPreview,
    clearCompactPreview,
    end,
  }
})
