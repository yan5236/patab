import { detectRuntimeEnvironment } from '@/utils/runtimeEnvironment'

type BingSuggestItem = {
  Txt?: unknown
}

type BingSuggestGroup = {
  Suggests?: unknown
}

const BING_SUGGESTION_URL = 'https://api.bing.com/qsonhs.aspx'
const SUGGESTION_TIMEOUT_MS = 5000

/** 从必应联想响应中提取文本，遍历所有分组并去重限量 */
export function extractBingSuggestions(data: unknown, limit = 8): string[] {
  const results = (data as { AS?: { Results?: unknown } })?.AS?.Results
  if (!Array.isArray(results)) return []

  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const group of results as BingSuggestGroup[]) {
    if (!Array.isArray(group?.Suggests)) continue
    for (const item of group.Suggests as BingSuggestItem[]) {
      const text = typeof item?.Txt === 'string' ? item.Txt.trim() : ''
      if (!text || seen.has(text)) continue
      seen.add(text)
      suggestions.push(text)
      if (suggestions.length >= limit) return suggestions
    }
  }
  return suggestions
}

/** 从 JSONP 文本中解析出 payload，解析失败时返回 null */
export function parseBingJsonpText(text: string): unknown | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 通过 script JSONP 获取搜索联想，供网页版使用 */
function fetchBingSuggestionsByScript(keyword: string): Promise<string[]> {
  if (typeof document === 'undefined') return Promise.resolve([])

  return new Promise((resolve) => {
    const callbackName = `__patabBingSuggest${Date.now()}${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined

    /** 结束本次 JSONP 请求并清理临时全局回调与 script 标签 */
    function finish(suggestions: string[]) {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      delete (window as unknown as Record<string, unknown>)[callbackName]
      script.remove()
      resolve(suggestions)
    }

    ;(window as unknown as Record<string, unknown>)[callbackName] = (payload: unknown) => {
      finish(extractBingSuggestions(payload))
    }
    script.src = `${BING_SUGGESTION_URL}?q=${encodeURIComponent(keyword)}&type=cb&cb=${callbackName}`
    script.async = true
    script.onerror = () => finish([])
    timer = setTimeout(() => finish([]), SUGGESTION_TIMEOUT_MS)
    document.head.appendChild(script)
  })
}

/** 通过 fetch 获取 JSONP 文本，避免 Manifest V3 扩展页加载远程脚本 */
async function fetchBingSuggestionsByText(keyword: string): Promise<string[]> {
  if (typeof fetch === 'undefined') return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUGGESTION_TIMEOUT_MS)
  try {
    const callbackName = `patabSuggest${Date.now()}`
    const url = `${BING_SUGGESTION_URL}?q=${encodeURIComponent(keyword)}&type=cb&cb=${callbackName}`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return []
    return extractBingSuggestions(parseBingJsonpText(await response.text()))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** 通过必应接口获取搜索联想；扩展版不用远程 script，失败、超时或空关键词时安全返回空数组 */
export function fetchBingSuggestions(query: string): Promise<string[]> {
  const keyword = query.trim()
  if (!keyword) return Promise.resolve([])
  return detectRuntimeEnvironment() === 'extension'
    ? fetchBingSuggestionsByText(keyword)
    : fetchBingSuggestionsByScript(keyword)
}
