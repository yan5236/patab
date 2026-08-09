import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { i18n } from '@/i18n'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import CustomWidgetPlaceholder from './CustomWidgetPlaceholder.vue'

/** 使用真实 launcher custom 引用挂载占位图块，确保测试覆盖既有轻量状态动作而非孤立对象副本。 */
function mountPlaceholder(disabled = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const ui = useUiStore()
  const customComponents = useCustomComponentStore()
  const screen = launcher.screens[0]!
  const tile = launcher.addCustomWidget(screen.id, { componentId: 'com.example.missing', size: { w: 2, h: 2 } })!
  launcher.setCustomWidgetDisabled(tile.id, disabled)
  const wrapper = mount(CustomWidgetPlaceholder, { props: { tile }, global: { plugins: [pinia, i18n] } })
  return { customComponents, launcher, tile, ui, wrapper }
}

/** 覆盖缺包与停用占位的恢复入口，确认图块不会退回 TodoWidget 或启动第三方代码。 */
describe('自定义组件不可用占位图块', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
  })

  /** 验证缺包引用保持原状，并可从占位图块回到组件商店重新导入。 */
  it('为缺失组件提供重新导入入口而不删除引用', async () => {
    const { customComponents, launcher, tile, ui, wrapper } = mountPlaceholder()
    await customComponents.ensureInstalledComponentsLoaded()
    await flushPromises()

    expect(customComponents.installedComponentsLoaded).toBe(true)
    expect(wrapper.text()).toContain('组件包不可用')
    await wrapper.get('button').trigger('click')
    expect(ui.modal).toEqual({ type: 'component-store' })
    expect(launcher.findContainerOf(tile.id)).toBeDefined()
    wrapper.unmount()
  })

  /** 验证停用实例只在用户明确点击后恢复，并可查看不包含内部诊断载荷的宿主级原因。 */
  it('显示停用原因并允许重新启用实例', async () => {
    const { customComponents, launcher, tile, wrapper } = mountPlaceholder(true)
    await flushPromises()
    vi.spyOn(customComponents, 'resetInstanceRuntimeHealth').mockResolvedValue(true)

    const viewReason = wrapper.findAll('button').find((button) => button.text().includes('查看原因'))
    await viewReason!.trigger('click')
    expect(wrapper.text()).toContain('停用原因')
    const reenable = wrapper.findAll('button').find((button) => button.text().includes('重新启用'))
    await reenable!.trigger('click')
    await flushPromises()
    expect(launcher.findContainerOf(tile.id)?.find((item) => item.id === tile.id)).toMatchObject({ disabled: false })
    wrapper.unmount()
  })
})
