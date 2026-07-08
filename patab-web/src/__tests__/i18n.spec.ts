/**
 * i18n 单元测试
 * 覆盖语言清洗、持久化读取和中英文翻译键完整性。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '@/stores/launcherState'
import { messages } from '@/i18n/messages'
import { getInitialLocale, normalizeLocale } from '@/i18n/language'

/** 扁平化翻译对象的键路径，便于比较不同语言包是否缺项 */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
}

describe('i18n language', () => {
  beforeEach(() => localStorage.clear())

  it('只接受受支持语言，非法值回退中文', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('fr-FR')).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
  })

  it('从持久化设置读取初始语言', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { language: 'en-US' },
        screens: [],
      }),
    )

    expect(getInitialLocale()).toBe('en-US')
  })

  it('中英文翻译键保持一致', () => {
    expect(flattenKeys(messages['en-US']).sort()).toEqual(flattenKeys(messages['zh-CN']).sort())
  })
})
