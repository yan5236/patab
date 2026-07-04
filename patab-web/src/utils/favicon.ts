/**
 * 网址 / 图标相关工具
 * - 规范化用户输入的网址
 * - 生成 favicon 候选地址链（供 AppIcon 逐个尝试）
 * - 按名称哈希分配首字母兜底图标的背景色
 */

/** 首字母兜底图标的预设色板（与毛玻璃风格协调的饱和色） */
const ICON_PALETTE = [
  '#f87171', // 红
  '#fb923c', // 橙
  '#fbbf24', // 琥珀
  '#4ade80', // 绿
  '#2dd4bf', // 青
  '#38bdf8', // 天蓝
  '#818cf8', // 靛
  '#c084fc', // 紫
  '#f472b6', // 粉
]

/** 规范化网址：无协议时自动补全 https:// */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** 从网址中提取域名，解析失败返回空串 */
export function getDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname
  } catch {
    return ''
  }
}

/**
 * 生成图标候选地址链，按顺序尝试：
 * 自定义图标 → favicon 服务 → 网站根目录 favicon.ico
 * 全部失败后由 AppIcon 渲染首字母色块
 */
export function faviconCandidates(url: string, iconUrl?: string): string[] {
  const candidates: string[] = []
  if (iconUrl?.trim()) candidates.push(iconUrl.trim())
  const domain = getDomain(url)
  if (domain) {
    candidates.push(`https://favicon.im/${domain}?larger=true`)
    candidates.push(`https://${domain}/favicon.ico`)
  }
  return candidates
}

/** 按名称哈希从色板中取一个稳定的背景色 */
export function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return ICON_PALETTE[hash % ICON_PALETTE.length]!
}

/** 取名称的首个字符（支持中文/emoji），用于兜底图标 */
export function firstGlyph(name: string): string {
  const glyph = [...name.trim()][0]
  return (glyph ?? '?').toUpperCase()
}
