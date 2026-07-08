/**
 * launcher 图块、屏幕和 Dock 业务动作
 *
 * 负责快捷方式、文件夹、小组件、屏幕和 Dock 的增删改；
 * 不处理拖拽落点分支，拖拽统一放在 launcherDrop。
 */
import type { Ref } from 'vue'
import type { Folder, Screen, Settings, Shortcut, ShortcutTarget, Tile } from '@/types'
import { colorForName, normalizeUrl } from '@/utils/favicon'
import { createId } from '@/utils/id'
import { buildShortcut } from './launcherState'
import { clearPos, placeOnScreen, recompactScreen } from './launcherPlacement'
import type { LauncherQueries } from './launcherQueries'

type LauncherTileState = {
  screens: Ref<Screen[]>
  dock: Ref<Shortcut[]>
  settings: Ref<Settings>
  queries: LauncherQueries
}

/** 创建图块、屏幕和 Dock 的业务动作集合 */
export function createLauncherTileActions({
  screens,
  dock,
  settings,
  queries,
}: LauncherTileState) {
  const { findScreen, findFolder, findContainerOf, findShortcut, findScreenOf } = queries

  /** 创建快捷方式到指定容器（屏幕 / 文件夹 / Dock） */
  function addShortcut(
    target: ShortcutTarget,
    data: { name: string; url: string; iconUrl?: string },
  ): Shortcut {
    const shortcut = buildShortcut(data)
    if (target.kind === 'screen') {
      const screen = findScreen(target.screenId)
      if (screen) {
        screen.tiles.push(shortcut)
        placeOnScreen(screen, shortcut)
      }
    } else if (target.kind === 'folder') {
      findFolder(target.folderId)?.children.push(shortcut)
    } else {
      dock.value.push(shortcut)
    }
    return shortcut
  }

  /** 编辑快捷方式（名称 / 网址 / 自定义图标） */
  function updateShortcut(
    shortcutId: string,
    data: { name: string; url: string; iconUrl?: string },
  ) {
    const shortcut = findShortcut(shortcutId)
    if (!shortcut) return
    shortcut.name = data.name.trim()
    shortcut.url = normalizeUrl(data.url)
    shortcut.iconUrl = data.iconUrl?.trim() || undefined
    shortcut.color = colorForName(shortcut.name)
  }

  /** 删除任意图块（快捷方式 / 文件夹连同子项 / 小组件），Dock 中的也可删 */
  function removeTile(tileId: string) {
    const container = findContainerOf(tileId)
    if (!container) return
    const index = container.findIndex((t) => t.id === tileId)
    if (index >= 0) container.splice(index, 1)
  }

  /** 批量删除任意图块，返回实际删除成功的 id，供管理模式清理选中态 */
  function removeTiles(tileIds: string[]): string[] {
    const removed: string[] = []
    for (const tileId of tileIds) {
      const container = findContainerOf(tileId)
      if (!container) continue
      const index = container.findIndex((t) => t.id === tileId)
      if (index < 0) continue
      container.splice(index, 1)
      removed.push(tileId)
    }
    return removed
  }

  /** 在指定屏幕创建文件夹并落到可用主屏坐标 */
  function addFolder(screenId: string, name: string): Folder {
    const folder: Folder = { id: createId(), type: 'folder', name: name.trim(), children: [] }
    const screen = findScreen(screenId)
    if (screen) {
      screen.tiles.push(folder)
      placeOnScreen(screen, folder)
    }
    return folder
  }

  /** 重命名文件夹，找不到时静默忽略 */
  function renameFolder(folderId: string, name: string) {
    const folder = findFolder(folderId)
    if (folder) folder.name = name.trim()
  }

  /** 解散文件夹：子项回到文件夹所在屏幕，首个子项占用文件夹腾出的坐标，其余寻空位 */
  function disbandFolder(folderId: string) {
    const screen = findScreenOf(folderId)
    if (!screen) return
    const index = screen.tiles.findIndex((t) => t.id === folderId)
    const folder = screen.tiles[index]
    if (index < 0 || folder?.type !== 'folder') return
    const anchor = { col: folder.col ?? 0, row: folder.row ?? 0 }
    const children = folder.children
    screen.tiles.splice(index, 1, ...children)
    children.forEach((child) => clearPos(child))
    children.forEach((child, i) => placeOnScreen(screen, child, i === 0 ? anchor : undefined))
    recompactScreen(screen)
  }

  /** 屏幕上是否已有待办小组件（每屏最多一个） */
  function hasTodoWidget(screenId: string): boolean {
    const screen = findScreen(screenId)
    return !!screen?.tiles.some((t) => t.type === 'widget' && t.widgetType === 'todo')
  }

  /** 在指定屏幕添加待办事项组件；同一屏幕已有时直接忽略，避免重复卡片 */
  function addTodoWidget(screenId: string) {
    if (hasTodoWidget(screenId)) return
    const screen = findScreen(screenId)
    if (!screen) return
    const widget: Tile = { id: createId(), type: 'widget', widgetType: 'todo' }
    screen.tiles.push(widget)
    placeOnScreen(screen, widget)
  }

  /** 创建新的应用屏幕 */
  function addScreen(name: string, icon: string): Screen {
    const screen: Screen = { id: createId(), name: name.trim(), icon, tiles: [] }
    screens.value.push(screen)
    return screen
  }

  /** 更新应用屏幕名称和图标 */
  function updateScreen(screenId: string, data: { name: string; icon: string }) {
    const screen = findScreen(screenId)
    if (!screen) return
    screen.name = data.name.trim()
    screen.icon = data.icon
  }

  /** 删除屏幕：内容并入第一个剩余屏幕，避免误删数据；至少保留一个屏幕 */
  function removeScreen(screenId: string) {
    if (screens.value.length <= 1) return
    const index = screens.value.findIndex((s) => s.id === screenId)
    if (index < 0) return
    const [removed] = screens.value.splice(index, 1)
    const fallback = screens.value[0]
    if (removed && fallback) {
      const merged = removed.tiles.filter(
        (t) =>
          t.type !== 'widget' ||
          !fallback.tiles.some((f) => f.type === 'widget' && f.widgetType === t.widgetType),
      )
      merged.forEach((t) => clearPos(t))
      merged.forEach((t) => {
        fallback.tiles.push(t)
        placeOnScreen(fallback, t)
      })
    }
  }

  /** 把已有快捷方式移入 Dock 末尾（右键菜单“添加到 Dock”） */
  function moveToDock(shortcutId: string) {
    const shortcut = findShortcut(shortcutId)
    if (!shortcut) return
    removeTile(shortcutId)
    clearPos(shortcut)
    dock.value.push(shortcut)
  }

  return {
    addShortcut,
    updateShortcut,
    removeTile,
    removeTiles,
    addFolder,
    renameFolder,
    disbandFolder,
    hasTodoWidget,
    addTodoWidget,
    addScreen,
    updateScreen,
    removeScreen,
    moveToDock,
  }
}

export type LauncherTileActions = ReturnType<typeof createLauncherTileActions>
