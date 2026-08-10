import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useLauncherStore } from '@/stores/launcher'
import type { Screen } from '@/types'

/**
 * 构造空白主屏，令自定义组件动作可以直接复用真实 launcher store 与网格放置规则。
 */
function createScreen(): Screen {
  return { id: 'screen-1', name: '测试屏幕', icon: 'Bot', tiles: [] }
}

/**
 * 覆盖自定义组件实例在 launcher 中的轻量引用动作，不涉及组件仓库、权限或第三方代码执行。
 */
describe('自定义组件图块动作', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * 验证同一组件的两次添加生成独立实例，且 variant、尺寸与网格位置按照既有规则持久化。
   */
  it('创建多个独立实例并使用现有网格放置规则', () => {
    const store = useLauncherStore()
    store.screens = [createScreen()]

    const first = store.addCustomWidget('screen-1', {
      componentId: 'com.example.weather',
      variantId: 'forecast',
      size: { w: 2, h: 2 },
    })
    const second = store.addCustomWidget('screen-1', {
      componentId: 'com.example.weather',
    })

    expect(first).toMatchObject({
      componentId: 'com.example.weather',
      variantId: 'forecast',
      size: { w: 2, h: 2 },
      col: 0,
      row: 0,
    })
    expect(second?.instanceId).not.toBe(first?.instanceId)
    expect(second).toMatchObject({ col: 2, row: 0 })
  })

  /**
   * 验证开发宿主可以复用会话描述中的固定实例 id，同时拒绝显式传入的空 id。
   */
  it('允许开发宿主指定固定实例 id', () => {
    const store = useLauncherStore()
    store.screens = [createScreen()]

    const widget = store.addCustomWidget('screen-1', {
      componentId: 'com.example.weather',
      instanceId: 'dev-instance-1',
    })

    expect(widget?.instanceId).toBe('dev-instance-1')
    expect(
      store.addCustomWidget('screen-1', {
        componentId: 'com.example.weather',
        instanceId: '   ',
      }),
    ).toBeUndefined()
  })

  /**
   * 验证 variant、尺寸、停用与移除只作用于 custom 引用，非法尺寸与内置图块 id 都被拒绝。
   */
  it('更新引用字段、停用并移除单个自定义实例', () => {
    const store = useLauncherStore()
    store.screens = [createScreen()]
    const widget = store.addCustomWidget('screen-1', { componentId: 'com.example.weather' })!
    store.addTodoWidget('screen-1')

    expect(store.updateCustomWidgetVariant(widget.id, 'today')).toBe(true)
    expect(store.updateCustomWidgetSize(widget.id, { w: 4, h: 2 })).toBe(true)
    expect(store.updateCustomWidgetSize(widget.id, { w: 9, h: 9 })).toBe(false)
    expect(store.setCustomWidgetDisabled(widget.id, true)).toBe(true)
    expect(widget).toMatchObject({ variantId: 'today', size: { w: 4, h: 2 }, disabled: true })
    const todo = store.screens[0]!.tiles.find(
      (tile) => tile.type === 'widget' && tile.widgetType === 'todo',
    )!
    expect(store.setCustomWidgetDisabled(todo.id, true)).toBe(false)

    expect(store.removeCustomWidget(widget.id)).toBe(true)
    expect(store.screens[0]!.tiles).toHaveLength(1)
    expect(store.removeCustomWidget(widget.id)).toBe(false)
  })
})
