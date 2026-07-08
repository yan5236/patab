/**
 * launcher 拖拽落点规则
 *
 * 负责 handleDrop 和 handleBatchDrop 的所有移动分支；
 * 不创建业务数据，只在已有容器之间移动图块。
 */
import type { Ref } from 'vue'
import type { DragSource, DropTarget, Screen, Settings, Shortcut, Tile } from '@/types'
import { COLS, ROWS, isAreaFree, packOrder, rowMajorOrder, tileSize } from '@/utils/grid'
import { clearPos, placeOnScreen, recompactScreen } from './launcherPlacement'
import type { LauncherQueries } from './launcherQueries'
import type { LauncherTileActions } from './launcherTiles'

type LauncherDropState = {
  screens: Ref<Screen[]>
  dock: Ref<Shortcut[]>
  settings: Ref<Settings>
  queries: LauncherQueries
  tileActions: LauncherTileActions
}

/** 创建拖拽落点处理动作集合 */
export function createLauncherDropActions({
  screens,
  dock,
  settings,
  queries,
  tileActions,
}: LauncherDropState) {
  const { findScreen, findFolder, findScreenOf } = queries
  const { hasTodoWidget } = tileActions

  /** 从来源容器中按 id 取出图块（取出即从原位置移除） */
  function takeFromSource(tileId: string, source: DragSource): Tile | undefined {
    let container: Tile[] | Shortcut[] | undefined
    if (source.kind === 'screen') container = findScreen(source.screenId)?.tiles
    else if (source.kind === 'folder') container = findFolder(source.folderId)?.children
    else container = dock.value
    if (!container) return undefined
    const index = container.findIndex((t) => t.id === tileId)
    if (index < 0) return undefined
    return container.splice(index, 1)[0]
  }

  /** 按当前数据反查图块来源，批量拖拽时每个图块都要用自己的真实来源 */
  function findDragSource(tileId: string): DragSource | undefined {
    for (const screen of screens.value) {
      const screenIndex = screen.tiles.findIndex((t) => t.id === tileId)
      if (screenIndex >= 0) return { kind: 'screen', screenId: screen.id, index: screenIndex }
      for (const tile of screen.tiles) {
        if (tile.type !== 'folder') continue
        const childIndex = tile.children.findIndex((c) => c.id === tileId)
        if (childIndex >= 0) return { kind: 'folder', folderId: tile.id, index: childIndex }
      }
    }
    const dockIndex = dock.value.findIndex((t) => t.id === tileId)
    return dockIndex >= 0 ? { kind: 'dock', index: dockIndex } : undefined
  }

  /** 把图块追加到指定屏幕的可用位置，用作批量拖拽中非锚点图块的落位 */
  function appendToScreen(tileId: string, screenId: string) {
    const source = findDragSource(tileId)
    const screen = findScreen(screenId)
    if (!source || !screen) return
    const sourceScreen = findScreenOf(tileId)
    const container =
      source.kind === 'screen'
        ? findScreen(source.screenId)?.tiles
        : source.kind === 'folder'
          ? findFolder(source.folderId)?.children
          : dock.value
    const tile = container?.find((t) => t.id === tileId)
    if (!tile) return
    if (tile.type === 'widget' && sourceScreen?.id !== screen.id && hasTodoWidget(screen.id)) return
    const moved = takeFromSource(tileId, source)
    if (!moved) return
    screen.tiles.push(moved)
    placeOnScreen(screen, moved)
    if (settings.value.placementMode === 'compact') {
      if (source.kind === 'screen') {
        const origin = findScreen(source.screenId)
        if (origin && origin.id !== screen.id) recompactScreen(origin)
      }
      recompactScreen(screen)
    }
  }

  /**
   * 拖拽释放：把图块从来源移动到目标位置
   * 全部合法性校验集中在这里，非法落点直接忽略（图块留在原位）
   */
  function handleDrop(tileId: string, source: DragSource, target: DropTarget) {
    const sourceContainer =
      source.kind === 'screen'
        ? findScreen(source.screenId)?.tiles
        : source.kind === 'folder'
          ? findFolder(source.folderId)?.children
          : dock.value
    const tile = sourceContainer?.find((t) => t.id === tileId)
    if (!tile) return

    const isShortcut = tile.type === 'shortcut'

    if (target.kind === 'slot') {
      const screen = findScreen(target.screenId)
      if (!screen) return
      const { w, h } = tileSize(tile)
      const col = Math.max(0, Math.min(target.col, COLS - w))
      const row = Math.max(0, Math.min(target.row, ROWS - h))
      if (
        tile.type === 'widget' &&
        screen.id !== findScreenOf(tileId)?.id &&
        hasTodoWidget(screen.id)
      ) {
        return
      }
      if (!isAreaFree(screen, col, row, w, h, tileId)) return
      const moved = takeFromSource(tileId, source)
      if (!moved) return
      moved.col = col
      moved.row = row
      screen.tiles.push(moved)
      return
    }

    if (target.kind === 'grid') {
      const screen = findScreen(target.screenId)
      if (!screen) return
      if (
        tile.type === 'widget' &&
        screen.id !== findScreenOf(tileId)?.id &&
        hasTodoWidget(screen.id)
      ) {
        return
      }
      const moved = takeFromSource(tileId, source)
      if (!moved) return
      if (source.kind === 'screen' && source.screenId !== screen.id) {
        const sourceScreen = findScreen(source.screenId)
        if (sourceScreen) recompactScreen(sourceScreen)
      }
      const order = rowMajorOrder(screen.tiles)
      const index = Math.max(0, Math.min(target.index, order.length))
      order.splice(index, 0, moved)
      const positions = packOrder(order)
      for (const t of order) {
        const pos = positions.get(t.id)
        if (pos) {
          t.col = pos.col
          t.row = pos.row
        }
      }
      screen.tiles = order
      return
    }

    if (target.kind === 'folder-tile') {
      if (!isShortcut || target.folderId === tileId) return
      const folder = findFolder(target.folderId)
      if (!folder) return
      takeFromSource(tileId, source)
      clearPos(tile)
      folder.children.push(tile as Shortcut)
      if (settings.value.placementMode === 'compact' && source.kind === 'screen') {
        const screen = findScreen(source.screenId)
        if (screen) recompactScreen(screen)
      }
      return
    }

    if (target.kind === 'dock') {
      if (!isShortcut) return
      takeFromSource(tileId, source)
      clearPos(tile)
      const index = Math.min(target.index, dock.value.length)
      dock.value.splice(index, 0, tile as Shortcut)
      return
    }

    if (target.kind === 'pager') {
      const screen = findScreen(target.screenId)
      if (!screen) return
      if (tile.type === 'widget' && hasTodoWidget(target.screenId)) return
      if (source.kind === 'screen' && source.screenId === target.screenId) return
      takeFromSource(tileId, source)
      screen.tiles.push(tile)
      placeOnScreen(screen, tile)
      return
    }

    if (target.kind === 'folder-outside') {
      if (source.kind !== 'folder') return
      const screen = findScreenOf(source.folderId)
      if (!screen) return
      takeFromSource(tileId, source)
      screen.tiles.push(tile)
      placeOnScreen(screen, tile)
      return
    }

    if (target.zone === 'folder') {
      if (!isShortcut) return
      const folder = findFolder(target.containerId)
      if (!folder) return
      takeFromSource(tileId, source)
      clearPos(tile)
      const index = Math.min(target.index, folder.children.length)
      folder.children.splice(index, 0, tile as Shortcut)
    }
  }

  /**
   * 批量拖拽释放：锚点图块沿用真实落点，其余图块追加到目标屏幕或文件夹。
   * 文件夹只接收快捷方式；文件夹/小组件会被自然跳过，避免破坏“不嵌套文件夹”规则。
   */
  function handleBatchDrop(
    tileIds: string[],
    anchorId: string,
    source: DragSource,
    target: DropTarget,
  ) {
    const selected = new Set(tileIds)
    selected.add(anchorId)
    const visualOrder = screens.value.flatMap((screen) =>
      rowMajorOrder(screen.tiles).map((tile) => tile.id),
    )
    const orderOf = (id: string) => {
      const index = visualOrder.indexOf(id)
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER
    }
    const ids = [
      anchorId,
      ...[...selected].filter((id) => id !== anchorId).sort((a, b) => orderOf(a) - orderOf(b)),
    ]
    const targetScreenId =
      target.kind === 'slot' || target.kind === 'grid' || target.kind === 'pager'
        ? target.screenId
        : undefined

    for (const [index, tileId] of ids.entries()) {
      const currentSource = findDragSource(tileId)
      if (!currentSource) continue
      if (target.kind === 'folder-tile') {
        handleDrop(tileId, currentSource, target)
        continue
      }
      if (index === 0) handleDrop(tileId, source, target)
      else if (targetScreenId) appendToScreen(tileId, targetScreenId)
    }
  }

  return {
    handleDrop,
    handleBatchDrop,
  }
}
