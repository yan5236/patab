/**
 * 主题工具单元测试
 * 覆盖主题模式清洗、系统主题解析和根节点标记写入。
 */
import { describe, expect, it } from 'vitest'
import { applyTheme, normalizeThemeMode, resolveTheme } from '@/utils/theme'

describe('theme utils', () => {
  it('只接受支持的主题模式，非法值回退跟随系统', () => {
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('unknown')).toBe('system')
    expect(normalizeThemeMode(undefined)).toBe('system')
  })

  it('根据主题模式和系统深色状态解析实际主题', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('把实际主题写入根节点并同步 color-scheme', () => {
    const root = document.createElement('div')

    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')

    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })
})
