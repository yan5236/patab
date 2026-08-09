import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import ComponentStoreModal from '@/components/modals/ComponentStoreModal.vue'
import { i18n } from '@/i18n'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useLauncherStore } from '@/stores/launcher'

/** 创建通过 Store 审查的最小包，目录卡片测试不重复 ZIP 或图片解码校验。 */
function createReview() {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.catalog',
      version: '1.0.0',
      name: { default: 'Catalog component' },
      description: { default: '可多次添加的第三方组件' },
      developer: { default: 'PaTab test' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    signatureVerification: { status: 'unsigned' as const },
    files: [
      { path: 'surfaces/widget.html', content: '<main>静态内容</main>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 挂载统一商店，并替换无关的内置预览，避免测试触发时钟和待办小组件的交互逻辑。 */
function mountStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const customComponents = useCustomComponentStore()
  const wrapper = mount(ComponentStoreModal, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        BaseModal: { template: '<div><slot /></div>' },
        TodoWidget: true,
        ClockWidget: true,
      },
    },
  })
  return { customComponents, launcher, wrapper }
}

/** 覆盖第三方目录卡片的多实例入口，确认内置商店仍可与安装目录共同渲染。 */
describe('第三方组件商店目录', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
  })

  /** 验证已安装组件卡片每次添加都会生成独立实例引用，而不会覆盖原有实例。 */
  it('从目录重复添加第三方组件时创建独立实例', async () => {
    const { customComponents, launcher, wrapper } = mountStore()
    customComponents.startPackageParsing('catalog.patab.zip')
    customComponents.completePackageReview(createReview())
    await customComponents.installReviewedPackage()
    await wrapper.vm.$nextTick()

    const addButton = wrapper.findAll('button').find((button) => button.text().includes('添加新实例'))
    expect(addButton).toBeDefined()
    await addButton!.trigger('click')
    await addButton!.trigger('click')

    const instances = launcher.screens[0]!.tiles.filter((tile) => tile.type === 'widget' && tile.widgetType === 'custom')
    expect(instances).toHaveLength(2)
    expect(instances[0]!.instanceId).not.toBe(instances[1]!.instanceId)
    wrapper.unmount()
  })
})
