/**
 * App 纯净模式恢复测试。
 * 使用界面替身聚焦根布局的恢复入口，不重复覆盖子组件行为。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import App from '@/App.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'

/** 挂载根布局，并替换无关的全局层与业务组件 */
function mountApp() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const ui = useUiStore()
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        ClockDisplay: { template: '<div data-clock />' },
        SearchBar: { template: '<input data-search />' },
        ScreenViewport: { template: '<div data-screen />' },
        ScreenPager: { template: '<div data-pager />' },
        DockBar: { template: '<div data-dock />' },
        FolderView: true,
        ContextMenu: true,
        DragGhost: true,
        ShortcutEditModal: true,
        ScreenEditModal: true,
        SettingsModal: true,
        ComponentStoreModal: true,
        TodoModal: true,
      },
    },
  })
  return { launcher, ui, wrapper }
}

describe('App 纯净模式恢复', () => {
  beforeEach(() => localStorage.clear())

  it('保留时钟和搜索栏，并可通过菜单或空白双击恢复应用', async () => {
    const { launcher, ui, wrapper } = mountApp()
    launcher.updateSettings({ cleanMode: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-clock]').exists()).toBe(true)
    expect(wrapper.find('[data-search]').exists()).toBe(true)
    expect(wrapper.find('[data-screen]').exists()).toBe(false)

    await wrapper.trigger('contextmenu')
    ui.contextMenu?.items.find((item) => item.label === '显示应用')?.action()
    expect(launcher.settings.cleanMode).toBe(false)

    launcher.updateSettings({ cleanMode: true })
    await wrapper.trigger('dblclick')
    expect(launcher.settings.cleanMode).toBe(false)
    wrapper.unmount()
  })
})
