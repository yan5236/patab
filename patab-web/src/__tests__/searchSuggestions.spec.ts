import { describe, expect, it } from 'vitest'
import { extractBingSuggestions, parseBingJsonpText } from '@/utils/searchSuggestions'

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

  it('解析必应 JSONP 文本，扩展版 fetch 后可复用同一提取逻辑', () => {
    const text = 'callbackName({"AS":{"Results":[{"Suggests":[{"Txt":"PaTab 扩展"}]}]}});'

    expect(parseBingJsonpText(text)).toEqual({
      AS: {
        Results: [{ Suggests: [{ Txt: 'PaTab 扩展' }] }],
      },
    })
  })

  it('兼容必应实际返回的函数存在性包装和尾部注释', () => {
    const text =
      'if(typeof callbackName == \'function\') callbackName({"AS":{"Results":[{"Suggests":[{"Txt":"PaTab"}]}]}}/* pageview_candidate */);'

    expect(parseBingJsonpText(text)).toEqual({
      AS: {
        Results: [{ Suggests: [{ Txt: 'PaTab' }] }],
      },
    })
  })

  it('JSONP 文本为空或格式错误时返回 null', () => {
    expect(parseBingJsonpText('')).toBeNull()
    expect(parseBingJsonpText('not jsonp')).toBeNull()
    expect(parseBingJsonpText('cb({bad json});')).toBeNull()
  })
})
