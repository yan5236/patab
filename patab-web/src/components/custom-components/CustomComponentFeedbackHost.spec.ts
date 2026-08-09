import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import { getWidgetHostFeedback } from '@/custom-components/capabilities/hostFeedback'
import { i18n } from '@/i18n'

import CustomComponentFeedbackHost from './CustomComponentFeedbackHost.vue'

/** 覆盖阶段 6 宿主反馈层的第三方标识与关闭即取消语义。 */
describe('CustomComponentFeedbackHost', () => {
  /** 验证 toast 和确认均由 PaTab 宿主渲染，ESC 关闭不会默认同意第三方请求。 */
  it('标识第三方来源，并把 ESC 关闭解析为取消', async () => {
    i18n.global.locale.value = 'zh-CN'
    const wrapper = mount(CustomComponentFeedbackHost)
    const feedback = getWidgetHostFeedback()
    expect(feedback).toBeDefined()
    if (!feedback) return

    feedback.toast({ componentId: 'com.example.feedback', message: '已保存设置' })
    await nextTick()
    expect(document.body.textContent).toContain('来自第三方组件')
    expect(document.body.textContent).toContain('已保存设置')

    const confirmation = feedback.confirm({
      kind: 'component',
      componentId: 'com.example.feedback',
      message: '是否继续？',
    })
    await nextTick()
    expect(document.body.textContent).toContain('请求来源：第三方组件 com.example.feedback')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(confirmation).resolves.toBe(false)

    wrapper.unmount()
    expect(getWidgetHostFeedback()).toBeUndefined()
  })
})
