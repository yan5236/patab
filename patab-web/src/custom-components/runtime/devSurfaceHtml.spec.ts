import { describe, expect, it } from 'vitest'

import { createDevSandboxSurfacePreparer } from './devSurfaceHtml'

describe('开发 surface HTML 准备', () => {
  /** 构造 CLI 已注入随机 Vite base 的开发 HTML。 */
  function createHtml(body: string, head = ''): string {
    return `<!doctype html><html><head><base href="/__patab_dev__/sessions/abcdefghijklmnop/vite/src/surfaces/">${head}</head><body>${body}</body></html>`
  }

  /** 验证当前 loopback 的 Vite client、模块与 HMR WebSocket被精确加入 CSP。 */
  it('允许当前 CLI origin 并复用生产握手 bootstrap', () => {
    const prepare = createDevSandboxSurfacePreparer({ origin: 'http://127.0.0.1:5174' })
    const html = prepare(`<!doctype html><html><head>
      <base href="/__patab_dev__/sessions/abcdefghijklmnop/vite/src/surfaces/">
      <script type="module" src="/@vite/client"></script>
      <link rel="stylesheet" href="/src/widget.css">
    </head><body><script type="module" src="/src/widget.ts"></script></body></html>`, {
      hostThemeStyle: ':root{--pt-text:#fff}',
    })

    expect(html).toContain("script-src 'unsafe-inline' http://127.0.0.1:5174")
    expect(html).toContain('connect-src http://127.0.0.1:5174 ws://127.0.0.1:5174')
    expect(html).toContain('base-uri http://127.0.0.1:5174')
    expect(html).toContain('data-patab-bootstrap="v1"')
    expect(html).toContain('patab-widget-connected')
    expect(html).toContain('patab:sandbox-activate')
    expect(html).toContain('--pt-text:#fff')
  })

  /** 验证外部脚本、样式、素材和自定义 CSP 不能借开发模式扩大网络边界。 */
  it.each([
    '<script src="https://example.com/code.js"></script>',
    '<link rel="stylesheet" href="https://example.com/style.css">',
    '<img src="https://example.com/image.png">',
    '<meta http-equiv="Content-Security-Policy" content="default-src *">',
    '<iframe src="http://127.0.0.1:5174/other"></iframe>',
  ])('拒绝开发 origin 之外的资源：%s', (body) => {
    const prepare = createDevSandboxSurfacePreparer({ origin: 'http://127.0.0.1:5174' })
    expect(() => prepare(createHtml(body))).toThrowError(
      expect.objectContaining({ name: 'SurfaceHtmlPreparationError' }),
    )
  })

  /** 验证非 loopback origin 在创建 preparer 时即被拒绝。 */
  it.each(['http://0.0.0.0:5174', 'http://192.168.1.2:5174', 'https://127.0.0.1:5174'])(
    '拒绝非本机开发 origin：%s',
    (origin) => {
      expect(() => createDevSandboxSurfacePreparer({ origin })).toThrowError(
        expect.objectContaining({ name: 'SurfaceHtmlPreparationError' }),
      )
    },
  )

  /** 验证缺失、重复或越出当前开发命名空间的 base 都不能改变模块解析范围。 */
  it.each([
    '<!doctype html><html><head></head><body></body></html>',
    createHtml('', '<base href="/__patab_dev__/sessions/abcdefghijklmnop/vite/">'),
    '<!doctype html><html><head><base href="https://example.com/"></head><body></body></html>',
  ])('拒绝不安全的开发 base', (html) => {
    const prepare = createDevSandboxSurfacePreparer({ origin: 'http://127.0.0.1:5174' })
    expect(() => prepare(html)).toThrowError(expect.objectContaining({ name: 'SurfaceHtmlPreparationError' }))
  })
})
