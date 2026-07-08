/**
 * launcher store —— PaTab 持久业务状态门面
 *
 * 职责：
 * 1. 创建应用屏幕 / Dock / 待办 / 设置的响应式状态
 * 2. 组装同目录领域模块，保持组件调用 useLauncherStore 的 API 不变
 * 3. localStorage 持久化（防抖写入）
 *
 * 具体查询、图块、待办、拖拽和设置规则已拆到同目录模块；
 * 这里不继续承载领域细节。
 */
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { LauncherState, Screen, Settings, Shortcut, TodoItem, TodoList } from '@/types'
import { createLauncherDropActions } from './launcherDrop'
import { clearPos, placeOnScreen, recompactScreen } from './launcherPlacement'
import { createLauncherQueries } from './launcherQueries'
import { createLauncherSettingsActions } from './launcherSettings'
import { createInitialLauncherState, STORAGE_KEY } from './launcherState'
import { createLauncherTileActions } from './launcherTiles'
import { createLauncherTodoActions } from './launcherTodos'

export { STORAGE_KEY } from './launcherState'
export { clearPos, placeOnScreen, recompactScreen } from './launcherPlacement'

export const useLauncherStore = defineStore('launcher', () => {
  const initial = createInitialLauncherState()

  const screens = ref<Screen[]>(initial.screens)
  const dock = ref<Shortcut[]>(initial.dock)
  const todos = ref<TodoItem[]>(initial.todos)
  const todoLists = ref<TodoList[]>(initial.todoLists)
  const settings = ref<Settings>(initial.settings)

  /* ---------- 持久化（防抖写入） ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    [screens, dock, todos, todoLists, settings],
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const state: LauncherState = {
          version: 1,
          screens: screens.value,
          dock: dock.value,
          todos: todos.value,
          todoLists: todoLists.value,
          settings: settings.value,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      }, 300)
    },
    { deep: true },
  )

  const queries = createLauncherQueries({ screens, dock })
  const tileActions = createLauncherTileActions({ screens, dock, settings, queries })
  const todoActions = createLauncherTodoActions({ todos, todoLists })
  const dropActions = createLauncherDropActions({
    screens,
    dock,
    settings,
    queries,
    tileActions,
  })
  const settingsActions = createLauncherSettingsActions(settings)

  return {
    screens,
    dock,
    todos,
    todoLists,
    settings,
    ...queries,
    ...tileActions,
    ...todoActions,
    ...dropActions,
    ...settingsActions,
  }
})
