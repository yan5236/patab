/**
 * DockItem 单元测试
 * 覆盖右键菜单动作，防止“移出 Dock”再次传入无效落点。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import DockItem from '@/components/dock/DockItem.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import type { Screen, Shortcut } from '@/types'

/** 构造固定 id 的快捷方式，便于断言 Dock 与屏幕迁移结果 */
function shortcut(id: string): Shortcut {
  return { id, type: 'shortcut', name: id, url: `https://${id}.com`, color: '#38bdf8' }
}

/** 挂载 Dock 图标并返回相关 store，用于直接触发右键菜单动作 */
function mountDockItem(placementMode: 'compact' | 'free') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const ui = useUiStore()
  const screen: Screen = { id: 's1', name: '主屏', icon: '🏠', tiles: [shortcut('a')] }
  const item = shortcut('dock-item')
  launcher.screens = [screen]
  launcher.dock = [item]
  launcher.settings.placementMode = placementMode
  const wrapper = mount(DockItem, {
    props: { item, index: 0 },
    global: { plugins: [pinia] },
  })
  return { launcher, ui, wrapper }
}

describe('DockItem', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('紧凑模式右键移出 Dock 后追加回当前屏幕', async () => {
    const { launcher, ui, wrapper } = mountDockItem('compact')

    await wrapper.find('button').trigger('contextmenu')
    ui.contextMenu?.items[0]?.action()

    expect(launcher.dock).toHaveLength(0)
    expect(launcher.findScreen('s1')!.tiles.map((tile) => tile.id)).toEqual(['a', 'dock-item'])

    wrapper.unmount()
  })

  it('自由模式右键移出 Dock 后自动落到当前屏幕空位', async () => {
    const { launcher, ui, wrapper } = mountDockItem('free')

    await wrapper.find('button').trigger('contextmenu')
    ui.contextMenu?.items[0]?.action()

    const moved = launcher.findShortcut('dock-item')!
    expect(launcher.dock).toHaveLength(0)
    expect(launcher.findScreen('s1')!.tiles.map((tile) => tile.id)).toContain('dock-item')
    expect(Number.isFinite(moved.col)).toBe(true)
    expect(Number.isFinite(moved.row)).toBe(true)

    wrapper.unmount()
  })
})
