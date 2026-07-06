import { describe, expect, it } from 'vitest'
import { extractBingSuggestions } from '@/utils/searchSuggestions'

describe('searchSuggestions 搜索联想工具', () => {
  it('遍历多个必应分组提取联想词', () => {
    const data = {
      AS: {
        Results: [
          { Type: 'VS', Suggests: [{ Txt: '土薯工具' }, { Txt: '土薯工具python' }] },
          { Type: 'AS', Suggests: [{ Txt: '土薯工具官网入口' }, { Txt: '图书' }] },
        ],
      },
    }

    expect(extractBingSuggestions(data)).toEqual([
      '土薯工具',
      '土薯工具python',
      '土薯工具官网入口',
      '图书',
    ])
  })

  it('响应为空或形状错误时返回空数组', () => {
    expect(extractBingSuggestions(null)).toEqual([])
    expect(extractBingSuggestions({ AS: { Results: 'bad' } })).toEqual([])
    expect(extractBingSuggestions({ AS: { Results: [{ Suggests: 'bad' }] } })).toEqual([])
  })

  it('去除空白、重复项并按上限返回', () => {
    const data = {
      AS: {
        Results: [
          { Suggests: [{ Txt: '  土薯  ' }, { Txt: '' }, { Txt: '土薯' }] },
          { Suggests: [{ Txt: '图书' }, { Txt: '土豆' }] },
        ],
      },
    }

    expect(extractBingSuggestions(data, 2)).toEqual(['土薯', '图书'])
  })
})
