import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CustomWidgetHost from './CustomWidgetHost.vue'
import { i18n } from '@/i18n'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { useCustomComponentStore } from '@/stores/customComponents'
import type { CustomWidgetTile } from '@/types'

const { start, subscribeRuntimeAutoDisabled } = vi.hoisted(() => ({
  start: vi.fn(),
  subscribeRuntimeAutoDisabled: vi.fn(() => () => undefined),
}))

vi.mock('@/custom-components/runtime/runtimeHost', () => ({
  getCustomComponentRuntime: () => ({ start }),
  subscribeRuntimeAutoDisabled,
}))

/** 创建通过 Store 安装的最小已验证组件，避免 Host 测试绕开实际目录与 Manifest 边界。 */
function createReview() {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.icon-only',
      version: '1.0.0',
      name: { default: 'Icon-only widget' },
      description: { default: '1×1 不执行第三方代码' },
      developer: { default: 'PaTab test' },
      surfaces: {
        widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } },
        detail: { entry: 'surfaces/detail.html' as const, title: { default: 'Detail' }, modalSize: 'small' as const },
      },
      sizes: [{ w: 1 as const, h: 1 as const }, { w: 2 as const, h: 2 as const }],
      defaultSize: { w: 1 as const, h: 1 as const },
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    signatureVerification: { status: 'unsigned' as const },
    files: [
      { path: 'surfaces/widget.html', content: '<main>不应在 1×1 执行</main>' },
      { path: 'surfaces/detail.html', content: '<main>detail</main>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 创建 1×1 自定义图块；其 Runtime 必须保持完全未启动。 */
function createIconTile(): CustomWidgetTile {
  return {
    id: 'tile-icon-only',
    type: 'widget',
    widgetType: 'custom',
    componentId: 'com.example.icon-only',
    instanceId: 'instance-icon-only',
    size: { w: 1, h: 1 },
  }
}

/** 覆盖主屏最小图标形态，确保安全优化不会因目录异步加载而触发 sandbox。 */
describe('CustomWidgetHost', () => {
  beforeEach(() => {
    start.mockReset()
    subscribeRuntimeAutoDisabled.mockClear()
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
    setActivePinia(createPinia())
  })

  /** 验证 1×1 只渲染宿主图标与标题，活动包和 widget HTML 均不能启动 Runtime。 */
  it('1×1 图标图块零执行第三方 Runtime', async () => {
    const customComponents = useCustomComponentStore()
    customComponents.startPackageParsing('icon-only.patab.zip')
    customComponents.completePackageReview(createReview())
    await customComponents.installReviewedPackage()

    const wrapper = mount(CustomWidgetHost, {
      props: { tile: createIconTile() },
      global: {
        plugins: [i18n],
        stubs: {
          WidgetShell: { template: '<section><slot /><slot name="actions" /></section>' },
          CustomWidgetPlaceholder: true,
        },
      },
    })
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(wrapper.text()).toContain('Icon-only widget')
    expect(wrapper.find('button').exists()).toBe(true)
    expect(start).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  /** 验证全局安全模式在宿主创建 iframe 前拦截大尺寸组件，保留 PaTab 主屏外壳。 */
  it('安全模式下大尺寸图块也零执行第三方 Runtime', async () => {
    const customComponents = useCustomComponentStore()
    customComponents.startPackageParsing('safe-mode.patab.zip')
    customComponents.completePackageReview(createReview())
    await customComponents.installReviewedPackage()
    const safety = useCustomComponentSafetyStore()
    safety.state = {
      bootPending: false,
      consecutiveIncompleteBoots: 3,
      globalSafeMode: true,
    }
    const wrapper = mount(CustomWidgetHost, {
      props: {
        tile: { ...createIconTile(), id: 'tile-safe-mode', size: { w: 2, h: 2 } },
      },
      global: {
        plugins: [i18n],
        stubs: {
          WidgetShell: { template: '<section><slot /><slot name="actions" /></section>' },
          CustomWidgetPlaceholder: true,
        },
      },
    })
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(start).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(true)
    wrapper.unmount()
  })
})
