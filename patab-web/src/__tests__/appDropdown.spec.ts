/**
 * AppDropdown 单元测试
 * 覆盖通用下拉框打开、选择和点击外部关闭行为。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppDropdown from '@/components/common/AppDropdown.vue'

const OPTIONS = [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]

describe('AppDropdown', () => {
  it('点击选项后更新 v-model 并关闭下拉', async () => {
    const wrapper = mount(AppDropdown, {
      props: {
        modelValue: 'zh-CN',
        options: OPTIONS,
        'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
      },
    })

    await wrapper.find('button').trigger('click')
    await wrapper.findAll('button')[2]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['en-US'])
    expect(wrapper.text()).not.toContain('中文English')
  })

  it('点击外部区域时关闭下拉', async () => {
    const wrapper = mount(AppDropdown, {
      attachTo: document.body,
      props: { modelValue: 'zh-CN', options: OPTIONS },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('English')

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('English')
    wrapper.unmount()
  })
})
