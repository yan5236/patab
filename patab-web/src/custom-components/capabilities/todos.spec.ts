import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TodoItem, TodoList } from '@/types'
import { createLauncherTodoActions } from '@/stores/launcherTodos'
import {
  createWidgetTodoCapability,
  toWidgetTodo,
  type WidgetTodoPermission,
} from './todos'

/** 创建含 launcher 领域动作的 Capability 测试夹具，确保测试不会以伪造 Store 绕过真实待办写入路径。 */
function createTodoCapabilityFixture(
  initialTodos: readonly TodoItem[] = [],
  initialPermissions: readonly WidgetTodoPermission[] = [],
) {
  const todos = ref<TodoItem[]>([...initialTodos])
  const todoLists = ref<TodoList[]>([])
  const grantedPermissions = new Set<WidgetTodoPermission>(initialPermissions)
  const actions = createLauncherTodoActions({ todos, todoLists })
  const capability = createWidgetTodoCapability(
    {
      getTodos: () => todos.value,
      addTodo: actions.addTodo,
      updateTodo: actions.updateTodo,
      removeTodo: actions.removeTodo,
      subscribeTodoChanges: actions.subscribeTodoChanges,
    },
    { hasPermission: (permission) => grantedPermissions.has(permission) },
  )

  return { capability, grantedPermissions, todos, actions }
}

/** 构造符合宿主最小形状的待办，调用方可覆盖内部字段以验证公开 DTO 隔离。 */
function createTodo(id: string, order: number, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    text: `待办 ${id}`,
    done: false,
    important: false,
    order,
    ...overrides,
  }
}

/** 每个使用假时钟的用例结束后恢复真实计时器，避免去抖订阅影响其他能力测试。 */
afterEach(() => {
  vi.useRealTimers()
})

describe('待办公开 DTO 转换与分页', () => {
  /** 验证转换复制公开字段并丢弃 Pinia 所在列表、排序等内部数据。 */
  it('只返回最小公开 DTO，且不会共享宿主条目引用', () => {
    const todo = createTodo('todo-1', 9000, {
      text: '阅读设计文档',
      done: true,
      date: '2026-08-08',
      important: true,
      listId: 'work',
    })

    const publicTodo = toWidgetTodo(todo)

    expect(publicTodo).toEqual({
      id: 'todo-1',
      text: '阅读设计文档',
      completed: true,
      dueDate: '2026-08-08',
      important: true,
    })
    expect(publicTodo).not.toBe(todo)
    expect(publicTodo).not.toHaveProperty('listId')
    expect(publicTodo).not.toHaveProperty('order')
  })

  /** 验证每页严格最多 100 条、游标只使用公开 ID，且旧脏数据不会穿透公开契约。 */
  it('按公开 ID 游标分页并拒绝超过上限的条数', () => {
    const todos = Array.from({ length: 102 }, (_, index) => createTodo(`todo-${index + 1}`, index * 1000))
    todos.push(createTodo('invalid-date', 200000, { date: '2026-02-30' }))
    const { capability } = createTodoCapabilityFixture(todos, ['todos.read'])

    const firstPage = capability.list({ limit: 100 })
    expect(firstPage).toEqual(expect.objectContaining({ ok: true }))
    if (!firstPage.ok) return
    expect(firstPage.value.items).toHaveLength(100)
    expect(firstPage.value.items[0]).not.toHaveProperty('order')
    expect(firstPage.value.nextCursor).toBe('todo-100')

    const secondPage = capability.list({ cursor: firstPage.value.nextCursor, limit: 100 })
    expect(secondPage).toEqual(expect.objectContaining({ ok: true }))
    if (!secondPage.ok) return
    expect(secondPage.value.items.map((todo) => todo.id)).toEqual(['todo-101', 'todo-102'])
    expect(secondPage.value.nextCursor).toBeUndefined()

    expect(capability.list({ limit: 101 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'limit' },
    })
  })
})

describe('待办读写 Capability', () => {
  /** 验证每个入口分别检查自己的权限，readonly 授权不能写入或删除宿主状态。 */
  it('逐方法执行独立权限校验', () => {
    const { capability, todos } = createTodoCapabilityFixture([createTodo('todo-1', 0)], ['todos.read'])

    expect(capability.list()).toMatchObject({ ok: true })
    expect(capability.create({ text: '禁止创建' })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })
    expect(capability.update({ id: 'todo-1', completed: true })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })
    expect(capability.delete({ id: 'todo-1' })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })
    expect(todos.value).toEqual([createTodo('todo-1', 0)])
  })

  /** 验证写操作统一复用 launcher 动作，并支持完成态更新和显式清除 dueDate。 */
  it('复用 launcher 领域动作完成创建、更新与删除', () => {
    const { capability, todos } = createTodoCapabilityFixture(
      [createTodo('todo-1', 0, { date: '2026-08-09' })],
      ['todos.create', 'todos.update', 'todos.delete'],
    )

    const created = capability.create({ text: '  通过 Capability 创建  ', dueDate: '2026-08-10', important: true })
    expect(created).toMatchObject({
      ok: true,
      value: { text: '通过 Capability 创建', dueDate: '2026-08-10', completed: false, important: true },
    })

    const updated = capability.update({ id: 'todo-1', text: '已更新', completed: true, dueDate: null, important: true })
    expect(updated).toEqual({
      ok: true,
      value: { id: 'todo-1', text: '已更新', completed: true, important: true },
    })
    expect(todos.value.find((todo) => todo.id === 'todo-1')).toMatchObject({
      text: '已更新',
      done: true,
      important: true,
    })
    expect(todos.value.find((todo) => todo.id === 'todo-1')).not.toHaveProperty('date')

    expect(capability.delete({ id: 'todo-1' })).toEqual({ ok: true, value: undefined })
    expect(todos.value.some((todo) => todo.id === 'todo-1')).toBe(false)
  })

  /** 验证非法文本、日期、未知 ID 和内部字段注入均稳定失败且不污染 launcher 状态。 */
  it('拒绝非法 DTO 并保持待办状态一致', () => {
    const original = createTodo('todo-1', 0)
    const { capability, todos } = createTodoCapabilityFixture(
      [original],
      ['todos.create', 'todos.update', 'todos.delete'],
    )

    expect(capability.create({ text: ' ', dueDate: '2026-08-10' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'text' },
    })
    expect(capability.create({ text: '日期错误', dueDate: '2026-02-30' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'dueDate' },
    })
    expect(capability.update({ id: 'missing', text: '不会写入' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'id' },
    })
    expect(capability.update({ id: 'todo-1', text: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'text' },
    })
    expect(capability.delete({ id: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', path: 'id' },
    })
    expect(capability.create({ text: '禁止内部字段', listId: 'private' } as never)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    })
    expect(todos.value).toEqual([original])
  })
})

describe('待办变化事件', () => {
  /** 验证宿主领域动作和获授权 Capability 写入均经过相同去抖通道，事件不含待办正文。 */
  it('向 todos.read 订阅者发送去抖后的最小变化事件', () => {
    vi.useFakeTimers()
    const { capability, actions } = createTodoCapabilityFixture([createTodo('todo-1', 0)], ['todos.read'])
    const received: unknown[] = []
    const subscription = capability.subscribe((event) => received.push(event))
    expect(subscription).toMatchObject({ ok: true })
    if (!subscription.ok) return

    actions.updateTodo('todo-1', { text: '第一次更新' })
    actions.updateTodo('todo-1', { text: '第二次更新' })
    expect(received).toEqual([])
    vi.advanceTimersByTime(100)
    expect(received).toEqual([{ change: 'updated', id: 'todo-1' }])

    subscription.value()
    actions.removeTodo('todo-1')
    vi.advanceTimersByTime(100)
    expect(received).toEqual([{ change: 'updated', id: 'todo-1' }])
  })

  /** 验证运行中撤销 todos.read 后，已建立订阅在定时投递前也不会继续泄露变化事件。 */
  it('在投递前重查 todos.read，以支持授权撤销立即生效', () => {
    vi.useFakeTimers()
    const { capability, grantedPermissions, actions } = createTodoCapabilityFixture(
      [createTodo('todo-1', 0)],
      ['todos.read'],
    )
    const received: unknown[] = []
    const subscription = capability.subscribe((event) => received.push(event))
    expect(subscription).toMatchObject({ ok: true })
    if (!subscription.ok) return

    actions.updateTodo('todo-1', { important: true })
    grantedPermissions.delete('todos.read')
    vi.advanceTimersByTime(100)
    expect(received).toEqual([])
  })
})
