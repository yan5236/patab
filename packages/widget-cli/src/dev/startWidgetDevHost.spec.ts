import { describe, expect, it } from 'vitest'

import { normalizeWidgetDevHost } from './startWidgetDevHost.js'

describe('开发宿主监听地址', () => {
  /** 验证默认和三种明确 loopback 表达保持可用。 */
  it.each([
    [undefined, '127.0.0.1'],
    ['127.0.0.1', '127.0.0.1'],
    ['LOCALHOST', 'localhost'],
    ['::1', '::1'],
  ])('规范化本机地址 %s', (input, expected) => {
    expect(normalizeWidgetDevHost(input)).toBe(expected)
  })

  /** 验证通配、局域网、公网和伪 loopback 文本全部被拒绝。 */
  it.each(['0.0.0.0', '192.168.1.10', '8.8.8.8', '127.0.0.2', 'localhost.example.com'])(
    '拒绝非 loopback 地址：%s',
    (host) => {
      expect(() => normalizeWidgetDevHost(host)).toThrowError(expect.objectContaining({ code: 'CHECK_FAILED' }))
    },
  )
})
