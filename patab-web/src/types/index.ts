/**
 * PaTab 全局共享类型定义
 * 所有跨组件/跨 store 的数据结构都集中在这里，保证单一来源
 */

/**
 * 主屏幕网格坐标（列 col / 行 row，均从 0 起）
 * 仅当图块直接位于 Screen.tiles 顶层时有效；移入文件夹 / Dock 时必须清除，
 * 避免脏坐标在图块再次回到主屏时复现。
 */
export interface GridPos {
  col?: number
  row?: number
}

/** 快捷访问（一个可点击打开的网址图标） */
export interface Shortcut extends GridPos {
  id: string
  type: 'shortcut'
  /** 显示名称 */
  name: string
  /** 目标网址（已规范化，含协议） */
  url: string
  /** 用户自定义图标 URL（为空则走 favicon 自动抓取链） */
  iconUrl?: string
  /** 首字母兜底图标的背景色（创建时按名称哈希分配） */
  color: string
}

/** 文件夹（收纳快捷访问，不支持嵌套） */
export interface Folder extends GridPos {
  id: string
  type: 'folder'
  name: string
  children: Shortcut[]
}

/** 小组件图块（在网格中占多格的功能卡片） */
export interface WidgetTile extends GridPos {
  id: string
  type: 'widget'
  /** 小组件种类，目前仅支持待办事项 */
  widgetType: 'todo'
}

/** 应用屏幕网格中的一个图块 */
export type Tile = Shortcut | Folder | WidgetTile

/** 应用屏幕（一页图标网格，可按分类创建多个） */
export interface Screen {
  id: string
  name: string
  /** emoji 图标，显示在分页指示器上 */
  icon: string
  tiles: Tile[]
}

/** 待办事项条目（待办小组件的数据） */
export interface TodoItem {
  id: string
  text: string
  done: boolean
}

/** 支持的搜索引擎 */
export type SearchEngineId = 'baidu' | 'bing' | 'google'

/**
 * 主屏图标排列模式
 * - compact：紧凑模式，图标按阅读顺序紧密排列，拖拽时手机桌面式「让位」推挤
 * - free：自由摆放，图标可停在任意格、中间保留永久空位，拖拽只落到空格
 */
export type PlacementMode = 'compact' | 'free'

/** 用户添加的壁纸条目 */
export interface CustomWallpaper {
  /** 唯一标识，用于列表渲染与后续去重 */
  id: string
  /** 用户命名的壁纸名称 */
  name: string
  /** 图片地址或本地图片 Data URL */
  src: string
}

/** 用户偏好设置 */
export interface Settings {
  /** 壁纸地址（默认使用内置壁纸） */
  wallpaper: string
  /** 用户自定义添加的壁纸列表 */
  customWallpapers: CustomWallpaper[]
  /** 是否 12 小时制 */
  hour12: boolean
  /** 当前搜索引擎 */
  searchEngine: SearchEngineId
  /** 主屏图标排列模式（默认 compact） */
  placementMode: PlacementMode
}

/** 持久化到 localStorage 的根数据结构 */
export interface LauncherState {
  version: 1
  screens: Screen[]
  dock: Shortcut[]
  todos: TodoItem[]
  settings: Settings
}

/* ========== 拖拽相关 ========== */

/** 被拖拽图块的来源位置 */
export type DragSource =
  | { kind: 'screen'; screenId: string; index: number }
  | { kind: 'dock'; index: number }
  | { kind: 'folder'; folderId: string; index: number }

/** 拖拽悬停/释放的目标位置 */
export type DropTarget =
  /** 网格单元：插入到某容器（现仅文件夹紧凑网格）的指定下标 */
  | { kind: 'cell'; zone: 'screen' | 'folder'; containerId: string; index: number }
  /** 主屏幕格位：按固定行列坐标自由摆放到某屏幕 */
  | { kind: 'slot'; screenId: string; col: number; row: number }
  /** 紧凑模式落点：把图块插入某屏幕有序序列的指定下标（触发让位重排） */
  | { kind: 'grid'; screenId: string; index: number }
  /** 文件夹图块：把快捷方式放入该文件夹 */
  | { kind: 'folder-tile'; folderId: string }
  /** Dock 栏：插入到指定下标 */
  | { kind: 'dock'; index: number }
  /** 分页指示点：移动到对应屏幕末尾 */
  | { kind: 'pager'; screenId: string }
  /** 文件夹弹层外部区域：把图标拖出文件夹、放回主屏幕 */
  | { kind: 'folder-outside' }

/* ========== 右键菜单 / 弹窗 ========== */

/** 右键菜单的一个菜单项 */
export interface MenuItem {
  label: string
  /** lucide 图标组件（函数式组件），可选 */
  icon?: unknown
  /** 危险操作（红色显示），如删除 */
  danger?: boolean
  action: () => void
}

/** 创建快捷方式时的落点容器 */
export type ShortcutTarget =
  | { kind: 'screen'; screenId: string }
  | { kind: 'folder'; folderId: string }
  | { kind: 'dock' }

/** 当前打开的弹窗（全局唯一） */
export type ModalState =
  /** 创建快捷方式：target 指定创建到哪个容器 */
  | { type: 'shortcut-create'; target: ShortcutTarget }
  /** 编辑已有快捷方式 */
  | { type: 'shortcut-edit'; shortcutId: string }
  /** 创建屏幕 */
  | { type: 'screen-create' }
  /** 编辑屏幕（重命名/改图标） */
  | { type: 'screen-edit'; screenId: string }
  /** 设置，可指定默认高亮的页签 */
  | { type: 'settings'; tab?: 'general' | 'wallpaper' | 'about' }
  | null
