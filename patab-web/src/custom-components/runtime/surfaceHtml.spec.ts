import { describe, expect, it } from 'vitest'

import {
  SURFACE_PRODUCTION_CSP,
  SurfaceHtmlPreparationError,
  prepareSandboxSurfaceHtml,
} from './surfaceHtml'

/** 创建最小自包含 surface，确保测试只改变与单个攻击面有关的标记。 */
function createSurfaceHtml(body = '<main id="component-root">安全内容</main>'): string {
  return `<!doctype html><html><head><title>组件</title></head><body>${body}</body></html>`
}

/** 执行预期失败的 HTML 准备，并返回稳定错误对象供断言内部分类。 */
function getPreparationError(surfaceHtml: string): SurfaceHtmlPreparationError {
  try {
    prepareSandboxSurfaceHtml(surfaceHtml)
  } catch (error) {
    if (error instanceof SurfaceHtmlPreparationError) return error
  }
  throw new Error('预期 surface HTML 准备失败')
}

/** 覆盖生产 HTML 惰性检查、CSP 注入和 bootstrap 放置，不在测试环境执行第三方脚本。 */
describe('surface HTML 准备', () => {
  /** 验证宿主 CSP 位于 head 首位，并在任何第三方脚本前插入握手 bootstrap。 */
  it('注入唯一生产 CSP 与最早执行的握手 bootstrap', () => {
    const preparedHtml = prepareSandboxSurfaceHtml(createSurfaceHtml('<script>window.thirdPartyLoaded = true</script>'))
    const document = new DOMParser().parseFromString(preparedHtml, 'text/html')

    expect(document.head.firstElementChild?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    expect(document.head.firstElementChild?.getAttribute('content')).toBe(SURFACE_PRODUCTION_CSP)
    expect(document.head.querySelector('script')?.textContent).toContain('patab:sandbox-prepare')
    expect(document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')).toHaveLength(1)
  })

  /** 验证 bootstrap 在第三方 head 脚本之前注册捕获阶段 ESC，避免 sandbox 焦点阻断宿主关闭请求。 */
  it('在第三方 head 脚本之前注入受控 ESC 关闭桥接', () => {
    const preparedHtml = prepareSandboxSurfaceHtml(
      '<!doctype html><html><head><script>window.thirdPartyHead = true</script></head><body></body></html>',
      { hostThemeStyle: ':root{--pt-surface: white;}' },
    )
    const document = new DOMParser().parseFromString(preparedHtml, 'text/html')
    const scripts = [...document.head.querySelectorAll('script')]

    expect(scripts[0]?.textContent).toContain("method: 'ui.closeSurface'")
    expect(scripts[0]?.textContent).toContain("'keydown'")
    expect(scripts[1]?.textContent).toContain('thirdPartyHead')
  })

  /** 验证已有 CSP 不能与宿主管理策略叠加，防止第三方通过顺序或多策略改变允许项。 */
  it('拒绝已有或未知 CSP', () => {
    expect(getPreparationError(createSurfaceHtml(
      '<meta http-equiv="Content-Security-Policy" content="default-src *">',
    ))).toMatchObject({ code: 'unknown-csp' } satisfies Partial<SurfaceHtmlPreparationError>)
  })

  /** 验证所有会加载外部内容的入口都会在 iframe 创建前失败。 */
  it.each([
    '<base href="https://evil.example/">',
    '<script src="https://evil.example/widget.js"></script>',
    '<link rel="stylesheet" href="https://evil.example/widget.css">',
    '<img src="/asset.png">',
    '<iframe src="https://evil.example/frame"></iframe>',
    '<script>import("https://evil.example/module.js")</script>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
  ])('拒绝外链或动态入口：%s', (markup) => {
    expect(getPreparationError(createSurfaceHtml(markup))).toMatchObject({
      code: 'external-resource',
    } satisfies Partial<SurfaceHtmlPreparationError>)
  })

  /** 验证自包含 data/blob 静态素材仍可通过，避免 CSP 审查误伤已经打包进 surface 的资源。 */
  it('允许 data 与 blob 静态资源', () => {
    expect(() => prepareSandboxSurfaceHtml(createSurfaceHtml(
      '<img src="data:image/png;base64,AA=="><video src="blob:component-media"></video>',
    ))).not.toThrow()
  })
})
