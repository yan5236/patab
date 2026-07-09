/**
 * todos 单元测试
 * 覆盖待办数据迁移、CRUD、重要标记、列表管理、排序与持久化。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEY, useLauncherStore } from '@/stores/launcher'
import type { LauncherState } from '@/types'

/** 构造最小可用 LauncherState */
function makeState(overrides: Partial<LauncherState> = {}): LauncherState {
  return {
    version: 1,
    screens: [],
    dock: [],
    todos: [],
    todoLists: [
      { id: 'all', name: '所有', order: 0, system: 'all' },
      { id: 'today', name: '今天', order: 1, system: 'today' },
      { id: 'important', name: '重要', order: 2, system: 'important' },
    ],
    settings: {
      language: 'zh-CN',
      themeMode: 'system',
      wallpaper: '/scenery1.jpg',
      customWallpapers: [],
      hour12: false,
      showDate: true,
      searchEngine: 'baidu',
      searchEngines: [],
      placementMode: 'compact',
    },
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('待办迁移', () => {
  it('旧 todos 缺少新字段时补齐 important 与 order', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        makeState({
          todos: [
            { id: 't1', text: '旧待办1', done: false } as never,
            { id: 't2', text: '旧待办2', done: true } as never,
          ],
        }),
      ),
    )

    const store = useLauncherStore()

    expect(store.todos).toHaveLength(2)
    expect(store.todos[0]).toMatchObject({ id: 't1', important: false, order: 0 })
    expect(store.todos[1]).toMatchObject({ id: 't2', important: false, order: 1000 })
  })

  it('todoLists 缺失时创建默认智能列表', () => {
    const state = makeState()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (state as any).todoLists
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    const store = useLauncherStore()

    expect(store.todoLists).toHaveLength(3)
    expect(store.todoLists.map((l) => l.id)).toEqual(['all', 'today', 'important'])
  })
})

describe('待办 CRUD', () => {
  it('addTodo 创建 todo 并分配递增 order', () => {
    const store = useLauncherStore()
    store.todos = []
    store.todoLists = makeState().todoLists

    store.addTodo('买牛奶')
    store.addTodo('写代码', { important: true, date: '2026-07-06' })

    expect(store.todos).toHaveLength(2)
    expect(store.todos[0]!.text).toBe('买牛奶')
    expect(store.todos[0]!.order).toBe(1000)
    expect(store.todos[1]!).toMatchObject({ text: '写代码', important: true, date: '2026-07-06', order: 2000 })
  })

  it('updateTodo 可修改文本、日期与重要状态', () => {
    const store = useLauncherStore()
    store.todos = [
      { id: 't1', text: '原内容', done: false, important: false, order: 0 },
    ]

    store.updateTodo('t1', { text: '新内容', date: '2026-07-07', important: true })

    expect(store.todos[0]).toMatchObject({ text: '新内容', date: '2026-07-07', important: true })
  })

  it('toggleTodo 切换完成态，完成时播放音效', () => {
    const createOscillator = vi.fn(() => ({
      type: '',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }))
    const createGain = vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }))
    const close = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).AudioContext = vi.fn(function () {
      return {
        currentTime: 0,
        createOscillator,
        createGain,
        destination: {},
        close,
      }
    })

    const store = useLauncherStore()
    store.todos = [
      { id: 't1', text: '待办', done: false, important: false, order: 0 },
    ]

    store.toggleTodo('t1')
    expect(store.todos[0]!.done).toBe(true)
    expect(window.AudioContext).toHaveBeenCalled()

    delete (window as unknown as { AudioContext?: unknown }).AudioContext
  })

  it('removeTodo 删除指定 todo', () => {
    const store = useLauncherStore()
    store.todos = [
      { id: 't1', text: 'A', done: false, important: false, order: 0 },
      { id: 't2', text: 'B', done: false, important: false, order: 1000 },
    ]

    store.removeTodo('t1')

    expect(store.todos).toHaveLength(1)
    expect(store.todos[0]!.id).toBe('t2')
  })
})

describe('待办排序', () => {
  it('setTodoOrder 按传入 id 顺序重写 order', () => {
    const store = useLauncherStore()
    store.todos = [
      { id: 't1', text: 'A', done: false, important: false, order: 0 },
      { id: 't2', text: 'B', done: false, important: false, order: 1000 },
      { id: 't3', text: 'C', done: false, important: false, order: 2000 },
    ]

    store.setTodoOrder(['t3', 't1', 't2'])

    const byId = (id: string) => store.todos.find((t) => t.id === id)!
    expect(byId('t3').order).toBe(0)
    expect(byId('t1').order).toBe(1000)
    expect(byId('t2').order).toBe(2000)
  })
})

describe('待办列表管理', () => {
  it('addTodoList 创建自定义列表', () => {
    const store = useLauncherStore()
    store.todoLists = makeState().todoLists

    store.addTodoList('工作')

    const custom = store.todoLists.find((l) => l.name === '工作')
    expect(custom).toBeDefined()
    expect(custom!.system).toBeUndefined()
  })

  it('renameTodoList 可重命名自定义列表', () => {
    const store = useLauncherStore()
    store.todoLists = [...makeState().todoLists, { id: 'custom', name: '工作', order: 3000 }]

    store.renameTodoList('custom', '生活')

    expect(store.todoLists.find((l) => l.id === 'custom')!.name).toBe('生活')
  })

  it('removeTodoList 删除自定义列表并将其 todo 置为未分配', () => {
    const store = useLauncherStore()
    store.todoLists = [...makeState().todoLists, { id: 'custom', name: '工作', order: 3000 }]
    store.todos = [
      { id: 't1', text: 'A', done: false, important: false, order: 0, listId: 'custom' },
      { id: 't2', text: 'B', done: false, important: false, order: 1000 },
    ]

    store.removeTodoList('custom')

    expect(store.todoLists.some((l) => l.id === 'custom')).toBe(false)
    expect(store.todos.find((t) => t.id === 't1')!.listId).toBeUndefined()
  })

  it('removeTodoList 不能删除系统智能列表', () => {
    const store = useLauncherStore()
    store.todoLists = makeState().todoLists

    store.removeTodoList('all')

    expect(store.todoLists.some((l) => l.id === 'all')).toBe(true)
  })

  it('setTodoListOrder 按传入 id 顺序重写 order', () => {
    const store = useLauncherStore()
    store.todoLists = makeState().todoLists

    store.setTodoListOrder(['important', 'today', 'all'])

    const byId = (id: string) => store.todoLists.find((l) => l.id === id)!
    expect(byId('important').order).toBe(0)
    expect(byId('today').order).toBe(1000)
    expect(byId('all').order).toBe(2000)
  })
})

describe('持久化', () => {
  it('todoLists 变更后写入 localStorage', async () => {
    vi.useFakeTimers()
    const store = useLauncherStore()
    store.todoLists = makeState().todoLists
    store.addTodoList('测试')
    await vi.advanceTimersByTimeAsync(400)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.todoLists.some((l: { name: string }) => l.name === '测试')).toBe(true)
    vi.useRealTimers()
  })
})
