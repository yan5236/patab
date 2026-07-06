/**
 * drag store 单元测试
 * 覆盖拖拽会话状态中幽灵图块定位所需的来源尺寸与抓取偏移。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDragStore } from '@/stores/drag'
import type { DragSource, Tile } from '@/types'

/** 构造测试用待办小组件图块 */
function widget(id: string): Tile {
  return { id, type: 'widget', widgetType: 'todo' }
}

/** 构造测试用屏幕来源 */
function screenSource(): DragSource {
  return { kind: 'screen', screenId: 's1', index: 0 }
}

describe('drag store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('start / end 保存并清理幽灵图块来源尺寸与抓取偏移', () => {
    const store = useDragStore()
    const tile = widget('w1')

    store.start(tile, screenSource(), 200, 160, 320, 212, 48, 18)

    expect(store.tile).toBe(tile)
    expect(store.pointerX).toBe(200)
    expect(store.pointerY).toBe(160)
    expect(store.sourceWidth).toBe(320)
    expect(store.sourceHeight).toBe(212)
    expect(store.sourceOffsetX).toBe(48)
    expect(store.sourceOffsetY).toBe(18)

    store.end()

    expect(store.tile).toBeNull()
    expect(store.sourceWidth).toBe(0)
    expect(store.sourceHeight).toBe(0)
    expect(store.sourceOffsetX).toBe(0)
    expect(store.sourceOffsetY).toBe(0)
  })

  it('start 未传抓取偏移时用来源尺寸中心兜底', () => {
    const store = useDragStore()

    store.start(widget('w1'), screenSource(), 200, 160, 320, 212)

    expect(store.sourceOffsetX).toBe(160)
    expect(store.sourceOffsetY).toBe(106)
  })
})
