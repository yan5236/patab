/**
 * useLongPressDrag 单元测试
 * 重点覆盖触摸长按触发业务菜单的链路：
 * - 第一次长按就应派发 contextmenu 并被组件 handler 收到
 * - 浏览器随后补发的原生 contextmenu 应被屏蔽
 * - 抬手时落在原图块上的 click 应被吞掉，避免误触发打开网址
 * - 落在菜单/空白处的 click 不应被吞，避免菜单项需要点两次
 * - 拖拽中靠近可滚动容器边缘时自动滚动
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLongPressDrag } from '@/composables/useLongPressDrag'
import type { Tile } from '@/types'

type FrameRequestCallback = (time: number) => void

const dummyTile: Tile = {
  id: 'tile-1',
  type: 'shortcut',
  name: 'Test',
  url: 'https://example.com',
  color: '#38bdf8',
  col: 0,
  row: 0,
}

const dummyPayload = () => ({
  tile: dummyTile,
  source: { kind: 'screen' as const, screenId: 's1', index: 0 },
})

function touchPointerDown(el: HTMLElement, x = 10, y = 10) {
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerType: 'touch',
      button: 0,
      bubbles: true,
      clientX: x,
      clientY: y,
    }),
  )
}

function touchPointerUp(el: HTMLElement, x = 10, y = 10) {
  el.dispatchEvent(
    new PointerEvent('pointerup', {
      pointerType: 'touch',
      button: 0,
      bubbles: true,
      clientX: x,
      clientY: y,
    }),
  )
}

describe('useLongPressDrag 触摸长按菜单', () => {
  let originalWarn: typeof console.warn

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? '')
      if (msg.includes('onBeforeUnmount is called when there is no active component instance')) return
      originalWarn(...args)
    }
  })

  afterEach(() => {
    console.warn = originalWarn
  })

  it('触摸长按会立即触发目标元素上的 contextmenu 事件', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)

    const { onPointerdown } = useLongPressDrag(dummyPayload)
    el.addEventListener('pointerdown', onPointerdown)

    const contextmenuSpy = vi.fn()
    el.addEventListener('contextmenu', contextmenuSpy)

    touchPointerDown(el)
    vi.advanceTimersByTime(310)

    expect(contextmenuSpy).toHaveBeenCalledTimes(1)

    touchPointerUp(el)
    vi.advanceTimersByTime(700)
    el.remove()
  })

  it('触摸长按后浏览器补发的原生 contextmenu 被屏蔽', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)

    const { onPointerdown } = useLongPressDrag(dummyPayload)
    el.addEventListener('pointerdown', onPointerdown)

    const contextmenuSpy = vi.fn()
    el.addEventListener('contextmenu', contextmenuSpy)

    touchPointerDown(el)
    vi.advanceTimersByTime(310)
    expect(contextmenuSpy).toHaveBeenCalledTimes(1)

    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    )

    expect(contextmenuSpy).toHaveBeenCalledTimes(1)

    touchPointerUp(el)
    vi.advanceTimersByTime(700)
    el.remove()
  })

  it('触摸长按后落在原图块上的 click 被吞掉，避免误触发打开', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)

    const { onPointerdown } = useLongPressDrag(dummyPayload)
    el.addEventListener('pointerdown', onPointerdown)

    el.addEventListener('contextmenu', (e) => {
      // 模拟业务 handler 阻止默认并停止传播
      e.preventDefault()
      e.stopPropagation()
    })

    touchPointerDown(el)
    vi.advanceTimersByTime(310)
    touchPointerUp(el)

    const clickSpy = vi.fn()
    el.addEventListener('click', clickSpy)
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    el.dispatchEvent(clickEvent)

    expect(clickSpy).not.toHaveBeenCalled()
    expect(clickEvent.defaultPrevented).toBe(true)

    vi.advanceTimersByTime(700)
    el.remove()
  })

  it('触摸长按后落在菜单/空白处的 click 不被吞掉', () => {
    const el = document.createElement('button')
    const outside = document.createElement('div')
    document.body.appendChild(el)
    document.body.appendChild(outside)

    const { onPointerdown } = useLongPressDrag(dummyPayload)
    el.addEventListener('pointerdown', onPointerdown)

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })

    touchPointerDown(el)
    vi.advanceTimersByTime(310)
    touchPointerUp(el)

    const outsideClickSpy = vi.fn()
    outside.addEventListener('click', outsideClickSpy)
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    outside.dispatchEvent(clickEvent)

    expect(outsideClickSpy).toHaveBeenCalledTimes(1)
    expect(clickEvent.defaultPrevented).toBe(false)

    vi.advanceTimersByTime(700)
    el.remove()
    outside.remove()
  })
})

describe('useLongPressDrag 自动滚动', () => {
  let originalWarn: typeof console.warn
  let originalElementFromPoint: typeof document.elementFromPoint

  beforeEach(() => {
    originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? '')
      if (msg.includes('onBeforeUnmount is called when there is no active component instance')) return
      originalWarn(...args)
    }
  })

  afterEach(() => {
    console.warn = originalWarn
    document.body.innerHTML = ''
    document.elementFromPoint = originalElementFromPoint
    vi.restoreAllMocks()
  })

  function setupAutoScroll() {
    setActivePinia(createPinia())
    vi.useFakeTimers()

    const container = document.createElement('div')
    container.className = 'screen-grid'
    container.style.height = '200px'
    container.style.width = '200px'
    container.style.overflowY = 'auto'
    document.body.appendChild(container)

    const el = document.createElement('button')
    el.style.height = '40px'
    container.appendChild(el)

    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true })
    let scrollTop = 300
    Object.defineProperty(container, 'scrollTop', {
      get() {
        return scrollTop
      },
      set(v) {
        scrollTop = v
      },
      configurable: true,
    })
    container.getBoundingClientRect = () =>
      ({ top: 0, left: 0, bottom: 200, right: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => {} }) as DOMRect

    const { onPointerdown } = useLongPressDrag(dummyPayload)
    el.addEventListener('pointerdown', onPointerdown)

    // jsdom 未实现 elementFromPoint，按坐标简单命中容器内元素
    originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = (x: number, y: number) => {
      const rect = container.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return el
      }
      return null
    }

    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as FrameRequestCallback)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    let perfNow = 0
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow)

    function triggerRaf() {
      perfNow += 16
      const callbacks = [...rafCallbacks]
      rafCallbacks.length = 0
      callbacks.forEach((cb) => cb(perfNow))
    }

    return { container, el, triggerRaf }
  }

  function enterDrag(el: HTMLElement) {
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    )
    vi.advanceTimersByTime(310)
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 40,
      }),
    )
  }

  it('拖拽中指针靠近容器顶部边缘时自动向上滚动', () => {
    const { container, el, triggerRaf } = setupAutoScroll()
    enterDrag(el)

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    )
    expect(container.scrollTop).toBe(300)

    triggerRaf()
    expect(container.scrollTop).toBeLessThan(300)

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    )
  })

  it('拖拽中指针靠近容器底部边缘时自动向下滚动', () => {
    const { container, el, triggerRaf } = setupAutoScroll()
    enterDrag(el)

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 190,
      }),
    )
    expect(container.scrollTop).toBe(300)

    triggerRaf()
    expect(container.scrollTop).toBeGreaterThan(300)

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 190,
      }),
    )
  })

  it('拖拽结束后自动滚动停止', () => {
    const { container, el, triggerRaf } = setupAutoScroll()
    enterDrag(el)

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    )
    triggerRaf()
    const scrollTopAfterAutoScroll = container.scrollTop

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    )
    triggerRaf()
    triggerRaf()

    expect(container.scrollTop).toBe(scrollTopAfterAutoScroll)
  })
})
