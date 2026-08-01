/** AppLucideIcon 组件测试：验证有效名称与旧 Emoji 均渲染为 SVG。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppLucideIcon from '@/components/common/AppLucideIcon.vue'

describe('AppLucideIcon', () => {
  it.each(['Bot', '🤖', '非法名称'])('把 %s 渲染为可用 SVG', async (name) => {
    const wrapper = mount(AppLucideIcon, { props: { name } })

    await vi.waitFor(() => expect(wrapper.find('svg').exists()).toBe(true))
  })
})
