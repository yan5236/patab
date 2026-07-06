/**
 * launcher store 单元测试
 * 覆盖拖拽移动逻辑（主屏自由摆放 / 入出文件夹 / 入出 Dock / 跨屏）与增删改、持久化，
 * 以及固定网格工具 grid.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEY, useLauncherStore } from '@/stores/launcher'
import {
  COLS,
  ROWS,
  cellFromPoint,
  firstFreeSlot,
  insertionIndex,
  insertionSlotFromGeometry,
  isAreaFree,
  layoutScreen,
  packOrder,
  rowMajorOrder,
  tileAt,
  tileSize,
} from '@/utils/grid'
import type { Folder, Screen, Shortcut, Tile } from '@/types'

/** 构造固定 id 的快捷方式（便于断言） */
function shortcut(id: string): Shortcut {
  return { id, type: 'shortcut', name: id, url: `https://${id}.com`, color: '#38bdf8' }
}

/** 构造待办小组件 */
function widget(id: string): Tile {
  return { id, type: 'widget', widgetType: 'todo' }
}

/** 构造只含给定图块的屏幕 */
function makeScreen(id: string, tiles: Tile[]): Screen {
  return { id, name: id, icon: '🧪', tiles }
}

/** 构造测试用固定布局（已按网格坐标布好）：
 * 屏幕 s1: [a, b, 文件夹 f1(含 c), 待办小组件 w1]
 * 屏幕 s2: [d]
 * Dock:   [e]
 */
function setupFixture() {
  const store = useLauncherStore()
  const f1: Folder = { id: 'f1', type: 'folder', name: '文件夹', children: [shortcut('c')] }
  const s1 = makeScreen('s1', [shortcut('a'), shortcut('b'), f1, widget('w1')])
  const s2 = makeScreen('s2', [shortcut('d')])
  // 与真实初始化一致：为主屏图块补齐坐标
  layoutScreen(s1)
  layoutScreen(s2)
  store.screens = [s1, s2]
  store.dock = [shortcut('e')]
  store.todos = []
  return store
}

/** 读取某屏幕的图块 id 序列 */
function idsOf(store: ReturnType<typeof useLauncherStore>, screenId: string): string[] {
  return store.findScreen(screenId)!.tiles.map((t) => t.id)
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('grid 网格工具', () => {
  it('tileSize：快捷方式/文件夹 1×1，待办小组件 3×2', () => {
    expect(tileSize(shortcut('a'))).toEqual({ w: 1, h: 1 })
    expect(tileSize(widget('w'))).toEqual({ w: 3, h: 2 })
  })

  it('isAreaFree：越界拒绝、重叠拒绝、ignoreId 忽略自身', () => {
    const s = makeScreen('s', [{ ...shortcut('a'), col: 0, row: 0 }])
    expect(isAreaFree(s, 1, 0, 1, 1)).toBe(true)
    // 越界
    expect(isAreaFree(s, COLS, 0, 1, 1)).toBe(false)
    expect(isAreaFree(s, 0, ROWS, 1, 1)).toBe(false)
    expect(isAreaFree(s, 0, ROWS, 1, 1, undefined, { allowOverflow: true })).toBe(true)
    // 与 a 重叠
    expect(isAreaFree(s, 0, 0, 1, 1)).toBe(false)
    // 忽略 a 自身则可放
    expect(isAreaFree(s, 0, 0, 1, 1, 'a')).toBe(true)
  })

  it('isAreaFree：小组件按完整 3×2 占位阻挡', () => {
    const s = makeScreen('s', [{ ...widget('w'), col: 0, row: 0 }])
    expect(isAreaFree(s, 2, 1, 1, 1)).toBe(false) // 落在 3×2 内部
    expect(isAreaFree(s, 3, 0, 1, 1)).toBe(true) // 紧邻右侧空位
  })

  it('firstFreeSlot：空屏 (0,0)、绕开小组件占位、满页 null / overflow 兜底', () => {
    expect(firstFreeSlot(makeScreen('s', []), 1, 1)).toEqual({ col: 0, row: 0 })
    const s = makeScreen('s', [{ ...widget('w'), col: 0, row: 0 }])
    expect(firstFreeSlot(s, 1, 1)).toEqual({ col: 3, row: 0 })
    // 铺满整页
    const full: Tile[] = []
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) full.push({ ...shortcut(`x${r}-${c}`), col: c, row: r })
    const fs = makeScreen('s', full)
    expect(firstFreeSlot(fs, 1, 1)).toBeNull()
    expect(firstFreeSlot(fs, 1, 1, undefined, { allowOverflow: true })).toEqual({
      col: 0,
      row: ROWS,
    })
  })

  it('layoutScreen：旧紧凑数据行主序打包、幂等、溢出不丢块', () => {
    const s = makeScreen('s', [shortcut('a'), shortcut('b'), widget('w'), shortcut('c')])
    layoutScreen(s)
    // 每个图块都有有限坐标且互不重叠
    for (const t of s.tiles) {
      expect(Number.isFinite(t.col)).toBe(true)
      expect(Number.isFinite(t.row)).toBe(true)
    }
    expect(s.tiles.find((t) => t.id === 'a')).toMatchObject({ col: 0, row: 0 })
    // 幂等：二次运行坐标不变
    const snapshot = s.tiles.map((t) => ({ id: t.id, col: t.col, row: t.row }))
    layoutScreen(s)
    expect(s.tiles.map((t) => ({ id: t.id, col: t.col, row: t.row }))).toEqual(snapshot)

    // 溢出：块数超过一屏容量，全部保留且都有坐标
    const many: Tile[] = []
    for (let i = 0; i < COLS * ROWS + 3; i++) many.push(shortcut(`m${i}`))
    const big = makeScreen('big', many)
    layoutScreen(big)
    expect(big.tiles).toHaveLength(COLS * ROWS + 3)
    expect(big.tiles.every((t) => Number.isFinite(t.col) && Number.isFinite(t.row))).toBe(true)
  })
})

describe('grid 紧凑让位工具', () => {
  it('rowMajorOrder：按先行后列排序，未定位排末尾', () => {
    const a = { ...shortcut('a'), col: 2, row: 0 }
    const b = { ...shortcut('b'), col: 0, row: 0 }
    const c = { ...shortcut('c'), col: 1, row: 1 }
    const d = shortcut('d') // 未定位
    const order = rowMajorOrder([a, c, d, b])
    expect(order.map((t) => t.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('packOrder：顺序紧凑打包，小组件占 3×2、后续图标绕开', () => {
    const pos = packOrder([shortcut('a'), widget('w'), shortcut('b')])
    expect(pos.get('a')).toEqual({ col: 0, row: 0 })
    // 小组件 3×2 落在 a 右侧 (1,0)，占 cols1-3 rows0-1
    expect(pos.get('w')).toEqual({ col: 1, row: 0 })
    // b 绕开小组件到 (4,0)
    expect(pos.get('b')).toEqual({ col: 4, row: 0 })
  })

  it('packOrder：不修改入参', () => {
    const a = shortcut('a')
    packOrder([a])
    expect(a.col).toBeUndefined()
    expect(a.row).toBeUndefined()
  })

  it('cellFromPoint：像素坐标换算格坐标并夹紧到界内', () => {
    // 8列×4行，容器 800×400 → 每格 100×100
    const rect = { left: 0, top: 0, width: 800, height: 400 } as DOMRect
    expect(cellFromPoint(rect, 150, 50)).toEqual({ col: 1, row: 0 })
    expect(cellFromPoint(rect, 250, 350)).toEqual({ col: 2, row: 3 })
    // 越界夹紧
    expect(cellFromPoint(rect, 9999, 9999)).toEqual({ col: COLS - 1, row: ROWS - 1 })
    expect(cellFromPoint(rect, -50, -50)).toEqual({ col: 0, row: 0 })
  })

  it('tileAt：按真实布局返回覆盖某格的图块，可忽略指定 id', () => {
    const a = { ...shortcut('a'), col: 0, row: 0 }
    const w = { ...widget('w'), col: 1, row: 0 } // 占 cols1-3 rows0-1
    const tiles = [a, w]
    expect(tileAt(tiles, 0, 0)?.id).toBe('a')
    expect(tileAt(tiles, 2, 1)?.id).toBe('w') // 落在小组件 3×2 内部
    expect(tileAt(tiles, 5, 0)).toBeUndefined() // 空格
    expect(tileAt(tiles, 0, 0, 'a')).toBeUndefined() // 忽略 a 自身
  })

  it('insertionIndex：悬停格的插入下标（首/中/尾）', () => {
    const order = [
      { ...shortcut('a'), col: 0, row: 0 },
      { ...shortcut('b'), col: 1, row: 0 },
      { ...shortcut('c'), col: 2, row: 0 },
    ]
    expect(insertionIndex(order, 0, 0)).toBe(0)
    expect(insertionIndex(order, 1, 0)).toBe(1)
    expect(insertionIndex(order, 2, 0)).toBe(2)
    expect(insertionIndex(order, 5, 0)).toBe(3) // 悬停到空白尾部 → 插到最后
    // after（悬停格右半）：有效悬停秩 +1，插到该格图标「之后」
    expect(insertionIndex(order, 2, 0, false)).toBe(2) // 左半 → c 之前
    expect(insertionIndex(order, 2, 0, true)).toBe(3) // 右半 → c 之后（追加到行尾）
    expect(insertionIndex(order, 0, 0, true)).toBe(1) // 右半 → a 之后
  })

  it('insertionSlotFromGeometry：手机端流式网格按几何算插入槽位（跟手指、无滞后）', () => {
    // 4 列，格距 pitchX=90（格宽 74 + 间隙 16），pitchY=128（行高 112 + 间隙 16）
    // 内容区已扣除 padding，故 relX/relY 直接是相对内容区偏移
    // 第一行（relY < 128）：col = floor(relX/90)，落格右半再进一位
    expect(insertionSlotFromGeometry(10, 10, 90, 128, 4)).toBe(0) // col0 左半
    expect(insertionSlotFromGeometry(130, 10, 90, 128, 4)).toBe(1) // col1 左半
    expect(insertionSlotFromGeometry(220, 10, 90, 128, 4)).toBe(2) // col2 左半 → 不再滞后
    expect(insertionSlotFromGeometry(310, 10, 90, 128, 4)).toBe(3) // col3 左半
    expect(insertionSlotFromGeometry(160, 10, 90, 128, 4)).toBe(2) // col1 右半 → 插到其后
    // 第二行（relY ≥ 128）：row=1 → 槽位 +cols
    expect(insertionSlotFromGeometry(10, 152, 90, 128, 4)).toBe(4) // 第二行 col0
    expect(insertionSlotFromGeometry(130, 152, 90, 128, 4)).toBe(5) // 第二行 col1
    // 越界夹紧：指针在最右/更下，col 夹到 cols-1
    expect(insertionSlotFromGeometry(9999, 10, 90, 128, 4)).toBe(4) // col 夹到 3，右半 → 4
    expect(insertionSlotFromGeometry(-50, 10, 90, 128, 4)).toBe(0) // 左越界 → col0
  })
})

describe('增删改', () => {
  it('addShortcut 可创建到屏幕 / 文件夹 / Dock，且网址自动补全协议；屏幕图标获坐标', () => {
    const store = setupFixture()
    const added = store.addShortcut({ kind: 'screen', screenId: 's2' }, { name: 'X', url: 'x.com' })
    store.addShortcut({ kind: 'folder', folderId: 'f1' }, { name: 'Y', url: 'y.com' })
    store.addShortcut({ kind: 'dock' }, { name: 'Z', url: 'z.com' })

    expect(added.url).toBe('https://x.com')
    expect(Number.isFinite(added.col)).toBe(true)
    expect(Number.isFinite(added.row)).toBe(true)
    expect(store.findFolder('f1')!.children.map((c) => c.name)).toContain('Y')
    expect(store.dock.map((s) => s.name)).toContain('Z')
  })

  it('updateShortcut 能修改文件夹内的快捷方式', () => {
    const store = setupFixture()
    store.updateShortcut('c', { name: '改名', url: 'new.com' })
    const c = store.findShortcut('c')!
    expect(c.name).toBe('改名')
    expect(c.url).toBe('https://new.com')
  })

  it('removeTile 可删除屏幕 / 文件夹内 / Dock 中的图块（留下空位不回填）', () => {
    const store = setupFixture()
    store.removeTile('a')
    store.removeTile('c')
    store.removeTile('e')
    expect(idsOf(store, 's1')).not.toContain('a')
    expect(store.findFolder('f1')!.children).toHaveLength(0)
    expect(store.dock).toHaveLength(0)
  })

  it('addTodoWidget 同一屏幕重复添加时只保留一个待办组件', () => {
    const store = setupFixture()
    store.addTodoWidget('s2')
    store.addTodoWidget('s2')
    const widgets = store.findScreen('s2')!.tiles.filter((t) => t.type === 'widget')
    expect(widgets).toHaveLength(1)
  })
})

describe('拖拽移动 handleDrop', () => {
  it('主屏 slot 落位到空格并记录坐标', () => {
    const store = setupFixture()
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'slot', screenId: 's1', col: 0, row: 1 },
    )
    const a = store.findShortcut('a')!
    expect(a.col).toBe(0)
    expect(a.row).toBe(1)
  })

  it('主屏 slot 落到被占用格：拒绝，图块留在原坐标', () => {
    const store = setupFixture()
    // b 布局在 (1,0)；把 a 拖到 b 上 → 拒绝
    const a = store.findShortcut('a')!
    expect(a.col).toBe(0)
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'slot', screenId: 's1', col: 1, row: 0 },
    )
    expect(a.col).toBe(0)
    expect(a.row).toBe(0)
  })

  it('主屏 slot 小组件按完整占位判定碰撞：重叠则拒绝', () => {
    const store = setupFixture()
    const w1 = store.findScreen('s1')!.tiles.find((t) => t.id === 'w1')!
    const { col, row } = w1
    // w1 移到 (0,0) 会与 a/b/f1 重叠 → 拒绝
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 3 },
      { kind: 'slot', screenId: 's1', col: 0, row: 0 },
    )
    expect(w1.col).toBe(col)
    expect(w1.row).toBe(row)
  })

  it('主屏 slot 边缘小组件坐标夹紧到可完整放下的位置', () => {
    const store = setupFixture()
    const w1 = store.findScreen('s1')!.tiles.find((t) => t.id === 'w1')!
    // 目标列超出右边界 → 夹紧到 COLS-3
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 3 },
      { kind: 'slot', screenId: 's1', col: COLS - 1, row: 0 },
    )
    expect(w1.col).toBe(COLS - 3)
    expect(w1.row).toBe(0)
  })

  it('紧凑 grid 同屏重排：目标格及其后图块级联让位', () => {
    const store = setupFixture()
    // 布局：a(0,0) b(1,0) f1(2,0) w1(3,0 起 3×2)
    // 把 a 插到序列下标 2（b、f1 之后）→ b,f1 前移，a 落 (2,0)
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'grid', screenId: 's1', index: 2 },
    )
    const byId = (id: string) => store.findScreen('s1')!.tiles.find((t) => t.id === id)!
    expect({ col: byId('b').col, row: byId('b').row }).toEqual({ col: 0, row: 0 })
    expect({ col: byId('f1').col, row: byId('f1').row }).toEqual({ col: 1, row: 0 })
    expect({ col: byId('a').col, row: byId('a').row }).toEqual({ col: 2, row: 0 })
    // 小组件仍在其后
    expect({ col: byId('w1').col, row: byId('w1').row }).toEqual({ col: 3, row: 0 })
    expect(idsOf(store, 's1')).toEqual(['b', 'f1', 'a', 'w1'])
  })

  it('紧凑 grid 跨屏移入：按插入下标紧凑落位', () => {
    const store = setupFixture()
    // 把 Dock 的 e 移入 s2（原有 d(0,0)）序列下标 1 → e 落 (1,0)
    store.handleDrop('e', { kind: 'dock', index: 0 }, { kind: 'grid', screenId: 's2', index: 1 })
    expect(store.dock).toHaveLength(0)
    const e = store.findShortcut('e')!
    expect(idsOf(store, 's2')).toContain('e')
    expect({ col: e.col, row: e.row }).toEqual({ col: 1, row: 0 })
    // d 保持 (0,0)
    const d = store.findShortcut('d')!
    expect({ col: d.col, row: d.row }).toEqual({ col: 0, row: 0 })
  })

  it('紧凑 grid 小组件跨屏"每屏一个"限制：目标已有待办则拒绝', () => {
    const store = setupFixture()
    store.addTodoWidget('s2')
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 3 },
      { kind: 'grid', screenId: 's2', index: 0 },
    )
    // w1 仍留在 s1
    expect(store.findScreen('s1')!.tiles.some((t) => t.id === 'w1')).toBe(true)
    expect(store.findScreen('s2')!.tiles.some((t) => t.id === 'w1')).toBe(false)
  })

  it('紧凑模式快捷方式拖入文件夹后：源屏回填空位保持无空隙', () => {
    const store = setupFixture() // placementMode 默认 compact
    // 布局 a(0,0) b(1,0) f1(2,0) w1(3,0)；把 a 放进 f1 → 其余前移补齐
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'folder-tile', folderId: 'f1' },
    )
    const byId = (id: string) => store.findScreen('s1')!.tiles.find((t) => t.id === id)!
    expect(store.findFolder('f1')!.children.map((c) => c.id)).toContain('a')
    // b、f1、w1 各前移一格，无空位
    expect({ col: byId('b').col, row: byId('b').row }).toEqual({ col: 0, row: 0 })
    expect({ col: byId('f1').col, row: byId('f1').row }).toEqual({ col: 1, row: 0 })
    expect({ col: byId('w1').col, row: byId('w1').row }).toEqual({ col: 2, row: 0 })
  })

  it('快捷方式拖入文件夹图块并清除主屏坐标；文件夹自身不能入文件夹', () => {
    const store = setupFixture()
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'folder-tile', folderId: 'f1' },
    )
    expect(store.findFolder('f1')!.children.map((c) => c.id)).toEqual(['c', 'a'])
    expect(idsOf(store, 's1')).not.toContain('a')
    const a = store.findShortcut('a')!
    expect(a.col).toBeUndefined()
    expect(a.row).toBeUndefined()

    // 文件夹拖到文件夹图块上：忽略
    store.handleDrop(
      'f1',
      { kind: 'screen', screenId: 's1', index: 1 },
      { kind: 'folder-tile', folderId: 'f1' },
    )
    expect(idsOf(store, 's1')).toContain('f1')
  })

  it('快捷方式可拖入 Dock 并清除坐标；文件夹 / 小组件不能入 Dock', () => {
    const store = setupFixture()
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'dock', index: 0 },
    )
    expect(store.dock.map((s) => s.id)).toEqual(['a', 'e'])
    const a = store.findShortcut('a')!
    expect(a.col).toBeUndefined()
    expect(a.row).toBeUndefined()

    store.handleDrop(
      'f1',
      { kind: 'screen', screenId: 's1', index: 1 },
      { kind: 'dock', index: 0 },
    )
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 2 },
      { kind: 'dock', index: 0 },
    )
    expect(store.dock.map((s) => s.id)).toEqual(['a', 'e'])
  })

  it('Dock 项可拖回屏幕格位并获得坐标', () => {
    const store = setupFixture()
    store.handleDrop(
      'e',
      { kind: 'dock', index: 0 },
      { kind: 'slot', screenId: 's1', col: 0, row: 1 },
    )
    expect(store.dock).toHaveLength(0)
    const e = store.findShortcut('e')!
    expect(e.col).toBe(0)
    expect(e.row).toBe(1)
    expect(idsOf(store, 's1')).toContain('e')
  })

  it('文件夹内重排（cell）与拖出文件夹到主屏空格（slot 移出并赋坐标）', () => {
    const store = setupFixture()
    store.addShortcut({ kind: 'folder', folderId: 'f1' }, { name: 'g', url: 'g.com' })
    const gId = store.findFolder('f1')!.children[1]!.id

    // 文件夹内重排：g 移到下标 0
    store.handleDrop(
      gId,
      { kind: 'folder', folderId: 'f1', index: 1 },
      { kind: 'cell', zone: 'folder', containerId: 'f1', index: 0 },
    )
    expect(store.findFolder('f1')!.children.map((c) => c.id)).toEqual([gId, 'c'])

    // 拖出文件夹到主屏空格：从文件夹移除并在主屏获得坐标
    store.handleDrop(
      'c',
      { kind: 'folder', folderId: 'f1', index: 1 },
      { kind: 'slot', screenId: 's1', col: 0, row: 1 },
    )
    expect(store.findFolder('f1')!.children.map((c) => c.id)).toEqual([gId])
    const c = store.findShortcut('c')!
    expect(c.col).toBe(0)
    expect(c.row).toBe(1)
  })

  it('folder-outside 兜底：拖出文件夹回到所在屏幕空位', () => {
    const store = setupFixture()
    store.handleDrop(
      'c',
      { kind: 'folder', folderId: 'f1', index: 0 },
      { kind: 'folder-outside' },
    )
    expect(store.findFolder('f1')!.children).toHaveLength(0)
    const c = store.findShortcut('c')!
    expect(idsOf(store, 's1')).toContain('c')
    expect(Number.isFinite(c.col)).toBe(true)
    expect(Number.isFinite(c.row)).toBe(true)
  })

  it('拖到分页指示点：移动到目标屏幕并落位；小组件受"每屏一个"限制', () => {
    const store = setupFixture()
    store.handleDrop(
      'a',
      { kind: 'screen', screenId: 's1', index: 0 },
      { kind: 'pager', screenId: 's2' },
    )
    expect(idsOf(store, 's2')).toEqual(['d', 'a'])
    expect(Number.isFinite(store.findShortcut('a')!.col)).toBe(true)

    // s2 没有待办小组件，可移入
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 1 },
      { kind: 'pager', screenId: 's2' },
    )
    expect(idsOf(store, 's2')).toContain('w1')

    // s2 已有待办小组件，再移入第二个被拒绝
    store.addTodoWidget('s1')
    const w2 = store.findScreen('s1')!.tiles.find((t) => t.type === 'widget')!
    store.handleDrop(
      w2.id,
      { kind: 'screen', screenId: 's1', index: idsOf(store, 's1').indexOf(w2.id) },
      { kind: 'pager', screenId: 's2' },
    )
    expect(idsOf(store, 's1')).toContain(w2.id)
  })

  it('主屏 slot 小组件跨屏"每屏一个"限制：目标已有待办则拒绝', () => {
    const store = setupFixture()
    store.addTodoWidget('s2')
    store.handleDrop(
      'w1',
      { kind: 'screen', screenId: 's1', index: 3 },
      { kind: 'slot', screenId: 's2', col: 0, row: 2 },
    )
    // 仍留在 s1
    expect(store.findScreen('s1')!.tiles.some((t) => t.id === 'w1')).toBe(true)
  })
})

describe('文件夹与屏幕管理', () => {
  it('disbandFolder：子项回到屏幕并获得坐标', () => {
    const store = setupFixture()
    store.disbandFolder('f1')
    expect(idsOf(store, 's1')).toEqual(['a', 'b', 'c', 'w1'])
    const c = store.findShortcut('c')!
    expect(Number.isFinite(c.col)).toBe(true)
    expect(Number.isFinite(c.row)).toBe(true)
  })

  it('removeScreen：内容并入第一个剩余屏幕并重新落位，最后一个屏幕不可删', () => {
    const store = setupFixture()
    store.removeScreen('s2')
    expect(store.screens).toHaveLength(1)
    expect(idsOf(store, 's1')).toContain('d')
    expect(Number.isFinite(store.findShortcut('d')!.col)).toBe(true)

    store.removeScreen('s1')
    expect(store.screens).toHaveLength(1)
  })

  it('removeScreen：并入时丢弃重复的待办小组件', () => {
    const store = setupFixture()
    store.addTodoWidget('s2')
    store.removeScreen('s2')
    const widgets = store.findScreen('s1')!.tiles.filter((t) => t.type === 'widget')
    expect(widgets).toHaveLength(1)
  })

  it('moveToDock：把屏幕上的快捷方式移入 Dock 末尾并清除坐标', () => {
    const store = setupFixture()
    store.moveToDock('a')
    expect(store.dock.map((s) => s.id)).toEqual(['e', 'a'])
    expect(idsOf(store, 's1')).not.toContain('a')
    const a = store.findShortcut('a')!
    expect(a.col).toBeUndefined()
    expect(a.row).toBeUndefined()
  })
})

describe('持久化', () => {
  it('初始化会迁移旧默认壁纸，并补齐自定义壁纸列表', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        screens: [makeScreen('s1', [])],
        dock: [],
        todos: [],
        settings: {
          wallpaper: '/scenery1.png',
          hour12: false,
          searchEngine: 'baidu',
          placementMode: 'compact',
        },
      }),
    )

    const store = useLauncherStore()

    expect(store.settings.wallpaper).toBe('/scenery1.jpg')
    expect(store.settings.customWallpapers).toEqual([])
  })

  it('初始化会清洗自定义壁纸，丢弃空名称或空地址', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        screens: [makeScreen('s1', [])],
        dock: [],
        todos: [],
        settings: {
          wallpaper: '/custom.jpg',
          customWallpapers: [
            { id: 'ok', name: '  我的壁纸  ', src: '  /custom.jpg  ' },
            { id: 'bad-name', name: ' ', src: '/bad.jpg' },
            { id: 'bad-src', name: '坏数据', src: ' ' },
          ],
          hour12: false,
          searchEngine: 'baidu',
          placementMode: 'compact',
        },
      }),
    )

    const store = useLauncherStore()

    expect(store.settings.customWallpapers).toEqual([
      { id: 'ok', name: '我的壁纸', src: '/custom.jpg' },
    ])
  })

  it('初始化会迁移旧搜索设置，缺少搜索引擎列表时补齐默认列表', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        screens: [makeScreen('s1', [])],
        dock: [],
        todos: [],
        settings: {
          wallpaper: '/custom.jpg',
          customWallpapers: [],
          hour12: false,
          searchEngine: 'google',
          placementMode: 'compact',
        },
      }),
    )

    const store = useLauncherStore()

    expect(store.settings.searchEngine).toBe('google')
    expect(store.settings.searchEngines.map((engine) => engine.id)).toContain('metaso')
  })

  it('初始化保留空搜索引擎列表，并清空当前搜索引擎', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        screens: [makeScreen('s1', [])],
        dock: [],
        todos: [],
        settings: {
          wallpaper: '/custom.jpg',
          customWallpapers: [],
          hour12: false,
          searchEngine: 'baidu',
          searchEngines: [],
          placementMode: 'compact',
        },
      }),
    )

    const store = useLauncherStore()

    expect(store.settings.searchEngines).toEqual([])
    expect(store.settings.searchEngine).toBe('')
  })

  it('数据变化后防抖写入 localStorage', async () => {
    vi.useFakeTimers()
    const store = setupFixture()
    store.addTodo('测试待办')
    await vi.advanceTimersByTimeAsync(400)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.todos.some((t: { text: string }) => t.text === '测试待办')).toBe(true)
    vi.useRealTimers()
  })
})
