/**
 * launcher store —— PaTab 的数据中枢
 *
 * 职责：
 * 1. 持有全部业务数据：应用屏幕 / Dock / 待办 / 设置
 * 2. 提供全部增删改动作，以及拖拽落点的统一移动逻辑 handleDrop
 * 3. localStorage 持久化（防抖写入），首次启动写入种子数据
 *
 * 组件不直接修改数据，一律通过这里的 action，保证移动规则集中可测。
 */
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  DragSource,
  DropTarget,
  Folder,
  LauncherState,
  Screen,
  Settings,
  Shortcut,
  ShortcutTarget,
  Tile,
  TodoItem,
} from '@/types'
import { createId } from '@/utils/id'
import { colorForName, normalizeUrl } from '@/utils/favicon'
import {
  COLS,
  ROWS,
  firstFreeSlot,
  isAreaFree,
  layoutScreen,
  packOrder,
  rowMajorOrder,
  tileSize,
} from '@/utils/grid'

/** localStorage 存储键（含版本号，便于将来迁移） */
export const STORAGE_KEY = 'patab:v1'

/** 创建一个快捷方式实体 */
function buildShortcut(data: { name: string; url: string; iconUrl?: string }): Shortcut {
  return {
    id: createId(),
    type: 'shortcut',
    name: data.name.trim(),
    url: normalizeUrl(data.url),
    iconUrl: data.iconUrl?.trim() || undefined,
    color: colorForName(data.name.trim()),
  }
}

/** 首次使用的种子数据（贴近设计稿示例） */
function buildSeedState(): LauncherState {
  const s = buildShortcut
  return {
    version: 1,
    screens: [
      {
        id: createId(),
        name: 'AI',
        icon: '🤖',
        tiles: [
          s({ name: 'ChatGPT', url: 'chatgpt.com' }),
          s({ name: 'Claude', url: 'claude.ai' }),
          s({ name: 'DeepSeek', url: 'chat.deepseek.com' }),
          s({ name: '豆包', url: 'doubao.com' }),
          {
            id: createId(),
            type: 'folder',
            name: '视频平台',
            children: [
              s({ name: 'B站', url: 'bilibili.com' }),
              s({ name: 'YouTube', url: 'youtube.com' }),
              s({ name: '抖音', url: 'douyin.com' }),
            ],
          },
          { id: createId(), type: 'widget', widgetType: 'todo' },
        ],
      },
      {
        id: createId(),
        name: '学习',
        icon: '📚',
        tiles: [
          s({ name: 'GitHub', url: 'github.com' }),
          s({ name: 'MDN', url: 'developer.mozilla.org' }),
          s({ name: 'Stack Overflow', url: 'stackoverflow.com' }),
          s({ name: '菜鸟教程', url: 'runoob.com' }),
        ],
      },
    ],
    dock: [
      s({ name: '哔哩哔哩', url: 'bilibili.com' }),
      s({ name: 'GitHub', url: 'github.com' }),
      s({ name: '知乎', url: 'zhihu.com' }),
      s({ name: '微博', url: 'weibo.com' }),
    ],
    todos: [
      { id: createId(), text: '右键空白处试试创建快捷方式', done: false },
      { id: createId(), text: '长按图标拖动一下', done: false },
    ],
    settings: {
      wallpaper: '/scenery1.png',
      hour12: false,
      searchEngine: 'baidu',
      placementMode: 'compact',
    },
  }
}

/** 从 localStorage 读取持久化数据，无数据或损坏时返回 null */
function loadPersisted(): LauncherState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LauncherState
    if (parsed.version !== 1 || !Array.isArray(parsed.screens)) return null
    return parsed
  } catch {
    return null
  }
}

export const useLauncherStore = defineStore('launcher', () => {
  const initial = loadPersisted() ?? buildSeedState()
  // 兼容旧持久化数据：缺少排列模式时默认紧凑
  initial.settings.placementMode ??= 'compact'
  // 为主屏幕图块补齐网格坐标：兼容旧紧凑数据（无坐标）与种子数据，幂等不丢块
  initial.screens.forEach(layoutScreen)

  const screens = ref<Screen[]>(initial.screens)
  const dock = ref<Shortcut[]>(initial.dock)
  const todos = ref<TodoItem[]>(initial.todos)
  const settings = ref<Settings>(initial.settings)

  /* ---------- 持久化（防抖写入） ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    [screens, dock, todos, settings],
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const state: LauncherState = {
          version: 1,
          screens: screens.value,
          dock: dock.value,
          todos: todos.value,
          settings: settings.value,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      }, 300)
    },
    { deep: true },
  )

  /* ---------- 查找辅助 ---------- */

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

  /* ---------- 快捷方式增删改 ---------- */

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

  /* ---------- 文件夹 ---------- */

  function addFolder(screenId: string, name: string): Folder {
    const folder: Folder = { id: createId(), type: 'folder', name: name.trim(), children: [] }
    const screen = findScreen(screenId)
    if (screen) {
      screen.tiles.push(folder)
      placeOnScreen(screen, folder)
    }
    return folder
  }

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
    // 先清脏坐标再逐个落位，避免未定位子项互相干扰寻空位
    children.forEach((child) => clearPos(child))
    children.forEach((child, i) => placeOnScreen(screen, child, i === 0 ? anchor : undefined))
  }

  /* ---------- 小组件 ---------- */

  /** 屏幕上是否已有待办小组件（每屏最多一个） */
  function hasTodoWidget(screenId: string): boolean {
    const screen = findScreen(screenId)
    return !!screen?.tiles.some((t) => t.type === 'widget' && t.widgetType === 'todo')
  }

  function addTodoWidget(screenId: string) {
    if (hasTodoWidget(screenId)) return
    const screen = findScreen(screenId)
    if (!screen) return
    const widget: Tile = { id: createId(), type: 'widget', widgetType: 'todo' }
    screen.tiles.push(widget)
    placeOnScreen(screen, widget)
  }

  /* ---------- 应用屏幕 ---------- */

  function addScreen(name: string, icon: string): Screen {
    const screen: Screen = { id: createId(), name: name.trim(), icon, tiles: [] }
    screens.value.push(screen)
    return screen
  }

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
      // 目标屏幕已有待办小组件时丢弃并入的重复小组件
      const merged = removed.tiles.filter(
        (t) =>
          t.type !== 'widget' ||
          !fallback.tiles.some((f) => f.type === 'widget' && f.widgetType === t.widgetType),
      )
      // 旧坐标属于被删屏幕，逐个在目标屏重新落位（先清脏坐标）
      merged.forEach((t) => clearPos(t))
      merged.forEach((t) => {
        fallback.tiles.push(t)
        placeOnScreen(fallback, t)
      })
    }
  }

  /* ---------- Dock ---------- */

  /** 把已有快捷方式移入 Dock 末尾（右键菜单"添加到 Dock"） */
  function moveToDock(shortcutId: string) {
    const shortcut = findShortcut(shortcutId)
    if (!shortcut) return
    removeTile(shortcutId)
    clearPos(shortcut)
    dock.value.push(shortcut)
  }

  /* ---------- 待办 ---------- */

  function addTodo(text: string) {
    const trimmed = text.trim()
    if (trimmed) todos.value.push({ id: createId(), text: trimmed, done: false })
  }

  function toggleTodo(todoId: string) {
    const todo = todos.value.find((t) => t.id === todoId)
    if (todo) todo.done = !todo.done
  }

  function removeTodo(todoId: string) {
    const index = todos.value.findIndex((t) => t.id === todoId)
    if (index >= 0) todos.value.splice(index, 1)
  }

  /* ---------- 主屏幕坐标辅助 ---------- */

  /** 把图块放到某屏幕并赋予网格坐标；pos 缺省时寻首个空位（allowOverflow 兜底，绝不失败） */
  function placeOnScreen(screen: Screen, tile: Tile, pos?: { col: number; row: number }) {
    const { w, h } = tileSize(tile)
    const slot = pos ?? firstFreeSlot(screen, w, h, tile.id, { allowOverflow: true })
    tile.col = slot?.col ?? 0
    tile.row = slot?.row ?? 0
  }

  /** 清除图块的主屏坐标（移入文件夹 / Dock 时调用，避免脏坐标复现） */
  function clearPos(tile: Tile) {
    tile.col = undefined
    tile.row = undefined
  }

  /** 紧凑模式：按当前视觉顺序重新紧凑打包某屏，回填移出/删除留下的空位 */
  function recompactScreen(screen: Screen) {
    const positions = packOrder(rowMajorOrder(screen.tiles))
    for (const t of screen.tiles) {
      const pos = positions.get(t.id)
      if (pos) {
        t.col = pos.col
        t.row = pos.row
      }
    }
  }

  /* ---------- 拖拽落点统一处理 ---------- */

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

  /**
   * 拖拽释放：把图块从来源移动到目标位置
   * 全部合法性校验集中在这里，非法落点直接忽略（图块留在原位）
   */
  function handleDrop(tileId: string, source: DragSource, target: DropTarget) {
    // 校验目标合法性（在移除前判断，非法时不动原数据）
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
      // 主屏幕自由摆放：按固定坐标落位，空位保留，占用则拒绝（图块留在原空位）
      const screen = findScreen(target.screenId)
      if (!screen) return
      const { w, h } = tileSize(tile)
      // 夹紧坐标，使贴近右/下边缘的小组件仍能完整放下
      const col = Math.max(0, Math.min(target.col, COLS - w))
      const row = Math.max(0, Math.min(target.row, ROWS - h))
      // 小组件跨屏时保持"每屏一个待办"约束
      if (
        tile.type === 'widget' &&
        screen.id !== findScreenOf(tileId)?.id &&
        hasTodoWidget(screen.id)
      ) {
        return
      }
      // 目标区域被占用则拒绝（忽略自己的旧格）
      if (!isAreaFree(screen, col, row, w, h, tileId)) return
      const moved = takeFromSource(tileId, source)
      if (!moved) return
      moved.col = col
      moved.row = row
      screen.tiles.push(moved)
      return
    }

    if (target.kind === 'grid') {
      // 紧凑模式：把图块插入目标屏有序序列的 index 处，整体重新紧凑打包（手机式让位落位）
      const screen = findScreen(target.screenId)
      if (!screen) return
      // 小组件跨屏保持「每屏一个待办」约束（取出前校验，非法则不动原数据）
      if (
        tile.type === 'widget' &&
        screen.id !== findScreenOf(tileId)?.id &&
        hasTodoWidget(screen.id)
      ) {
        return
      }
      const moved = takeFromSource(tileId, source)
      if (!moved) return
      // 剩余图块按行主序，在 index 处插入被拖图块后统一重排
      const order = rowMajorOrder(screen.tiles)
      const index = Math.max(0, Math.min(target.index, order.length))
      order.splice(index, 0, moved)
      const positions = packOrder(order)
      // 回写全部图块坐标（含被拖图块），空位自然被后续图块补齐
      for (const t of screen.tiles) {
        const pos = positions.get(t.id)
        if (pos) {
          t.col = pos.col
          t.row = pos.row
        }
      }
      const movedPos = positions.get(moved.id)
      moved.col = movedPos?.col ?? 0
      moved.row = movedPos?.row ?? 0
      screen.tiles.push(moved)
      return
    }

    if (target.kind === 'folder-tile') {
      // 只有快捷方式能放进文件夹，且不能放进自己
      if (!isShortcut || target.folderId === tileId) return
      const folder = findFolder(target.folderId)
      if (!folder) return
      takeFromSource(tileId, source)
      clearPos(tile)
      folder.children.push(tile as Shortcut)
      // 紧凑模式下从主屏移出后回填空位，保持无空隙
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
      // 小组件跨屏移动时保持"每屏一个"约束
      if (tile.type === 'widget' && hasTodoWidget(target.screenId)) return
      // 已经在该屏幕顶层则视为无操作
      if (source.kind === 'screen' && source.screenId === target.screenId) return
      takeFromSource(tileId, source)
      screen.tiles.push(tile)
      placeOnScreen(screen, tile)
      return
    }

    if (target.kind === 'folder-outside') {
      // 从文件夹拖出（用户在自动关闭前松手于遮罩的兜底）：回到文件夹所在屏幕空位
      if (source.kind !== 'folder') return
      const screen = findScreenOf(source.folderId)
      if (!screen) return
      takeFromSource(tileId, source)
      screen.tiles.push(tile)
      placeOnScreen(screen, tile)
      return
    }

    // 网格单元：改造后仅文件夹紧凑网格走此路径（主屏改用 slot）
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

  /* ---------- 设置 ---------- */

  function updateSettings(patch: Partial<Settings>) {
    Object.assign(settings.value, patch)
  }

  return {
    screens,
    dock,
    todos,
    settings,
    findScreen,
    findFolder,
    findShortcut,
    findScreenOf,
    addShortcut,
    updateShortcut,
    removeTile,
    addFolder,
    renameFolder,
    disbandFolder,
    hasTodoWidget,
    addTodoWidget,
    addScreen,
    updateScreen,
    removeScreen,
    moveToDock,
    addTodo,
    toggleTodo,
    removeTodo,
    handleDrop,
    updateSettings,
  }
})
