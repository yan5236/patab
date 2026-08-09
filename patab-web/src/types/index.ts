/**
 * PaTab 全局共享类型定义
 * 所有跨组件/跨 store 的数据结构都集中在这里，保证单一来源
 */
import type { LocaleCode } from '@/i18n/language'

/**
 * 主屏幕网格坐标（列 col / 行 row，均从 0 起）
 * 仅当图块直接位于 Screen.tiles 顶层时有效；移入文件夹 / Dock 时必须清除，
 * 避免脏坐标在图块再次回到主屏时复现。
 */
export interface GridPos {
  col?: number
  row?: number
}

/** 图块在网格中占用的宽高（格数）；仅文件夹 / 小组件可自定义，缺省走内置默认 */
export interface TileSize {
  w: number
  h: number
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
  /** 自定义尺寸（格数），缺省 1×1 */
  size?: TileSize
}

/** 时钟小组件类型：时间 / 秒表 / 计时器 */
export type ClockType = 'time' | 'stopwatch' | 'timer'

/** 秒表的一次计次记录 */
export interface StopwatchLap {
  /** 计次时的总耗时（毫秒） */
  total: number
  /** 与上一次计次的差值（毫秒） */
  delta: number
}

/** 秒表运行状态（随图块持久化，刷新后按时间戳继续计时） */
export interface StopwatchState {
  /** 本轮计时的开始时间戳（仅运行中有效，暂停时为 null） */
  startedAt: number | null
  /** 暂停时累计的毫秒数 */
  accumulatedMs: number
  running: boolean
  /** 计次记录，最新一条在最前 */
  laps: StopwatchLap[]
}

/** 计时器运行状态（随图块持久化，刷新后按结束时间戳继续倒计时） */
export interface TimerState {
  /** 设定的总时长（毫秒） */
  durationMs: number
  /** 预计结束时间戳（仅运行中有效，暂停时为 null） */
  endsAt: number | null
  /** 暂停 / 结束时的剩余毫秒数 */
  remainingMs: number
  running: boolean
  /** 已结束，等待用户停止响铃 */
  finished: boolean
}

/** 时钟小组件的配置与运行状态 */
export interface ClockConfig {
  type: ClockType
  stopwatch: StopwatchState
  timer: TimerState
}

/** 内置小组件图块（在网格中占多格的功能卡片） */
export interface BuiltinWidgetTile extends GridPos {
  id: string
  type: 'widget'
  /** 内置小组件种类 */
  widgetType: 'todo' | 'clock'
  /** 自定义尺寸（格数），缺省 3×2 */
  size?: TileSize
  /** 时钟小组件的类型与运行状态（仅 widgetType === 'clock' 时存在） */
  config?: ClockConfig
}

/**
 * 第三方自定义组件的轻量主状态引用。
 *
 * Manifest、权限、HTML 与私有数据只存在组件仓库；主状态仅保留该引用，
 * 以便包暂时缺失时后续清洗逻辑仍能渲染占位并提供重新导入入口。
 */
export interface CustomWidgetTile extends GridPos {
  id: string
  type: 'widget'
  /** 区分内置卡片和经 sandbox 执行的第三方组件。 */
  widgetType: 'custom'
  /** 已安装组件的稳定 Manifest id。 */
  componentId: string
  /** 同一组件多实例之间隔离私有数据的稳定 id。 */
  instanceId: string
  /** 宿主原生类型选择器当前保存的 Manifest variant id。 */
  variantId?: string
  /** 已确认的自定义组件尺寸；具体合法性由后续清洗与 Manifest 适配层校验。 */
  size?: TileSize
  /** 运行时健康策略停用实例时的持久标记。 */
  disabled?: boolean
  /**
   * 明确禁止自定义组件持久化内置时钟配置，同时保持既有共用 widget 读取逻辑可安全识别该字段不存在。
   */
  config?: never
}

/** 保留内置图块与自定义组件图块的可判别联合，供主屏、拖拽和持久化共用。 */
export type WidgetTile = BuiltinWidgetTile | CustomWidgetTile

/** 应用屏幕网格中的一个图块 */
export type Tile = Shortcut | Folder | WidgetTile

/** 应用屏幕（一页图标网格，可按分类创建多个） */
export interface Screen {
  id: string
  name: string
  /** Lucide 图标名称，显示在分页指示器上 */
  icon: string
  tiles: Tile[]
}

/** 待办事项列表 */
export interface TodoList {
  id: string
  name: string
  order: number
  /** 系统智能列表，不可删除/重命名 */
  system?: 'all' | 'today' | 'important'
}

/** 待办事项条目（待办小组件的数据） */
export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** ISO 日期（YYYY-MM-DD），可选 */
  date?: string
  /** 是否标记为重要 */
  important: boolean
  /** 所属自定义列表 id；智能列表中的 todo 可能为空 */
  listId?: string
  /** 全局排序权重，用于自由排序 */
  order: number
}

/** 搜索引擎配置 */
export interface SearchEngine {
  /** 唯一标识，用于选中状态和持久化 */
  id: string
  /** 展示名称 */
  name: string
  /** 搜索地址模板，使用 {q} 表示关键词 */
  urlTemplate: string
}

/**
 * 主屏图标排列模式
 * - compact：紧凑模式，图标按阅读顺序紧密排列，拖拽时手机桌面式「让位」推挤
 * - free：自由摆放，图标可停在任意格、中间保留永久空位，拖拽只落到空格
 */
export type PlacementMode = 'compact' | 'free'

/**
 * 界面主题模式
 * - system：跟随系统深浅色
 * - light：固定浅色
 * - dark：固定深色
 */
export type ThemeMode = 'system' | 'light' | 'dark'

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
  /** 当前界面语言 */
  language: LocaleCode
  /** 界面主题模式 */
  themeMode: ThemeMode
  /** 壁纸地址（默认使用内置壁纸） */
  wallpaper: string
  /** 用户自定义添加的壁纸列表 */
  customWallpapers: CustomWallpaper[]
  /** 是否 12 小时制 */
  hour12: boolean
  /** 是否在时钟下方显示日期 */
  showDate: boolean
  /** 是否隐藏应用屏幕、分页器与 Dock，仅保留时钟和搜索栏 */
  cleanMode: boolean
  /** 当前搜索引擎 ID；无可用引擎时为空 */
  searchEngine: string
  /** 可用搜索引擎列表 */
  searchEngines: SearchEngine[]
  /** 主屏图标排列模式（默认 compact） */
  placementMode: PlacementMode
}

/** 持久化到 localStorage 的根数据结构 */
export interface LauncherState {
  version: 1
  screens: Screen[]
  dock: Shortcut[]
  todos: TodoItem[]
  todoLists: TodoList[]
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
  | { type: 'settings'; tab?: 'general' | 'search' | 'wallpaper' | 'about' }
  /** 组件商店 */
  | { type: 'component-store' }
  /** 待办事项弹窗 */
  | { type: 'todo' }
  /** 时钟类型选择：带 tileId 为切换已有图块类型，带 screenId 为添加到屏幕 */
  | { type: 'clock-type-picker'; screenId?: string; tileId?: string }
  /** 时钟小组件详情弹窗（1×1 图标形态点开） */
  | { type: 'clock-detail'; tileId: string }
  /** 第三方组件 detail/settings surface；iframe 会在关闭时由宿主销毁。 */
  | { type: 'custom-component-surface'; componentId: string; instanceId: string; surface: 'detail' | 'settings' }
  /** 第三方组件类型选择器；选项只读取已验证 Manifest 静态元数据。 */
  | { type: 'custom-component-variant-picker'; componentId: string; instanceId?: string; screenId?: string }
  | null
