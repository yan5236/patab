/**
 * launcher 持久状态初始化
 *
 * 只负责默认数据、localStorage 读取和旧数据兼容清洗；
 * 运行中的业务 action 仍由 launcher store 统一暴露。
 */
import type {
  CustomWidgetTile,
  CustomWallpaper,
  LauncherState,
  Shortcut,
  Tile,
  TodoItem,
  TodoList,
} from '@/types'
import { colorForName, normalizeUrl } from '@/utils/favicon'
import { layoutScreen, normalizeTileSize } from '@/utils/grid'
import { sanitizeClockConfig } from '@/utils/clock'
import { createId } from '@/utils/id'
import {
  DEFAULT_SEARCH_ENGINES,
  sanitizeSearchEngineId,
  sanitizeSearchEngines,
} from '@/utils/searchEngines'
import { normalizeThemeMode } from '@/utils/theme'
import { normalizeLocale } from '@/i18n/language'
import { normalizeScreenIcon } from '@/utils/screenIcons'

/** localStorage 存储键（含版本号，便于将来迁移） */
export const STORAGE_KEY = 'patab:v1'

/** 默认壁纸地址，必须与 public 中真实文件一致 */
const DEFAULT_WALLPAPER = '/scenery1.jpg'

/** 旧版本误写的默认壁纸地址，用于无感迁移 */
const LEGACY_DEFAULT_WALLPAPER = '/scenery1.png'

/**
 * 判断不可信持久化值是否为可安全读取字段的普通记录。
 *
 * localStorage 中的任何值都可能来自旧版本或被手工修改，后续清洗只能在
 * 通过此判断后访问属性，避免把原型或 null 当作有效图块引用。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 清洗轻量自定义组件图块引用，并丢弃缺少稳定组件或实例 id 的无效项。
 *
 * 此处不会查询组件仓库，因此格式正确但暂时缺包的引用必须原样保留；
 * 后续 UI 再据安装目录将其显示为可恢复占位。尺寸复用主屏既有四档规则，
 * 无效 variant 或 disabled 值只移除该可选字段，不影响有效实例引用。
 */
function sanitizeCustomWidgetTile(value: unknown): CustomWidgetTile | null {
  if (
    !isRecord(value)
    || value.type !== 'widget'
    || value.widgetType !== 'custom'
    || typeof value.id !== 'string'
    || typeof value.componentId !== 'string'
    || typeof value.instanceId !== 'string'
  ) {
    return null
  }

  const id = value.id.trim()
  const componentId = value.componentId.trim()
  const instanceId = value.instanceId.trim()
  if (!id || !componentId || !instanceId) {
    return null
  }

  const tile: CustomWidgetTile = {
    id,
    type: 'widget',
    widgetType: 'custom',
    componentId,
    instanceId,
  }
  if (typeof value.variantId === 'string' && value.variantId.trim()) {
    tile.variantId = value.variantId.trim()
  }
  if (typeof value.disabled === 'boolean') {
    tile.disabled = value.disabled
  }
  if (
    isRecord(value.size)
    && typeof value.size.w === 'number'
    && typeof value.size.h === 'number'
  ) {
    tile.size = { w: value.size.w, h: value.size.h }
  }
  if (typeof value.col === 'number' && Number.isInteger(value.col) && value.col >= 0) {
    tile.col = value.col
  }
  if (typeof value.row === 'number' && Number.isInteger(value.row) && value.row >= 0) {
    tile.row = value.row
  }

  normalizeTileSize(tile)
  return tile
}

/**
 * 将屏幕内的 custom 图块替换为经过形状校验的轻量引用。
 *
 * 内置图块保持既有迁移路径不变；只有标记为 custom 的记录会进入本清洗，
 * 因而旧版 todo/clock 数据及其 config 不会被此功能重写。
 */
function sanitizeScreenCustomWidgetTiles(tiles: Tile[]): Tile[] {
  return tiles.flatMap((tile) => {
    if (isRecord(tile) && tile.type === 'widget' && tile.widgetType === 'custom') {
      const sanitized = sanitizeCustomWidgetTile(tile)
      return sanitized ? [sanitized] : []
    }
    return [tile]
  })
}

/** 创建一个快捷方式实体 */
export function buildShortcut(data: { name: string; url: string; iconUrl?: string }): Shortcut {
  return {
    id: createId(),
    type: 'shortcut',
    name: data.name.trim(),
    url: normalizeUrl(data.url),
    iconUrl: data.iconUrl?.trim() || undefined,
    color: colorForName(data.name.trim()),
  }
}

/** 创建默认待办列表（今天/所有/重要） */
function buildDefaultTodoLists(): TodoList[] {
  return [
    { id: 'all', name: '所有', order: 0, system: 'all' },
    { id: 'today', name: '今天', order: 1, system: 'today' },
    { id: 'important', name: '重要', order: 2, system: 'important' },
  ]
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
        icon: 'Bot',
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
        icon: 'BookOpen',
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
      { id: createId(), text: '右键空白处试试创建快捷方式', done: false, important: false, order: 0 },
      { id: createId(), text: '长按图标拖动一下', done: false, important: false, order: 1000 },
    ],
    todoLists: buildDefaultTodoLists(),
    settings: {
      language: 'zh-CN',
      themeMode: 'system',
      wallpaper: DEFAULT_WALLPAPER,
      customWallpapers: [],
      hour12: false,
      showDate: true,
      cleanMode: false,
      searchEngine: 'baidu',
      searchEngines: DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine })),
      placementMode: 'compact',
    },
  }
}

/** 清洗自定义壁纸列表，兼容旧数据并避免空名称、空地址进入运行态 */
function sanitizeCustomWallpapers(value: unknown): CustomWallpaper[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is CustomWallpaper =>
        typeof item?.id === 'string' &&
        typeof item?.name === 'string' &&
        typeof item?.src === 'string' &&
        !!item.name.trim() &&
        !!item.src.trim(),
    )
    .map((item) => ({
      id: item.id,
      name: item.name.trim(),
      src: item.src.trim(),
    }))
}

/** 清洗待办列表，缺失时创建默认智能列表 */
function sanitizeTodoLists(value: unknown): TodoList[] {
  if (!Array.isArray(value) || value.length === 0) return buildDefaultTodoLists()
  const lists = value.filter(
    (item): item is TodoList =>
      typeof item?.id === 'string' &&
      typeof item?.name === 'string' &&
      typeof item?.order === 'number' &&
      item.name.trim().length > 0,
  )
  // 保证默认系统列表存在
  const existingSystem = new Set(lists.filter((l) => l.system).map((l) => l.id))
  const defaults = buildDefaultTodoLists().filter((l) => !existingSystem.has(l.id))
  return [...lists, ...defaults].sort((a, b) => a.order - b.order)
}

/** 清洗待办条目，补齐新字段 */
function sanitizeTodos(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is TodoItem =>
        typeof item?.id === 'string' &&
        typeof item?.text === 'string' &&
        typeof item?.done === 'boolean',
    )
    .map((item, index) => ({
      ...item,
      text: item.text.trim(),
      important: item.important ?? false,
      order: item.order ?? index * 1000,
      date: item.date,
      listId: item.listId,
    }))
}

/** 从 localStorage 读取持久化数据，无数据或损坏时返回 null */
export function loadPersisted(): LauncherState | null {
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

/** 构造 launcher store 初始状态，并完成旧持久化数据迁移 */
export function createInitialLauncherState(): LauncherState {
  const initial = loadPersisted() ?? buildSeedState()
  if (!initial.settings.wallpaper || initial.settings.wallpaper === LEGACY_DEFAULT_WALLPAPER) {
    initial.settings.wallpaper = DEFAULT_WALLPAPER
  }
  initial.settings.customWallpapers = sanitizeCustomWallpapers(initial.settings.customWallpapers)
  initial.settings.language = normalizeLocale(initial.settings.language)
  initial.settings.themeMode = normalizeThemeMode(initial.settings.themeMode)
  initial.settings.showDate ??= true
  initial.settings.cleanMode ??= false
  initial.settings.searchEngines = sanitizeSearchEngines(initial.settings.searchEngines)
  initial.settings.searchEngine = sanitizeSearchEngineId(
    initial.settings.searchEngine,
    initial.settings.searchEngines,
  )
  initial.settings.placementMode ??= 'compact'
  initial.todos = sanitizeTodos(initial.todos)
  initial.todoLists = sanitizeTodoLists(initial.todoLists)
  initial.screens.forEach((screen) => {
    screen.icon = normalizeScreenIcon(screen.icon)
    screen.tiles = sanitizeScreenCustomWidgetTiles(screen.tiles)
    screen.tiles.forEach((tile) => {
      normalizeTileSize(tile)
      if (tile.type === 'widget' && tile.widgetType === 'clock') {
        tile.config = sanitizeClockConfig(tile.config)
      }
    })
    layoutScreen(screen)
  })
  return initial
}
