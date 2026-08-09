import { describe, expect, it } from 'vitest'

import { SURFACE_PRODUCTION_CSP, createSurfaceCspHtml } from './surfaceCsp'

/**
 * 验证可行性实验的产物契约，防止后续调整时意外放宽 CSP 或恢复外部运行资源。
 */
describe('surface CSP 最小实验', () => {
  /**
   * 验证生产 CSP 始终拒绝直接连接和动态求值，同时保留所需的内联样式与脚本能力。
   */
  it('使用无 unsafe-eval 的最小生产 CSP 基线', () => {
    expect(SURFACE_PRODUCTION_CSP).toContain("connect-src 'none'")
    expect(SURFACE_PRODUCTION_CSP).toContain("script-src 'unsafe-inline'")
    expect(SURFACE_PRODUCTION_CSP).not.toContain("'unsafe-eval'")
  })

  /**
   * 验证 Vanilla 产物没有外部资源节点，并将网络访问仅限于 CSP 拦截的探测代码。
   */
  it('生成自包含 Vanilla HTML', () => {
    const html = createSurfaceCspHtml('vanilla', 'vanilla-token')
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(document.querySelectorAll('script[src], link[href], img[src], audio[src], video[src], iframe[src]')).toHaveLength(0)
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(SURFACE_PRODUCTION_CSP)
  })

  /**
   * 验证 Vue 产物强制要求调用者提供内联运行时，并将其保留在同一 HTML 中。
   */
  it('生成自包含 Vue HTML 并拒绝缺少生产运行时', () => {
    expect(() => createSurfaceCspHtml('vue', 'vue-token')).toThrow('缺少内联生产运行时')

    const html = createSurfaceCspHtml('vue', 'vue-token', 'window.Vue = { createApp() {} }')
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(document.querySelectorAll('script[src], link[href], img[src], audio[src], video[src], iframe[src]')).toHaveLength(0)
    expect(html).toContain('window.Vue = { createApp() {} }')
  })
})
