/**
 * 应用屏幕图标目录
 *
 * 统一维护 Lucide 图标名称、旧 Emoji 迁移和搜索规则，避免组件各自解析持久化值。
 */
import {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Clapperboard,
  Gamepad2,
  LayoutGrid,
  Monitor,
  Music,
  Newspaper,
  Palette,
  Plane,
  ShoppingCart,
  Trophy,
  type LucideIcon,
} from '@lucide/vue'

export type ScreenIconName = string

export const FALLBACK_SCREEN_ICON: ScreenIconName = 'LayoutGrid'

/** 编辑弹窗首屏展示的常用图标，完整目录由“更多图标”提供。 */
export const DEFAULT_SCREEN_ICONS: readonly ScreenIconName[] = [
  'Bot',
  'BookOpen',
  'Clapperboard',
  'Gamepad2',
  'BriefcaseBusiness',
  'ShoppingCart',
  'Music',
  'Monitor',
]

/** 旧版允许选择的 Emoji 与 Lucide 图标映射。 */
const LEGACY_EMOJI_ICONS: Readonly<Record<string, ScreenIconName>> = {
  '🤖': 'Bot',
  '📚': 'BookOpen',
  '🎬': 'Clapperboard',
  '🎮': 'Gamepad2',
  '💼': 'BriefcaseBusiness',
  '🛒': 'ShoppingCart',
  '🎵': 'Music',
  '🖥️': 'Monitor',
  '📰': 'Newspaper',
  '⚽': 'Trophy',
  '✈️': 'Plane',
  '🎨': 'Palette',
}

/** 首屏常用及旧版迁移图标直接导入，避免为日常渲染加载完整图标目录。 */
const COMMON_SCREEN_ICON_COMPONENTS: Readonly<Record<string, LucideIcon>> = {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Clapperboard,
  Gamepad2,
  LayoutGrid,
  Monitor,
  Music,
  Newspaper,
  Palette,
  Plane,
  ShoppingCart,
  Trophy,
}

/** 把旧 Emoji、有效图标名或异常持久化值规范化为可渲染图标名。 */
export function normalizeScreenIcon(value: unknown): ScreenIconName {
  if (typeof value === 'string' && LEGACY_EMOJI_ICONS[value]) return LEGACY_EMOJI_ICONS[value]
  if (typeof value === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(value)) return value
  return FALLBACK_SCREEN_ICON
}

/** 返回无需异步目录即可渲染的常用图标；非常用图标返回 undefined。 */
export function getCommonScreenIconComponent(value: unknown): LucideIcon | undefined {
  return COMMON_SCREEN_ICON_COMPONENTS[normalizeScreenIcon(value)]
}
