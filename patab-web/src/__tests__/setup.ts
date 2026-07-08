/**
 * Vitest 全局测试设置
 * 统一给 Vue Test Utils 挂载 i18n，避免每个组件测试重复配置。
 */
import { config } from '@vue/test-utils'
import { i18n } from '@/i18n'

config.global.plugins = [...(config.global.plugins ?? []), i18n]
