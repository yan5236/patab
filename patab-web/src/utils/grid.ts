/**
 * grid —— 主屏幕固定分页网格的布局工具（纯函数，便于单测）
 *
 * 主屏幕采用「固定 列×行 网格 + 显式坐标」模型：每个图块携带 (col,row)，
 * 空位保留、不自动回填（区别于文件夹 / Dock 的紧凑排列）。本模块集中：
 * - 网格尺寸常量 COLS/ROWS
 * - 图块占位尺寸 tileSize（小组件占多格）
 * - 占位/碰撞检测 isAreaFree、寻空位 firstFreeSlot
 * - 迁移/自动布局 layoutScreen（把无坐标的旧数据 / 种子行主序打包）
 */
import type { Screen, Tile } from '@/types'

/** 每屏列数（集中常量，方便调参；小组件 3×2 需 COLS≥3） */
export const COLS = 8
/** 每屏行数（铺满一屏不滚动；小组件 3×2 需 ROWS≥2） */
export const ROWS = 4

/** 溢出扫描时允许的最大行数（远超一屏，作为兜底上限，防止死循环） */
const OVERFLOW_MAX_ROW = 1000

/** 图块在网格中占用的宽高（格数） */
export function tileSize(tile: Tile): { w: number; h: number } {
  if (tile.type === 'widget') return { w: 3, h: 2 }
  return { w: 1, h: 1 }
}

/** 两个矩形是否相交（左闭右开） */
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay)
}

/** 某图块是否已定位（col/row 均为有限数） */
function isPlaced(tile: Tile): tile is Tile & { col: number; row: number } {
  return Number.isFinite(tile.col) && Number.isFinite(tile.row)
}

/**
 * 目标矩形区域是否可放置
 * @param ignoreId 忽略该 id 的图块（重排时忽略自己）
 * @param opts.allowOverflow 允许超出底部行数（用于溢出兜底）
 */
export function isAreaFree(
  screen: Screen,
  col: number,
  row: number,
  w: number,
  h: number,
  ignoreId?: string,
  opts?: { allowOverflow?: boolean },
): boolean {
  // 边界校验
  if (col < 0 || row < 0 || col + w > COLS) return false
  if (!opts?.allowOverflow && row + h > ROWS) return false
  // 与已放置图块逐块检测（用完整占位尺寸）
  for (const t of screen.tiles) {
    if (t.id === ignoreId || !isPlaced(t)) continue
    const { w: tw, h: th } = tileSize(t)
    if (rectsOverlap(col, row, w, h, t.col, t.row, tw, th)) return false
  }
  return true
}

/**
 * 行主序扫描第一个能容纳 w×h 的空位
 * @returns 找到返回 {col,row}；满页且非 overflow 返回 null
 */
export function firstFreeSlot(
  screen: Screen,
  w: number,
  h: number,
  ignoreId?: string,
  opts?: { allowOverflow?: boolean },
): { col: number; row: number } | null {
  const maxRow = opts?.allowOverflow ? OVERFLOW_MAX_ROW : ROWS - h
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= COLS - w; col++) {
      if (isAreaFree(screen, col, row, w, h, ignoreId, opts)) return { col, row }
    }
  }
  return null
}

/**
 * 迁移 / 自动布局：为屏幕内图块补齐坐标
 * - 幂等：已合法（有限整数、在界内、互不重叠）的坐标保留为锚点，二次运行为空操作
 * - 不丢数据：缺坐标或坐标冲突的图块按数组顺序（旧紧凑数据的视觉顺序）用 allowOverflow 回填，
 *   即使溢出一屏也分配到底部行，绝不丢弃
 */
export function layoutScreen(screen: Screen): void {
  // Pass A：保留互不重叠的合法坐标作为锚点；其余标记待重排
  const kept: Tile[] = []
  const pending: Tile[] = []
  for (const tile of screen.tiles) {
    const { w, h } = tileSize(tile)
    if (isPlaced(tile) && isAreaFreeAmong(kept, tile.col, tile.row, w, h)) {
      kept.push(tile)
    } else {
      pending.push(tile)
    }
  }

  // 清除待重排图块的脏坐标，避免它们在 Pass B 的占位检测中干扰寻空位
  for (const tile of pending) {
    tile.col = undefined
    tile.row = undefined
  }

  // Pass B：按原数组顺序为待重排图块寻空位（allowOverflow 保证一定有落点）
  for (const tile of pending) {
    const { w, h } = tileSize(tile)
    const slot = firstFreeSlot(screen, w, h, tile.id, { allowOverflow: true })
    if (slot) {
      tile.col = slot.col
      tile.row = slot.row
    }
  }
}

/** 在给定图块子集内判断某矩形是否可放（供 layoutScreen 的 Pass A 判定重叠） */
function isAreaFreeAmong(
  tiles: Tile[],
  col: number,
  row: number,
  w: number,
  h: number,
): boolean {
  if (col < 0 || row < 0 || col + w > COLS) return false
  for (const t of tiles) {
    if (!isPlaced(t)) continue
    const { w: tw, h: th } = tileSize(t)
    if (rectsOverlap(col, row, w, h, t.col, t.row, tw, th)) return false
  }
  return true
}

/* ========== 紧凑模式（手机桌面式让位）排布工具 ========== */

/**
 * 取屏幕内已定位图块，按行主序（先行后列）排序，得到当前视觉序列
 * 未定位的图块（脏坐标）排到末尾，保证不丢块
 */
export function rowMajorOrder(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    const ap = isPlaced(a)
    const bp = isPlaced(b)
    if (!ap || !bp) return ap === bp ? 0 : ap ? -1 : 1
    return a.row - b.row || a.col - b.col
  })
}

/**
 * 已放置矩形（供 packOrder 内部逐个模拟落位时做碰撞检测）
 */
interface PlacedRect {
  col: number
  row: number
  w: number
  h: number
}

/** 在一组已放置矩形中扫描第一个能容纳 w×h 的空位（行主序，溢出兜底不失败） */
function firstFreeAmongRects(rects: PlacedRect[], w: number, h: number): { col: number; row: number } {
  for (let row = 0; row <= OVERFLOW_MAX_ROW; row++) {
    for (let col = 0; col <= COLS - w; col++) {
      const clash = rects.some((r) => rectsOverlap(col, row, w, h, r.col, r.row, r.w, r.h))
      if (!clash) return { col, row }
    }
  }
  return { col: 0, row: 0 }
}

/**
 * 按给定顺序把图块逐个「紧凑」打包进网格：每个图块落到当前首个可容纳其尺寸的空位。
 * 普通图标 1×1、小组件 3×2 都能稳定处理（小组件占满 3×2 再继续排后续图块）。
 * 纯函数：不修改入参，返回 id → 目标坐标 的映射（供拖拽预览与最终落位共用）。
 */
export function packOrder(order: Tile[]): Map<string, { col: number; row: number }> {
  const placed: PlacedRect[] = []
  const result = new Map<string, { col: number; row: number }>()
  for (const tile of order) {
    const { w, h } = tileSize(tile)
    const slot = firstFreeAmongRects(placed, w, h)
    placed.push({ col: slot.col, row: slot.row, w, h })
    result.set(tile.id, slot)
  }
  return result
}

/**
 * 返回「真实布局」中覆盖 (col,row) 格的图块（按 tile.col/row 判定，不受拖拽预览位移影响）。
 * 用于紧凑模式稳定判断悬停格是否落在某文件夹上（避免文件夹被让位推走后判不准）。
 * @param ignoreId 忽略该 id 的图块（通常为被拖图块自身）
 */
export function tileAt(
  tiles: Tile[],
  col: number,
  row: number,
  ignoreId?: string,
): Tile | undefined {
  for (const t of tiles) {
    if (t.id === ignoreId || !isPlaced(t)) continue
    const { w, h } = tileSize(t)
    if (col >= t.col && col < t.col + w && row >= t.row && row < t.row + h) return t
  }
  return undefined
}

/**
 * 把指针像素坐标换算成网格格坐标（相对网格容器 rect），并夹紧到界内。
 * 用于紧凑模式判断「悬停在哪一格」。
 */
export function cellFromPoint(rect: DOMRect, x: number, y: number): { col: number; row: number } {
  const cw = rect.width / COLS
  const ch = rect.height / ROWS
  const col = Math.floor((x - rect.left) / cw)
  const row = Math.floor((y - rect.top) / ch)
  return {
    col: Math.max(0, Math.min(col, COLS - 1)),
    row: Math.max(0, Math.min(row, ROWS - 1)),
  }
}

/**
 * 手机端流式网格：由指针相对网格内容区的像素坐标 + 格距/列数，算出「流式插入槽位」。
 *
 * 手机端图标按 `order` 顺序在 cols 列 auto-fill 网格里连续排布，视觉槽位即序列下标，
 * 因此几何槽位 `row*cols + col`（指针落在格右半再进一位）就是插入下标。
 *
 * 纯几何、不读各图块当前矩形：故不受「让位 FLIP 动画中间态」影响，也不会因被拖图标占着
 * 预览槽位、测量又排除它而形成自我参照反馈（旧实现 insertionIndexFromRects 的空位滞后手指一格、
 * 疯狂闪烁的根因）。
 *
 * @param relX,relY 指针相对网格内容区左上角（已扣除 padding、含滚动）的像素偏移
 * @param pitchX,pitchY 单元格水平/垂直步距（格宽/高 + 间隙）
 * @param cols 网格实际渲染列数
 */
export function insertionSlotFromGeometry(
  relX: number,
  relY: number,
  pitchX: number,
  pitchY: number,
  cols: number,
): number {
  const colF = relX / pitchX
  const col = Math.max(0, Math.min(Math.floor(colF), cols - 1))
  const row = Math.max(0, Math.floor(relY / pitchY))
  const after = colF - col > 0.5 // 落在格右半 → 插到该格之后
  return row * cols + col + (after ? 1 : 0)
}

/**
 * 由悬停格算出被拖图块应插入有序序列的下标。
 * 规则：悬停格线性秩 rank = row*COLS+col；返回序列中「原点秩 < 悬停秩」的图块数，
 * 即把被拖图块插到该格、令该格及其后的图块整体后移一位（阅读顺序级联让位）。
 * @param order 不含被拖图块的当前行主序序列
 * @param after 指针落在悬停格的右半：有效悬停秩 +1，即插到该格图标「之后」，
 *   使「追加到满行末尾 / 落到最后一个图标之后」这一落点在本行内即可达（而非必须拖进下一行）。
 */
export function insertionIndex(order: Tile[], col: number, row: number, after = false): number {
  const hoverRank = row * COLS + col + (after ? 1 : 0)
  let index = 0
  for (const tile of order) {
    if (!isPlaced(tile)) continue
    if (tile.row * COLS + tile.col < hoverRank) index++
    else break
  }
  return index
}
