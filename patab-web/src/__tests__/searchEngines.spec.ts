import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_ENGINES,
  buildSearchUrl,
  normalizeSearchTemplate,
  sanitizeSearchEngineId,
  sanitizeSearchEngines,
} from '@/utils/searchEngines'

describe('searchEngines 搜索引擎工具', () => {
  it('缺失搜索引擎列表时回退到扩展默认列表', () => {
    const engines = sanitizeSearchEngines(undefined)
    expect(engines.map((engine) => engine.name)).toEqual(
      DEFAULT_SEARCH_ENGINES.map((engine) => engine.name),
    )
    expect(engines).not.toBe(DEFAULT_SEARCH_ENGINES)
  })

  it('支持把 %s 模板归一化为 {q}', () => {
    expect(normalizeSearchTemplate('https://metaso.cn/?q=%s')).toBe('https://metaso.cn/?q={q}')
  })

  it('清洗脏搜索引擎并保留空列表', () => {
    expect(sanitizeSearchEngines([])).toEqual([])
    expect(
      sanitizeSearchEngines([
        { id: 'ok', name: '  秘塔  ', urlTemplate: 'https://metaso.cn/?q=%s' },
        { id: 'ok', name: '重复', urlTemplate: 'https://example.com/?q={q}' },
        { id: 'bad', name: '坏数据', urlTemplate: 'https://example.com/' },
      ]),
    ).toEqual([{ id: 'ok', name: '秘塔', urlTemplate: 'https://metaso.cn/?q={q}' }])
  })

  it('当前搜索引擎无效或列表为空时安全回退', () => {
    const engines = [{ id: 'a', name: 'A', urlTemplate: 'https://a.com/?q={q}' }]
    expect(sanitizeSearchEngineId('missing', engines)).toBe('a')
    expect(sanitizeSearchEngineId('a', engines)).toBe('a')
    expect(sanitizeSearchEngineId('a', [])).toBe('')
  })

  it('按模板生成最终搜索地址', () => {
    const engine = { id: 'a', name: 'A', urlTemplate: 'https://a.com/?q={q}' }
    expect(buildSearchUrl(engine, 'hello world')).toBe('https://a.com/?q=hello%20world')
  })
})
