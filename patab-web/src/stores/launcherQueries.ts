/**
 * launcher 只读查询
 *
 * 负责从屏幕、文件夹和 Dock 中查找现有实体；
 * 不修改状态，供业务 action 和拖拽规则复用。
 */
import type { Ref } from 'vue'
import type { Folder, Screen, Shortcut, Tile } from '@/types'

type LauncherQueryState = {
  screens: Ref<Screen[]>
  dock: Ref<Shortcut[]>
}

/** 创建 launcher 查询函数集合，调用方显式传入响应式状态 */
export function createLauncherQueries({ screens, dock }: LauncherQueryState) {
  /** 按 id 查找屏幕 */
  function findScreen(screenId: string): Screen | undefined {
    return screens.value.find((s) => s.id === screenId)
  }

  /** 在所有屏幕中查找文件夹 */
  function findFolder(folderId: string): Folder | undefined {
    for (const screen of screens.value) {
      const folder = screen.tiles.find(
        (t): t is Folder => t.type === 'folder' && t.id === folderId,
      )
      if (folder) return folder
    }
    return undefined
  }

  /** 找到包含某图块（含文件夹内、Dock）的容器数组 */
  function findContainerOf(tileId: string): Tile[] | Shortcut[] | undefined {
    for (const screen of screens.value) {
      if (screen.tiles.some((t) => t.id === tileId)) return screen.tiles
      for (const tile of screen.tiles) {
        if (tile.type === 'folder' && tile.children.some((c) => c.id === tileId)) {
          return tile.children
        }
      }
    }
    if (dock.value.some((s) => s.id === tileId)) return dock.value
    return undefined
  }

  /** 全局查找快捷方式（屏幕 / 文件夹内 / Dock） */
  function findShortcut(shortcutId: string): Shortcut | undefined {
    const container = findContainerOf(shortcutId) as Tile[] | undefined
    const tile = container?.find((t) => t.id === shortcutId)
    return tile?.type === 'shortcut' ? tile : undefined
  }

  /** 找到某图块所在的屏幕（文件夹内的快捷方式返回文件夹所在屏幕） */
  function findScreenOf(tileId: string): Screen | undefined {
    return screens.value.find(
      (screen) =>
        screen.tiles.some((t) => t.id === tileId) ||
        screen.tiles.some(
          (t) => t.type === 'folder' && t.children.some((c) => c.id === tileId),
        ),
    )
  }

  return {
    findScreen,
    findFolder,
    findContainerOf,
    findShortcut,
    findScreenOf,
  }
}

export type LauncherQueries = ReturnType<typeof createLauncherQueries>
