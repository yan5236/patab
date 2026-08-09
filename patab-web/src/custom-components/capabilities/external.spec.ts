import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserWidgetExternalAdapter } from './external'

/** 每个外链适配器测试结束后恢复浏览器模拟，避免 window.open 影响其它 UI 用例。 */
afterEach(() => {
  vi.restoreAllMocks()
})

/** 覆盖宿主实际打开外链时的 noopener/noreferrer 隔离属性。 */
describe('createBrowserWidgetExternalAdapter', () => {
  /** 验证即使调用方可通过 Broker，也只能获得新标签、无 opener、无 referrer 的外链副作用。 */
  it('以 noopener 和 noreferrer 在新标签页打开 HTTPS 目标', () => {
    const openedWindow = { opener: {} }
    const open = vi.spyOn(window, 'open').mockReturnValue(openedWindow as unknown as WindowProxy)
    const adapter = createBrowserWidgetExternalAdapter()

    expect(adapter.open(new URL('https://example.com/path?source=widget'))).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/path?source=widget', '_blank', 'noopener,noreferrer')
    expect(openedWindow.opener).toBeNull()
  })
})
