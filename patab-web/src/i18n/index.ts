/**
 * Vue I18n 实例
 * 集中创建全局翻译实例，并提供切换语言时同步 html lang 的入口。
 */
import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, getInitialLocale, type LocaleCode } from './language'
import { messages } from './messages'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
})

/** 设置全局语言，同时更新 html lang 便于浏览器和辅助技术识别页面语言 */
export function setLocale(locale: LocaleCode) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

setLocale(i18n.global.locale.value as LocaleCode)
