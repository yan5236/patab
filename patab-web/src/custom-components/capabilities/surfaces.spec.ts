import { describe, expect, it, vi } from 'vitest'

import { WidgetBrokerMethodError, type WidgetBrokerSession } from '@/custom-components/runtime/capabilityBroker'
import { createWidgetSurfaceBrokerMethods } from './surfaces'

/** 创建不依赖 iframe 的固定 session，专注验证 Broker 到宿主 surface 的安全分流。 */
function createSession(): WidgetBrokerSession {
  return {
    componentId: 'com.example.surface',
    componentVersion: '1.0.0',
    instanceId: 'instance-1',
    sessionId: 'session-1',
  }
}

/** 覆盖 declared surface、单 modal 上限与原生 variant picker 的稳定错误边界。 */
describe('自定义组件 surface capability', () => {
  /** 验证 detail 只能在 Manifest 已声明时打开，且参数不能指定迁移等内部 surface。 */
  it('只允许已声明的 detail/settings surface', () => {
    const host = {
      openSurface: vi.fn(() => true),
      closeSurface: vi.fn(() => true),
      openVariantPicker: vi.fn(() => true),
    }
    const methods = createWidgetSurfaceBrokerMethods(createSession(), new Set(['widget', 'detail']), 2, host)
    const openSurface = methods['ui.openSurface']!

    expect(openSurface.validateParams?.({ surface: 'migration' })).toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(openSurface.invoke({ surface: 'detail' }, createSession())).toEqual({ opened: true })
    expect(host.openSurface).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'instance-1' }), 'detail')
    try {
      openSurface.invoke({ surface: 'settings' }, createSession())
      throw new Error('预期未声明 surface 被拒绝。')
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetBrokerMethodError)
      expect((error as WidgetBrokerMethodError).error.code).toBe('SURFACE_NOT_DECLARED')
    }
  })

  /** 验证 host 拒绝嵌套 modal 时 Broker 返回稳定 SURFACE_LIMIT_REACHED，且 close 不可跨实例。 */
  it('复用唯一 host modal 并限制同实例嵌套', () => {
    const host = {
      openSurface: vi.fn(() => false),
      closeSurface: vi.fn(() => false),
      openVariantPicker: vi.fn(() => false),
    }
    const methods = createWidgetSurfaceBrokerMethods(createSession(), new Set(['widget', 'settings']), 2, host)
    const openSurface = methods['ui.openSurface']!
    const openVariantPicker = methods['ui.openVariantPicker']!
    const closeSurface = methods['ui.closeSurface']!

    try {
      openSurface.invoke({ surface: 'settings' }, createSession())
      throw new Error('预期打开嵌套 modal 被拒绝。')
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetBrokerMethodError)
      expect((error as WidgetBrokerMethodError).error.code).toBe('SURFACE_LIMIT_REACHED')
    }
    try {
      openVariantPicker.invoke({}, createSession())
      throw new Error('预期打开嵌套类型选择器被拒绝。')
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetBrokerMethodError)
      expect((error as WidgetBrokerMethodError).error.code).toBe('SURFACE_LIMIT_REACHED')
    }
    expect(closeSurface.invoke({}, createSession())).toEqual({ closed: false })
  })
})
