/**
 * launcher 待办业务动作
 *
 * 负责待办条目和待办列表的增删改、排序和完成提示音；
 * 不关心屏幕、Dock 或拖拽状态。
 */
import type { Ref } from 'vue'
import type { TodoItem, TodoList } from '@/types'
import { createId } from '@/utils/id'
import { playDing } from '@/utils/sound'

type LauncherTodoState = {
  todos: Ref<TodoItem[]>
  todoLists: Ref<TodoList[]>
}

/** 描述 launcher 待办领域发生的最小变化，不携带列表归属、排序或响应式对象。 */
export interface LauncherTodoChangedEvent {
  readonly change: 'created' | 'updated' | 'deleted'
  readonly id: string
}

/** 创建待办和待办列表的业务动作集合 */
export function createLauncherTodoActions({ todos, todoLists }: LauncherTodoState) {
  const todoChangeListeners = new Set<(event: LauncherTodoChangedEvent) => void>()

  /** 仅在领域动作成功改变待办后通知订阅者，避免 UI 或第三方读取内部响应式引用。 */
  function notifyTodoChanged(event: LauncherTodoChangedEvent) {
    for (const listener of todoChangeListeners) {
      listener(event)
    }
  }

  /** 新增待办；空文本会被忽略，成功时返回新条目供领域适配器立即转换为公开 DTO。 */
  function addTodo(
    text: string,
    opts: { date?: string; important?: boolean; listId?: string } = {},
  ): TodoItem | undefined {
    const trimmed = text.trim()
    if (!trimmed) return
    const maxOrder = todos.value.reduce((max, t) => Math.max(max, t.order), 0)
    const todo: TodoItem = {
      id: createId(),
      text: trimmed,
      done: false,
      important: opts.important ?? false,
      date: opts.date,
      listId: opts.listId,
      order: maxOrder + 1000,
    }
    todos.value.push(todo)
    notifyTodoChanged({ change: 'created', id: todo.id })
    return todo
  }

  /**
   * 更新待办的公开可变字段；未传入字段保持不变，日期传入 null 时清除日期。
   *
   * 该领域入口统一处理宿主 UI 与 Capability 的写入，成功时只返回条目给调用方转换，绝不直接跨边界返回。
   */
  function updateTodo(
    todoId: string,
    patch: { text?: string; date?: string | null; important?: boolean; done?: boolean },
  ): TodoItem | undefined {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    if (patch.text !== undefined) todo.text = patch.text.trim()
    if (patch.date === null) delete todo.date
    else if (patch.date !== undefined) todo.date = patch.date
    if (patch.important !== undefined) todo.important = patch.important
    if (patch.done !== undefined) todo.done = patch.done
    notifyTodoChanged({ change: 'updated', id: todo.id })
    return todo
  }

  /** 切换待办完成态，完成时播放提示音；未找到条目时返回 undefined。 */
  function toggleTodo(todoId: string): TodoItem | undefined {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    todo.done = !todo.done
    if (todo.done) playDing()
    notifyTodoChanged({ change: 'updated', id: todo.id })
    return todo
  }

  /** 删除指定待办，只有真实删除成功时才发布变化事件并返回 true。 */
  function removeTodo(todoId: string): boolean {
    const index = todos.value.findIndex((t) => t.id === todoId)
    if (index < 0) return false
    todos.value.splice(index, 1)
    notifyTodoChanged({ change: 'deleted', id: todoId })
    return true
  }

  /**
   * 订阅 launcher 的待办领域变化；回调仅包含公开可映射的变化类型与 ID。
   *
   * Capability 层必须在投递前再次验证 todos.read，以保证后续撤销授权立即生效。
   */
  function subscribeTodoChanges(listener: (event: LauncherTodoChangedEvent) => void): () => void {
    todoChangeListeners.add(listener)
    return () => todoChangeListeners.delete(listener)
  }

  /** 按传入 id 顺序重写待办排序值 */
  function setTodoOrder(orderedIds: string[]) {
    todos.value.forEach((todo) => {
      const index = orderedIds.indexOf(todo.id)
      if (index >= 0) todo.order = index * 1000
    })
  }

  /** 新增自定义待办列表；空名称会被忽略 */
  function addTodoList(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const maxOrder = todoLists.value.reduce((max, l) => Math.max(max, l.order), 0)
    todoLists.value.push({ id: createId(), name: trimmed, order: maxOrder + 1000 })
  }

  /** 重命名待办列表，系统列表和自定义列表都走同一入口 */
  function renameTodoList(listId: string, name: string) {
    const list = todoLists.value.find((l) => l.id === listId)
    if (list) list.name = name.trim()
  }

  /** 删除自定义待办列表，并把该列表下的待办恢复为未分配 */
  function removeTodoList(listId: string) {
    const index = todoLists.value.findIndex((l) => l.id === listId)
    if (index < 0) return
    const list = todoLists.value[index]
    if (list?.system) return
    todoLists.value.splice(index, 1)
    todos.value.forEach((todo) => {
      if (todo.listId === listId) todo.listId = undefined
    })
  }

  /** 按传入 id 顺序重写待办列表排序值 */
  function setTodoListOrder(orderedIds: string[]) {
    todoLists.value.forEach((list) => {
      const index = orderedIds.indexOf(list.id)
      if (index >= 0) list.order = index * 1000
    })
  }

  return {
    addTodo,
    updateTodo,
    toggleTodo,
    removeTodo,
    subscribeTodoChanges,
    setTodoOrder,
    addTodoList,
    renameTodoList,
    removeTodoList,
    setTodoListOrder,
  }
}
