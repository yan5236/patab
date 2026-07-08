/**
 * 翻译资源聚合
 * 各语言按模块拆分 JSON，这里只负责组装成 vue-i18n 需要的 messages。
 */
import zhCommon from './locales/zh-CN/common.json'
import zhSettings from './locales/zh-CN/settings.json'
import zhTopbar from './locales/zh-CN/topbar.json'
import zhScreen from './locales/zh-CN/screen.json'
import zhDock from './locales/zh-CN/dock.json'
import zhModals from './locales/zh-CN/modals.json'
import zhTodo from './locales/zh-CN/todo.json'
import zhWidgets from './locales/zh-CN/widgets.json'

import enCommon from './locales/en-US/common.json'
import enSettings from './locales/en-US/settings.json'
import enTopbar from './locales/en-US/topbar.json'
import enScreen from './locales/en-US/screen.json'
import enDock from './locales/en-US/dock.json'
import enModals from './locales/en-US/modals.json'
import enTodo from './locales/en-US/todo.json'
import enWidgets from './locales/en-US/widgets.json'

export const messages = {
  'zh-CN': {
    common: zhCommon,
    settings: zhSettings,
    topbar: zhTopbar,
    screen: zhScreen,
    dock: zhDock,
    modals: zhModals,
    todo: zhTodo,
    widgets: zhWidgets,
  },
  'en-US': {
    common: enCommon,
    settings: enSettings,
    topbar: enTopbar,
    screen: enScreen,
    dock: enDock,
    modals: enModals,
    todo: enTodo,
    widgets: enWidgets,
  },
} as const
