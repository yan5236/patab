/**
 * 语言设置工具
 * 只处理语言白名单、旧数据清洗和启动时从持久化读取初始语言。
 */
export const DEFAULT_LOCALE = 'zh-CN'
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]
const STORAGE_KEY = 'patab:v1'

/** 校验语言代码；未知值统一回退到中文 */
export function normalizeLocale(value: unknown): LocaleCode {
  return SUPPORTED_LOCALES.includes(value as LocaleCode) ? (value as LocaleCode) : DEFAULT_LOCALE
}

/** 从 localStorage 读取启动语言，读取失败或旧数据缺字段时使用默认中文 */
export function getInitialLocale(): LocaleCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LOCALE
    const parsed = JSON.parse(raw) as { settings?: { language?: unknown } }
    return normalizeLocale(parsed.settings?.language)
  } catch {
    return DEFAULT_LOCALE
  }
}
