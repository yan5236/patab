import type { WidgetThemeTokenName, WidgetThemeTokens } from '@patab/widget-sdk'

/**
 * 宿主内部变量到公开 token 的唯一显式映射。
 *
 * 此表仅在宿主运行时使用，序列化进 sandbox 的值只使用 --pt-* 名称，避免第三方依赖内部主题实现。
 */
const INTERNAL_THEME_TOKEN_MAP: Readonly<Record<WidgetThemeTokenName, string | undefined>> = {
  '--pt-accent': undefined,
  '--pt-accent-contrast': undefined,
  '--pt-accent-hover': undefined,
  '--pt-border': '--theme-panel-border',
  '--pt-color-scheme': undefined,
  '--pt-danger': '--theme-error-text',
  '--pt-focus-ring': undefined,
  '--pt-font-sans': undefined,
  '--pt-input': '--theme-input-bg',
  '--pt-motion-duration': undefined,
  '--pt-motion-easing': undefined,
  '--pt-radius-lg': undefined,
  '--pt-radius-md': undefined,
  '--pt-radius-sm': undefined,
  '--pt-shadow': '--theme-shadow',
  '--pt-surface': '--theme-row-bg',
  '--pt-surface-strong': '--theme-glass-strong-bg',
  '--pt-text': '--theme-text',
  '--pt-text-muted': '--theme-muted',
  '--pt-text-strong': '--theme-heading',
}

/** 在无布局引擎的测试环境中提供安全回退，真实浏览器会优先读取当前宿主主题的计算值。 */
function createFallbackTokens(theme: 'dark' | 'light', reducedMotion: boolean): Record<WidgetThemeTokenName, string> {
  const isDark = theme === 'dark'
  return {
    '--pt-accent': isDark ? 'rgb(56 189 248)' : 'rgb(2 132 199)',
    '--pt-accent-contrast': isDark ? 'rgb(8 47 73)' : 'rgb(255 255 255)',
    '--pt-accent-hover': isDark ? 'rgb(125 211 252)' : 'rgb(3 105 161)',
    '--pt-border': isDark ? 'rgb(255 255 255 / 0.14)' : 'rgb(255 255 255 / 0.45)',
    '--pt-color-scheme': theme,
    '--pt-danger': isDark ? 'rgb(252 165 165)' : 'rgb(220 38 38)',
    '--pt-focus-ring': isDark ? 'rgb(125 211 252)' : 'rgb(2 132 199)',
    '--pt-font-sans': "Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif",
    '--pt-input': isDark ? 'rgb(255 255 255 / 0.14)' : 'rgb(255 255 255 / 0.7)',
    '--pt-motion-duration': reducedMotion ? '0ms' : '150ms',
    '--pt-motion-easing': 'ease',
    '--pt-radius-lg': '1.5rem',
    '--pt-radius-md': '1rem',
    '--pt-radius-sm': '0.75rem',
    '--pt-shadow': isDark ? '0 10px 15px -3px rgb(0 0 0 / 0.32)' : '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    '--pt-surface': isDark ? 'rgb(255 255 255 / 0.08)' : 'rgb(255 255 255 / 0.45)',
    '--pt-surface-strong': isDark ? 'rgb(24 24 27 / 0.88)' : 'rgb(255 255 255 / 0.8)',
    '--pt-text': isDark ? 'rgb(229 229 229)' : 'rgb(64 64 64)',
    '--pt-text-muted': isDark ? 'rgb(161 161 170)' : 'rgb(115 115 115)',
    '--pt-text-strong': isDark ? 'rgb(245 245 245)' : 'rgb(38 38 38)',
  }
}

/**
 * 从当前宿主文档生成公开 token 快照。
 *
 * 只读取明确列出的内部变量并立刻复制为普通字符串，组件永远无法看到原变量名称或访问宿主 DOM。
 */
export function getWidgetThemeTokens(document: Document | undefined = globalThis.document): WidgetThemeTokens {
  const root = document?.documentElement
  const theme = root?.dataset.theme === 'dark' ? 'dark' : 'light'
  const reducedMotion = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const values = createFallbackTokens(theme, reducedMotion)
  const view = document?.defaultView
  const computed = root && view ? view.getComputedStyle(root) : undefined

  for (const [publicName, internalName] of Object.entries(INTERNAL_THEME_TOKEN_MAP) as [WidgetThemeTokenName, string | undefined][]) {
    if (!internalName) continue
    const value = computed?.getPropertyValue(internalName).trim()
    if (value) values[publicName] = value
  }
  return { version: 1, values }
}

/**
 * 生成可注入 sandbox 文档的受控主题样式。
 *
 * 变量值来自宿主自己的映射表；SDK 的 theme.css 由组件在自身包中引用，不接受组件传入的 CSS 或变量名。
 */
export function createWidgetThemeStyle(tokens: WidgetThemeTokens): string {
  const declarations = Object.entries(tokens.values)
    .map(([name, value]) => `${name}: ${value};`)
    .join('')
  return `:root{${declarations}}`
}
