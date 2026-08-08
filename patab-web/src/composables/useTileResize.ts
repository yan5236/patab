/**
 * useTileResize —— 图块尺寸拖拽变形
 *
 * 按住图块右下角的拖拽柄拖动，把指针位移换算成格数增量，
 * 在该图块类型的允许尺寸表（allowedSizesFor）中按曼哈顿距离吸附，
 * 只落「放得下」（isAreaFree，忽略自身）的尺寸；实时写入 tile.size 形成预览。
 * 紧凑模式（自动排序）下不要求目标区域为空：直接吸附最近尺寸，
 * 复用拖拽的「让位预览」（setCompactPreview + FLIP）让其他图块实时绕开，
 * 松手时 recompactScreen 提交与预览一致的紧凑坐标并清除预览。
 */
import type { Screen, Tile } from '@/types'
import { useDragStore } from '@/stores/drag'
import { useLauncherStore } from '@/stores/launcher'
import { recompactScreen } from '@/stores/launcherPlacement'
import {
  allowedSizesFor,
  isAreaFree,
  normalizeTileSize,
  packOrder,
  rowMajorOrder,
  tileSize,
} from '@/utils/grid'

export function useTileResize(getTile: () => Tile) {
  const launcher = useLauncherStore()
  const drag = useDragStore()

  /** 拖拽柄 pointerdown：开始一次尺寸变形会话 */
  function onHandlePointerdown(event: PointerEvent) {
    if (event.button !== 0) return
    const tile = getTile()
    const allowed = allowedSizesFor(tile)
    if (allowed.length === 0) return
    const found = launcher.findScreenOf(tile.id)
    if (!found || !Number.isFinite(tile.col) || !Number.isFinite(tile.row)) return
    const screen: Screen = found
    const wrapper = (event.target as HTMLElement).closest<HTMLElement>('[data-resize-tile]')
    const grid = wrapper?.closest<HTMLElement>('.screen-grid')
    if (!wrapper || !grid) return

    event.preventDefault()
    event.stopPropagation()

    // 用图块当前渲染尺寸反推格距（格宽 = 图块宽 + 间隙）/ 占格数，避免依赖网格内边距
    const start = tileSize(tile)
    const rect = wrapper.getBoundingClientRect()
    const gridStyle = getComputedStyle(grid)
    const gapX = parseFloat(gridStyle.columnGap) || 0
    const gapY = parseFloat(gridStyle.rowGap) || 0
    const pitchX = (rect.width + gapX) / start.w
    const pitchY = (rect.height + gapY) / start.h
    const startX = event.clientX
    const startY = event.clientY
    const col = tile.col ?? 0
    const row = tile.row ?? 0

    /** 按指针位置吸附到最近且放得下的允许尺寸并实时应用 */
    function apply(clientX: number, clientY: number) {
      const targetW = start.w + Math.round((clientX - startX) / pitchX)
      const targetH = start.h + Math.round((clientY - startY) / pitchY)
      const candidates = [...allowed].sort(
        (a, b) =>
          Math.abs(a.w - targetW) + Math.abs(a.h - targetH) -
          (Math.abs(b.w - targetW) + Math.abs(b.h - targetH)),
      )
      // 紧凑模式：不要求空位，吸附最近尺寸后重排整屏，被挡的图块实时让位
      if (launcher.settings.placementMode === 'compact') {
        const size = candidates[0]
        if (!size) return
        const current = tileSize(tile)
        if (current.w === size.w && current.h === size.h) return
        if (tile.type === 'folder' || tile.type === 'widget') {
          tile.size = { w: size.w, h: size.h }
          normalizeTileSize(tile) // 命中默认尺寸时移除自定义字段
        }
        // 按当前行主序重新紧凑打包，作为让位预览（FLIP 动画由 useGridFlip 补）
        drag.setCompactPreview(screen.id, packOrder(rowMajorOrder(screen.tiles)), 0)
        return
      }
      for (const size of candidates) {
        if (!isAreaFree(screen, col, row, size.w, size.h, tile.id)) continue
        const current = tileSize(tile)
        if (current.w === size.w && current.h === size.h) return
        if (tile.type === 'folder' || tile.type === 'widget') {
          tile.size = { w: size.w, h: size.h }
          normalizeTileSize(tile) // 命中默认尺寸时移除自定义字段
        }
        return
      }
    }

    function onMove(moveEvent: PointerEvent) {
      apply(moveEvent.clientX, moveEvent.clientY)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (launcher.settings.placementMode === 'compact') {
        // 提交与预览一致的紧凑坐标（先落坐标再清预览，避免视觉跳变）
        recompactScreen(screen)
        drag.clearCompactPreview()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { onHandlePointerdown }
}
