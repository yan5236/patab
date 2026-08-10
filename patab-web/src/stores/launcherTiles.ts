/**
 * launcher 图块、屏幕和 Dock 业务动作
 *
 * 负责快捷方式、文件夹、小组件、屏幕和 Dock 的增删改；
 * 不处理拖拽落点分支，拖拽统一放在 launcherDrop。
 */
import type { Ref } from 'vue'
import type {
  ClockType,
  CustomWidgetTile,
  Folder,
  Screen,
  Settings,
  Shortcut,
  ShortcutTarget,
  Tile,
  TileSize,
} from '@/types'
import { colorForName, normalizeUrl } from '@/utils/favicon'
import { isAllowedSize, layoutScreen } from '@/utils/grid'
import { defaultClockConfig } from '@/utils/clock'
import { createId } from '@/utils/id'
import { buildShortcut } from './launcherState'
import { clearPos, placeOnScreen, recompactScreen } from './launcherPlacement'
import type { LauncherQueries } from './launcherQueries'
import { normalizeScreenIcon } from '@/utils/screenIcons'

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

  /** 在指定屏幕添加时钟小组件；允许同一屏幕存在多个，类型由参数指定 */
  function addClockWidget(screenId: string, clockType: ClockType) {
    const screen = findScreen(screenId)
    if (!screen) return
    const widget: Tile = {
      id: createId(),
      type: 'widget',
      widgetType: 'clock',
      config: defaultClockConfig(clockType),
    }
    screen.tiles.push(widget)
    placeOnScreen(screen, widget)
  }

  /** 切换时钟小组件类型并重置运行状态（秒表 / 计时器数据一并清空） */
  function switchClockType(tileId: string, clockType: ClockType) {
    const container = findContainerOf(tileId)
    const tile = container?.find((t) => t.id === tileId)
    if (tile?.type !== 'widget' || tile.widgetType !== 'clock') return
    tile.config = defaultClockConfig(clockType)
  }

  /**
   * 按 id 查找自定义组件图块引用，且绝不把内置 todo/clock 图块误当作第三方实例修改。
   *
   * 该函数只操作 launcher 的轻量引用，不读取组件仓库；因此调用方可据返回值决定
   * 是否显示缺包占位或重新导入入口，而不会在主状态中混入 Manifest 与私有数据。
   */
  function findCustomWidget(tileId: string): CustomWidgetTile | undefined {
    const container = findContainerOf(tileId)
    const tile = container?.find((item) => item.id === tileId)
    return tile?.type === 'widget' && tile.widgetType === 'custom' ? tile : undefined
  }

  /**
   * 在指定主屏创建一个新的自定义组件实例引用，并交给既有网格规则安排位置。
   *
   * 常规调用会为同一 componentId 生成独立 instanceId；开发宿主也可传入已经过会话
   * 描述校验的固定 instanceId，以便刷新后继续命中同一个隔离实例。此层不检查包是否
   * 存在、Manifest variants 或权限，只拒绝空 id 与当前主屏不支持的尺寸。
   */
  function addCustomWidget(
    screenId: string,
    input: { componentId: string; instanceId?: string; variantId?: string; size?: TileSize },
  ): CustomWidgetTile | undefined {
    const screen = findScreen(screenId)
    const componentId = input.componentId.trim()
    const instanceId = input.instanceId?.trim()
    if (!screen || !componentId || (input.instanceId !== undefined && !instanceId)) return undefined

    const widget: CustomWidgetTile = {
      id: createId(),
      type: 'widget',
      widgetType: 'custom',
      componentId,
      instanceId: instanceId ?? createId(),
    }
    const variantId = input.variantId?.trim()
    if (variantId) {
      widget.variantId = variantId
    }
    if (input.size && isAllowedSize(widget, input.size)) {
      widget.size = { ...input.size }
    }

    screen.tiles.push(widget)
    placeOnScreen(screen, widget)
    return widget
  }

  /**
   * 更新已存在自定义组件实例的 variant 引用；传入空值时清除可选 variant。
   *
   * Manifest 是否存在该 variant 由后续组件目录与 UI 层确认，此处仅保持主状态引用
   * 的结构正确并返回操作是否命中了 custom 图块，避免误改内置小组件。
   */
  function updateCustomWidgetVariant(tileId: string, variantId?: string): boolean {
    const widget = findCustomWidget(tileId)
    if (!widget) return false

    const normalizedVariantId = variantId?.trim()
    if (normalizedVariantId) {
      widget.variantId = normalizedVariantId
    } else {
      delete widget.variantId
    }
    return true
  }

  /**
   * 更新自定义组件的主屏尺寸，复用现有小组件四档尺寸和布局约束。
   *
   * 传入 undefined 时回到宿主默认尺寸；非法尺寸不会修改现有引用，以免 UI 传入
   * 未经 Manifest 允许或越出网格的值后导致布局状态损坏。
   */
  function updateCustomWidgetSize(tileId: string, size?: TileSize): boolean {
    const widget = findCustomWidget(tileId)
    if (!widget) return false
    if (!size) {
      delete widget.size
      return true
    }
    if (!isAllowedSize(widget, size)) return false

    widget.size = { ...size }
    const screen = findScreenOf(tileId)
    if (screen) {
      layoutScreen(screen)
    }
    return true
  }

  /**
   * 持久化自定义组件实例的停用状态，供运行时健康策略和用户手动恢复共用。
   *
   * 状态仅落在轻量引用；实际失败原因、计数和安全模式信息仍由后续仓库与安全服务管理。
   */
  function setCustomWidgetDisabled(tileId: string, disabled: boolean): boolean {
    const widget = findCustomWidget(tileId)
    if (!widget) return false

    widget.disabled = disabled
    return true
  }

  /**
   * 批量更新全部第三方实例的停用标记。
   *
   * 全局安全模式恢复时调用此动作，将每个引用显式隔离；退出安全模式后不会自动反转，用户必须在
   * 管理界面逐个重新启用可信实例，避免一次恢复重新执行所有曾阻断启动的包。
   */
  function setAllCustomWidgetsDisabled(disabled: boolean): number {
    let changed = 0
    for (const screen of screens.value) {
      for (const tile of screen.tiles) {
        if (tile.type !== 'widget' || tile.widgetType !== 'custom' || tile.disabled === disabled) continue
        tile.disabled = disabled
        changed += 1
      }
    }
    return changed
  }

  /**
   * 移除指定自定义组件的 launcher 引用，不删除组件包、权限或实例私有数据。
   *
   * 完整卸载事务将在后续组件管理任务统一清理仓库内容；这里仅保留用户从主屏移除
   * 单个实例引用的既有语义，并拒绝对内置图块执行该专用动作。
   */
  function removeCustomWidget(tileId: string): boolean {
    if (!findCustomWidget(tileId)) return false
    removeTile(tileId)
    return true
  }

  /**
   * 删除某组件的全部轻量实例引用。
   *
   * 该动作只在 IndexedDB 完整卸载事务成功后由组件管理调用；它不触碰包、授权或私有数据，
   * 并对每个受影响屏幕重排以避免卸载多个实例后保留无效的紧凑网格空位。
   */
  function removeCustomWidgetsByComponent(componentId: string): number {
    if (!componentId) return 0
    let removed = 0
    for (const screen of screens.value) {
      const removedFromScreen = screen.tiles.filter((tile) => (
        tile.type === 'widget' && tile.widgetType === 'custom' && tile.componentId === componentId
      )).length
      if (removedFromScreen === 0) continue
      screen.tiles = screen.tiles.filter((tile) => !(
        tile.type === 'widget' && tile.widgetType === 'custom' && tile.componentId === componentId
      ))
      removed += removedFromScreen
      recompactScreen(screen)
    }
    return removed
  }

  /** 创建新的应用屏幕 */
  function addScreen(name: string, icon: string): Screen {
    const screen: Screen = {
      id: createId(),
      name: name.trim(),
      icon: normalizeScreenIcon(icon),
      tiles: [],
    }
    screens.value.push(screen)
    return screen
  }

  /** 更新应用屏幕名称和图标 */
  function updateScreen(screenId: string, data: { name: string; icon: string }) {
    const screen = findScreen(screenId)
    if (!screen) return
    screen.name = data.name.trim()
    screen.icon = normalizeScreenIcon(data.icon)
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
          t.type !== 'widget' || t.widgetType !== 'todo' ||
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
    addClockWidget,
    switchClockType,
    addCustomWidget,
    updateCustomWidgetVariant,
    updateCustomWidgetSize,
    setCustomWidgetDisabled,
    setAllCustomWidgetsDisabled,
    removeCustomWidget,
    removeCustomWidgetsByComponent,
    addScreen,
    updateScreen,
    removeScreen,
    moveToDock,
  }
}

export type LauncherTileActions = ReturnType<typeof createLauncherTileActions>
