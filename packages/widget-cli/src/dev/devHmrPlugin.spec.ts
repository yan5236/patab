import { describe, expect, it } from 'vitest'

import { appendWidgetDevHmrBoundary } from './devHmrPlugin.js'

describe('开发 HMR 入口边界', () => {
  /** 验证入口源码保留原执行内容，并包含 Vite 静态分析要求的精确自接收调用。 */
  it('追加最小 import.meta.hot.accept 边界', () => {
    const source = 'export const value = 1\n'
    const transformed = appendWidgetDevHmrBoundary(source)

    expect(transformed.startsWith(source)).toBe(true)
    expect(transformed).toContain('import.meta.hot.accept()')
    expect(transformed).not.toContain('location.reload')
  })
})
