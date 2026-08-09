import { describe, expect, it } from 'vitest'

import { prepareSandboxSurfaceHtml } from './surfaceHtml'
import { createWidgetThemeStyle, getWidgetThemeTokens } from './widgetTheme'

/** 覆盖公开主题 token 只能从显式映射导出，且会随 CSP 安全地注入 sandbox 文档。 */
describe('自定义组件公开主题 token', () => {
  /** 验证公开值只使用 --pt-* 名称，不能把宿主 theme-* 变量名泄漏给第三方。 */
  it('生成版本化公开 token 而不暴露内部变量名称', () => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.style.setProperty('--theme-text', 'rgb(230 230 230)')
    const tokens = getWidgetThemeTokens(document)

    expect(tokens.version).toBe(1)
    expect(Object.keys(tokens.values).every((name) => name.startsWith('--pt-'))).toBe(true)
    expect(tokens.values['--pt-text']).toBe('rgb(230 230 230)')
    expect(createWidgetThemeStyle(tokens)).toContain('--pt-surface')
    expect(createWidgetThemeStyle(tokens)).not.toContain('--theme-text')
  })

  /** 验证初次 Runtime 启动会把公开样式注入独立 sandbox 文档，而非修改宿主样式表。 */
  it('在 surface HTML 中注入公开主题样式与 CSP bootstrap', () => {
    const html = prepareSandboxSurfaceHtml('<!doctype html><html><head></head><body><main>safe</main></body></html>', {
      hostThemeStyle: createWidgetThemeStyle(getWidgetThemeTokens(document)),
    })

    expect(html).toContain('data-patab-theme="v1"')
    expect(html).toContain('--pt-surface')
    expect(html).toContain("connect-src 'none'")
  })
})
