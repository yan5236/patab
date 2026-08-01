/**
 * 完整应用屏幕图标库
 *
 * 仅在打开“更多图标”或渲染非常用图标时异步载入，避免拖大首屏 JS。
 */
import type { LucideIcon } from '@lucide/vue'
import {
  FALLBACK_SCREEN_ICON,
  getCommonScreenIconComponent,
  normalizeScreenIcon,
  type ScreenIconName,
} from './screenIcons'

type ScreenIconModule = { default: LucideIcon }
type ScreenIconImporter = () => Promise<ScreenIconModule>

const iconModules = import.meta.glob<ScreenIconModule>([
  '@lucide-icons/*.mjs',
  '!**/index.mjs',
], { query: '?screen-icon-dynamic' })

/** 把 Lucide 的短横线文件名转换成持久化使用的 PascalCase 图标名。 */
function iconNameFromPath(path: string): ScreenIconName {
  const filename = path.split('/').pop()?.replace(/\.mjs$/, '') ?? ''
  return filename.replace(/(^|-)([a-z0-9])/g, (_, __, character: string) => character.toUpperCase())
}

const iconImporters = Object.fromEntries(
  Object.entries(iconModules)
    .map(([path, importer]) => [iconNameFromPath(path), importer]),
) as Record<ScreenIconName, ScreenIconImporter>

export const SCREEN_ICON_NAMES = Object.keys(iconImporters).sort()
const SCREEN_ICON_NAME_SET = new Set(SCREEN_ICON_NAMES)

/** 判断字符串是否为当前 Lucide 版本提供的图标名称。 */
export function isScreenIconName(value: unknown): value is ScreenIconName {
  return typeof value === 'string' && SCREEN_ICON_NAME_SET.has(value)
}

/** 按需载入指定图标组件；载入失败时安全回退到布局图标。 */
export async function loadScreenIconComponent(value: unknown): Promise<LucideIcon> {
  const importer = iconImporters[normalizeScreenIcon(value)] ?? iconImporters[FALLBACK_SCREEN_ICON]
  try {
    return (await importer!()).default
  } catch {
    return getCommonScreenIconComponent(FALLBACK_SCREEN_ICON)!
  }
}

/** 按英文图标名搜索完整目录，忽略大小写、空格、横线和下划线。 */
export function searchScreenIcons(query: string): ScreenIconName[] {
  const keyword = query.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')
  if (!keyword) return SCREEN_ICON_NAMES
  return SCREEN_ICON_NAMES.filter((name) => name.toLocaleLowerCase().includes(keyword))
}
