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

/** 创建待办和待办列表的业务动作集合 */
export function createLauncherTodoActions({ todos, todoLists }: LauncherTodoState) {
  /** 新增待办；空文本会被忽略 */
  function addTodo(
    text: string,
    opts: { date?: string; important?: boolean; listId?: string } = {},
  ) {
    const trimmed = text.trim()
    if (!trimmed) return
    const maxOrder = todos.value.reduce((max, t) => Math.max(max, t.order), 0)
    todos.value.push({
      id: createId(),
      text: trimmed,
      done: false,
      important: opts.important ?? false,
      date: opts.date,
      listId: opts.listId,
      order: maxOrder + 1000,
    })
  }

  /** 更新待办文本、日期或重要标记；未传入的字段保持不变 */
  function updateTodo(
    todoId: string,
    patch: { text?: string; date?: string; important?: boolean },
  ) {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    if (patch.text !== undefined) todo.text = patch.text.trim()
    if (patch.date !== undefined) todo.date = patch.date
    if (patch.important !== undefined) todo.important = patch.important
  }

  /** 切换待办完成态，完成时播放提示音 */
  function toggleTodo(todoId: string) {
    const todo = todos.value.find((t) => t.id === todoId)
    if (!todo) return
    todo.done = !todo.done
    if (todo.done) playDing()
  }

  /** 删除指定待办，找不到时静默忽略 */
  function removeTodo(todoId: string) {
    const index = todos.value.findIndex((t) => t.id === todoId)
    if (index >= 0) todos.value.splice(index, 1)
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
    setTodoOrder,
    addTodoList,
    renameTodoList,
    removeTodoList,
    setTodoListOrder,
  }
}
