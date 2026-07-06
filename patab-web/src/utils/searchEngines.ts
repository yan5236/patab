import type { SearchEngine } from '@/types'
import { normalizeUrl } from '@/utils/favicon'

/** 默认搜索引擎列表，首次启动和旧数据迁移时使用 */
export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  { id: 'baidu', name: '百度', urlTemplate: 'https://www.baidu.com/s?wd={q}' },
  { id: 'bing', name: '必应', urlTemplate: 'https://www.bing.com/search?q={q}' },
  { id: 'google', name: 'Google', urlTemplate: 'https://www.google.com/search?q={q}' },
  { id: 'yandex', name: 'Yandex', urlTemplate: 'https://yandex.com/search/?text={q}' },
  { id: 'metaso', name: '秘塔 AI 搜索', urlTemplate: 'https://metaso.cn/?q={q}' },
  { id: 'so360', name: '360 搜索', urlTemplate: 'https://www.so.com/s?q={q}' },
  { id: 'sogou', name: '搜狗搜索', urlTemplate: 'https://www.sogou.com/web?query={q}' },
]

/** 生成搜索引擎 ID，优先用时间戳避免和默认引擎冲突 */
export function createSearchEngineId(): string {
  return `engine-${Date.now()}`
}

/** 规范化搜索模板：支持旧式 %s，并自动补全协议 */
export function normalizeSearchTemplate(input: string): string {
  const normalized = normalizeUrl(input).replace('%s', '{q}')
  return normalized.trim()
}

/** 校验搜索模板，必须包含关键词占位并能作为 URL 使用 */
export function isSearchTemplateValid(input: string): boolean {
  const template = normalizeSearchTemplate(input)
  if (!template.includes('{q}')) return false
  try {
    new URL(template.replace('{q}', 'test'))
    return true
  } catch {
    return false
  }
}

/** 清洗持久化搜索引擎列表；缺失时回退默认列表，空数组保留为空 */
export function sanitizeSearchEngines(value: unknown): SearchEngine[] {
  if (value === undefined) return DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }))
  if (!Array.isArray(value)) return []

  const used = new Set<string>()
  const engines: SearchEngine[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (
      typeof record.id !== 'string' ||
      typeof record.name !== 'string' ||
      typeof record.urlTemplate !== 'string'
    ) {
      continue
    }
    const id = record.id.trim()
    const name = record.name.trim()
    const urlTemplate = normalizeSearchTemplate(record.urlTemplate)
    if (!id || !name || used.has(id) || !isSearchTemplateValid(urlTemplate)) continue
    used.add(id)
    engines.push({ id, name, urlTemplate })
  }
  return engines
}

/** 清洗当前搜索引擎 ID，列表为空时返回空串 */
export function sanitizeSearchEngineId(value: unknown, engines: SearchEngine[]): string {
  if (typeof value === 'string' && engines.some((engine) => engine.id === value)) return value
  return engines[0]?.id ?? ''
}

/** 根据模板和关键词生成最终搜索地址 */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.urlTemplate.replace('{q}', encodeURIComponent(query))
}

/** 从搜索模板提取域名，供搜索引擎图标使用 */
export function siteFromSearchTemplate(urlTemplate: string): string {
  try {
    return new URL(urlTemplate.replace('{q}', 'test')).hostname
  } catch {
    return ''
  }
}
