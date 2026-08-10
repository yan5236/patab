import { createSandboxBootstrap, SurfaceHtmlPreparationError } from './surfaceHtml'

/** 开发 surface 仅允许 HTTP loopback；HTTPS、局域网和通配地址均不属于本地 CLI 会话。 */
function parseLoopbackOrigin(origin: string): URL {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new SurfaceHtmlPreparationError('external-resource')
  }
  const loopbackHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]'
  if (parsed.protocol !== 'http:' || !loopbackHost || parsed.origin !== origin) {
    throw new SurfaceHtmlPreparationError('external-resource')
  }
  return parsed
}

/** 判断 URL 属性是否只访问当前 CLI loopback server 或内联二进制资源。 */
function isAllowedDevResource(value: string | null, origin: URL, allowInline: boolean): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  if (allowInline && (normalized.startsWith('data:') || normalized.startsWith('blob:'))) return true
  try {
    return new URL(value, origin).origin === origin.origin
  } catch {
    return false
  }
}

/**
 * 检查开发 HTML 的请求节点只指向当前 CLI server。
 *
 * 该检查允许 Vite client、模块、样式和本地素材，但继续拒绝嵌套 frame、对象、刷新、
 * 任意外部 origin 与组件自行声明的 CSP。
 */
function assertDevResources(document: Document, origin: URL): void {
  if (document.querySelector('iframe, frame, object, embed, meta[http-equiv="refresh" i]')) {
    throw new SurfaceHtmlPreparationError('external-resource')
  }
  const bases = [...document.querySelectorAll('base')]
  if (bases.length !== 1) throw new SurfaceHtmlPreparationError('external-resource')
  const baseHref = bases[0]?.getAttribute('href')
  let parsedBase: URL
  try {
    parsedBase = new URL(baseHref ?? '', origin)
  } catch {
    throw new SurfaceHtmlPreparationError('external-resource')
  }
  if (parsedBase.origin !== origin.origin
    || !/^\/__patab_dev__\/sessions\/[A-Za-z0-9_-]{16,128}\/vite\//.test(parsedBase.pathname)) {
    throw new SurfaceHtmlPreparationError('external-resource')
  }
  for (const meta of document.querySelectorAll('meta[http-equiv]')) {
    if (meta.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy') {
      throw new SurfaceHtmlPreparationError('unknown-csp')
    }
  }
  for (const script of document.querySelectorAll('script[src]')) {
    if (!isAllowedDevResource(script.getAttribute('src'), origin, false)) {
      throw new SurfaceHtmlPreparationError('external-resource')
    }
  }
  for (const link of document.querySelectorAll('link[href]')) {
    if (!isAllowedDevResource(link.getAttribute('href'), origin, false)) {
      throw new SurfaceHtmlPreparationError('external-resource')
    }
  }
  for (const selector of ['img[src]', 'audio[src]', 'video[src]', 'source[src]', 'track[src]']) {
    for (const element of document.querySelectorAll(selector)) {
      if (!isAllowedDevResource(element.getAttribute('src'), origin, true)) {
        throw new SurfaceHtmlPreparationError('external-resource')
      }
    }
  }
  if (document.querySelector('[srcset]')) throw new SurfaceHtmlPreparationError('external-resource')
}

/** 为当前 loopback origin 创建只额外开放 Vite 模块与 HMR WebSocket 的开发 CSP。 */
function createDevSurfaceCsp(origin: URL): string {
  const websocketOrigin = `${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origin.origin}`,
    `style-src 'unsafe-inline' ${origin.origin}`,
    `img-src data: blob: ${origin.origin}`,
    `font-src data: ${origin.origin}`,
    `media-src data: blob: ${origin.origin}`,
    `connect-src ${origin.origin} ${websocketOrigin}`,
    "object-src 'none'",
    "frame-src 'none'",
    `base-uri ${origin.origin}`,
    "form-action 'none'",
  ].join('; ')
}

/** 开发 surface preparer 的固定构造输入；origin 由 CLI 实际监听地址生成而非 Manifest 提供。 */
export interface CreateDevSandboxSurfacePreparerOptions {
  readonly origin: string
}

/**
 * 创建仅供真实 PaTab 开发宿主使用的 HTML 准备函数。
 *
 * 它复用生产握手 bootstrap 与 sandbox 属性，只把当前精确 loopback HTTP/WebSocket 来源加入 CSP；
 * 组件 HTML、query 或 Manifest 均不能扩大该来源。
 */
export function createDevSandboxSurfacePreparer(
  options: CreateDevSandboxSurfacePreparerOptions,
): (surfaceHtml: string, input?: { readonly hostThemeStyle?: string }) => string {
  const origin = parseLoopbackOrigin(options.origin)
  return (surfaceHtml, input = {}) => {
    if (!surfaceHtml.trim()) throw new SurfaceHtmlPreparationError('invalid-structure')
    const document = new DOMParser().parseFromString(surfaceHtml, 'text/html')
    if (!document.documentElement || !document.head || !document.body || document.querySelector('parsererror')) {
      throw new SurfaceHtmlPreparationError('invalid-structure')
    }
    assertDevResources(document, origin)

    const csp = document.createElement('meta')
    csp.setAttribute('http-equiv', 'Content-Security-Policy')
    csp.setAttribute('content', createDevSurfaceCsp(origin))
    document.head.insertBefore(csp, document.head.firstChild)

    if (input.hostThemeStyle) {
      const theme = document.createElement('style')
      theme.setAttribute('data-patab-theme', 'v1')
      theme.textContent = input.hostThemeStyle
      document.head.insertBefore(theme, csp.nextSibling)
    }

    const bootstrap = document.createElement('script')
    bootstrap.setAttribute('data-patab-bootstrap', 'v1')
    bootstrap.textContent = createSandboxBootstrap()
    const theme = document.querySelector('style[data-patab-theme="v1"]')
    document.head.insertBefore(bootstrap, theme?.nextSibling ?? csp.nextSibling)
    return `<!doctype html>\n${document.documentElement.outerHTML}`
  }
}
