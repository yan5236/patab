/**
 * ScreenViewport 纯净模式交互测试。
 * 覆盖空白处进入与图标双击不误触两条边界。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import ScreenViewport from '@/components/screen/ScreenViewport.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'

/** 挂载主屏容器，并用轻量图块替身控制双击目标 */
function mountViewport() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const ui = useUiStore()
  const wrapper = mount(ScreenViewport, {
    global: {
      plugins: [pinia, i18n],
      stubs: { ScreenGrid: { template: '<button class="screen-tile">图标</button>' } },
    },
  })
  return { launcher, ui, wrapper }
}

describe('ScreenViewport 纯净模式入口', () => {
  beforeEach(() => localStorage.clear())

  it('空白处右键菜单和双击都会进入纯净模式', async () => {
    const { launcher, ui, wrapper } = mountViewport()

    await wrapper.trigger('contextmenu')
    ui.contextMenu?.items.find((item) => item.label === '进入纯净模式')?.action()
    expect(launcher.settings.cleanMode).toBe(true)

    launcher.updateSettings({ cleanMode: false })
    await wrapper.trigger('dblclick')
    expect(launcher.settings.cleanMode).toBe(true)
    wrapper.unmount()
  })

  it('双击图标不会进入纯净模式', async () => {
    const { launcher, wrapper } = mountViewport()

    await wrapper.find('.screen-tile').trigger('dblclick')

    expect(launcher.settings.cleanMode).toBe(false)
    wrapper.unmount()
  })

  it('进入纯净模式的双击不会冒泡到根布局并立即恢复', async () => {
    const onRootDoubleClick = vi.fn()
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount({
      components: { ScreenViewport },
      methods: { onRootDoubleClick },
      template: '<div @dblclick="onRootDoubleClick"><ScreenViewport /></div>',
    }, {
      global: {
        plugins: [pinia, i18n],
        stubs: { ScreenGrid: { template: '<button class="screen-tile">图标</button>' } },
      },
    })

    await wrapper.findComponent(ScreenViewport).trigger('dblclick')

    expect(useLauncherStore().settings.cleanMode).toBe(true)
    expect(onRootDoubleClick).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
