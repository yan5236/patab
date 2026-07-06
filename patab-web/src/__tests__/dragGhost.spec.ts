/**
 * DragGhost 单元测试
 * 覆盖待办小组件按抓取偏移定位，同时保留快捷方式幽灵居中显示。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import DragGhost from '@/components/common/DragGhost.vue'
import { useDragStore } from '@/stores/drag'
import type { DragSource, Shortcut, Tile } from '@/types'

/** 构造测试用屏幕来源 */
function screenSource(): DragSource {
  return { kind: 'screen', screenId: 's1', index: 0 }
}

/** 挂载拖拽幽灵并返回 body 中的顶层幽灵节点 */
function mountGhost(tile: Tile, width: number, height: number, offsetX: number, offsetY: number) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const drag = useDragStore()
  drag.start(tile, screenSource(), 200, 160, width, height, offsetX, offsetY)
  const wrapper = mount(DragGhost, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  const ghost = document.body.querySelector<HTMLElement>('.z-\\[70\\]')!
  return { wrapper, ghost }
}

describe('DragGhost', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('待办小组件按来源抓取偏移移动整卡', () => {
    const tile: Tile = { id: 'w1', type: 'widget', widgetType: 'todo' }
    const { wrapper, ghost } = mountGhost(tile, 320, 212, 48, 18)
    const card = ghost.firstElementChild as HTMLElement

    expect(ghost.className).not.toContain('-translate-x-1/2')
    expect(ghost.style.left).toBe('200px')
    expect(ghost.style.top).toBe('160px')
    expect(card.style.width).toBe('320px')
    expect(card.style.height).toBe('212px')
    expect(card.style.transform).toBe('translate(-48px, -18px)')

    wrapper.unmount()
  })

  it('快捷方式继续以指针为中心显示幽灵图标', () => {
    const tile: Shortcut = {
      id: 'a1',
      type: 'shortcut',
      name: 'A',
      url: 'https://example.com',
      color: '#38bdf8',
    }
    const { wrapper, ghost } = mountGhost(tile, 112, 102, 56, 51)

    expect(ghost.className).toContain('-translate-x-1/2')
    expect(ghost.className).toContain('-translate-y-1/2')
    expect(ghost.style.left).toBe('200px')
    expect(ghost.style.top).toBe('160px')

    wrapper.unmount()
  })
})
