/**
 * 应用屏幕图标目录单元测试
 * 覆盖旧 Emoji 迁移、非法值回退和完整目录搜索。
 */
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SCREEN_ICON,
  normalizeScreenIcon,
} from '@/utils/screenIcons'
import {
  SCREEN_ICON_NAMES,
  isScreenIconName,
  loadScreenIconComponent,
  searchScreenIcons,
} from '@/utils/screenIconLibrary'

describe('screen icons', () => {
  it('把旧版十二个 Emoji 映射为有效 Lucide 图标', () => {
    const legacyIcons = ['🤖', '📚', '🎬', '🎮', '💼', '🛒', '🎵', '🖥️', '📰', '⚽', '✈️', '🎨']

    legacyIcons.forEach((icon) => expect(isScreenIconName(normalizeScreenIcon(icon))).toBe(true))
  })

  it('保留有效图标名并让非法值安全回退', () => {
    expect(normalizeScreenIcon('Bot')).toBe('Bot')
    expect(normalizeScreenIcon('不存在的图标')).toBe(FALLBACK_SCREEN_ICON)
    expect(normalizeScreenIcon(undefined)).toBe(FALLBACK_SCREEN_ICON)
  })

  it('搜索忽略大小写和分隔符，空搜索返回完整目录', () => {
    expect(SCREEN_ICON_NAMES.length).toBeGreaterThan(1700)
    expect(SCREEN_ICON_NAMES).not.toContain('Index')
    expect(searchScreenIcons('book open')).toContain('BookOpen')
    expect(searchScreenIcons('SHOPPING-CART')).toContain('ShoppingCart')
    expect(searchScreenIcons('')).toHaveLength(SCREEN_ICON_NAMES.length)
  })

  it('只按需载入指定图标，非法名称回退布局图标', async () => {
    expect(await loadScreenIconComponent('Bot')).toBeTypeOf('function')
    expect(await loadScreenIconComponent('非法名称')).toBeTypeOf('function')
  })
})
