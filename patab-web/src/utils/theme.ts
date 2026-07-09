/**
 * 主题模式工具
 * 保持纯函数优先，供 store 清洗、单元测试和运行时主题挂载复用。
 */
import type { ThemeMode } from '@/types'

/** 实际渲染主题，只区分浅色与深色 */
export type ResolvedTheme = 'light' | 'dark'

/** 清洗主题模式，旧数据缺失或非法值统一回退为跟随系统 */
export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/** 根据用户选择和系统深色状态解析最终主题 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}

/** 把最终主题写到根节点，供全局 CSS 变量切换颜色 */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme) {
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
