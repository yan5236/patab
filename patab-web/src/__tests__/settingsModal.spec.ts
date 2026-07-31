/**
 * 设置弹窗即时生效测试。
 * 使用子面板替身聚焦弹窗与 launcher store 之间的同步契约。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, setLocale } from '@/i18n'
import SettingsModal from '@/components/modals/SettingsModal.vue'
import { useLauncherStore } from '@/stores/launcher'

/** 挂载设置弹窗，将具体面板替换为可精确触发变更的轻量替身 */
function mountSettingsModal() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const launcher = useLauncherStore()
  const wrapper = mount(SettingsModal, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
        GeneralSettingsPanel: {
          emits: ['update:language', 'update:themeMode'],
          template:
            '<button data-general @click="$emit(\'update:themeMode\', \'dark\'); $emit(\'update:language\', \'en-US\')" />',
        },
        SearchEngineSettingsPanel: {
          emits: ['update:selectedEngine', 'update:engines'],
          template:
            '<button data-search-panel @click="$emit(\'update:engines\', [{ id: \'test\', name: \'Test\', urlTemplate: \'https://example.com/?q={q}\' }]); $emit(\'update:selectedEngine\', \'test\')" />',
        },
        WallpaperSettingsPanel: {
          emits: ['update:wallpaper'],
          template: '<button data-wallpaper-panel @click="$emit(\'update:wallpaper\', \'/scenery2.jpg\')" />',
        },
        AboutSettingsPanel: { template: '<div />' },
      },
    },
  })
  return { launcher, wrapper }
}

describe('设置弹窗即时生效', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocale('zh-CN')
  })

  it('选项变更时立即更新 store 和界面语言，无需点击保存', async () => {
    const { launcher, wrapper } = mountSettingsModal()

    await wrapper.get('[data-general]').trigger('click')

    expect(launcher.settings.themeMode).toBe('dark')
    expect(launcher.settings.language).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')

    await wrapper.findAll('.settings-tabs button')[1]!.trigger('click')
    await wrapper.get('[data-search-panel]').trigger('click')
    expect(launcher.settings.searchEngine).toBe('test')
    expect(launcher.settings.searchEngines).toHaveLength(1)

    await wrapper.findAll('.settings-tabs button')[2]!.trigger('click')
    await wrapper.get('[data-wallpaper-panel]').trigger('click')
    expect(launcher.settings.wallpaper).toBe('/scenery2.jpg')

    expect(wrapper.text()).not.toContain('Save')
    expect(wrapper.text()).toContain('Close')
    wrapper.unmount()
  })
})
