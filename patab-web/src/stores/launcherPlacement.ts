/**
 * launcher 主屏坐标辅助
 *
 * 只处理图块在 Screen.tiles 顶层时的坐标落位与紧凑回填；
 * 不读取 Pinia 状态，调用方显式传入 screen/tile。
 */
import type { Screen, Tile } from '@/types'
import { firstFreeSlot, packOrder, rowMajorOrder, tileSize } from '@/utils/grid'

/** 把图块放到某屏幕并赋予网格坐标；pos 缺省时寻首个空位（allowOverflow 兜底，绝不失败） */
export function placeOnScreen(screen: Screen, tile: Tile, pos?: { col: number; row: number }) {
  const { w, h } = tileSize(tile)
  const slot = pos ?? firstFreeSlot(screen, w, h, tile.id, { allowOverflow: true })
  tile.col = slot?.col ?? 0
  tile.row = slot?.row ?? 0
}

/** 清除图块的主屏坐标（移入文件夹 / Dock 时调用，避免脏坐标复现） */
export function clearPos(tile: Tile) {
  tile.col = undefined
  tile.row = undefined
}

/** 紧凑模式：按当前视觉顺序重新紧凑打包某屏，回填移出/删除留下的空位 */
export function recompactScreen(screen: Screen) {
  const positions = packOrder(rowMajorOrder(screen.tiles))
  for (const tile of screen.tiles) {
    const pos = positions.get(tile.id)
    if (pos) {
      tile.col = pos.col
      tile.row = pos.row
    }
  }
}
