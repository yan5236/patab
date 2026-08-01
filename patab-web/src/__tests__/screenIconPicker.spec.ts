/** ScreenIconPicker 组件测试：验证完整目录可搜索并返回所选图标名。 */
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import ScreenIconPicker from '@/components/modals/ScreenIconPicker.vue'

const i18n = createI18n({
  legacy: false,
  messages: {
    'zh-CN': {
      common: { close: '关闭' },
      modals: {
        screen: {
          iconsTitle: '选择屏幕图标',
          iconSource: '图标来源于：',
          iconSearchPlaceholder: '搜索图标',
          iconEmpty: '没有找到图标',
        },
      },
    },
  },
  locale: 'zh-CN',
})

describe('ScreenIconPicker', () => {
  it('搜索并返回选择的 Lucide 图标名', async () => {
    const wrapper = mount(ScreenIconPicker, {
      props: { modelValue: 'Bot' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.findAll('button[title]')).toHaveLength(80)
    await wrapper.get('input[type="search"]').setValue('book open')
    await wrapper.get('button[title="BookOpen"]').trigger('click')

    const sourceLink = wrapper.get('a[href="https://github.com/lucide-icons/lucide"]')
    expect(sourceLink.attributes('target')).toBe('_blank')
    expect(sourceLink.attributes('rel')).toContain('noopener')
    expect(wrapper.emitted('select')).toEqual([['BookOpen']])
  })
})
