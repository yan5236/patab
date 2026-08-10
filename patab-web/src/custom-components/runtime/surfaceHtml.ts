import { SANDBOX_ACTIVATE_MESSAGE, SANDBOX_CONNECTED_MESSAGE, SANDBOX_CONNECT_MESSAGE, SANDBOX_PREPARE_MESSAGE, SANDBOX_READY_MESSAGE } from './protocol'

/** 生产 surface 统一使用的最小 CSP；网络只能通过未来 Capability Broker 代理。 */
export const SURFACE_PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** 静态 surface 审查的内部失败分类；对外 Runtime 只会映射为安全健康状态。 */
export type SurfaceHtmlErrorCode =
  | 'external-resource'
  | 'invalid-structure'
  | 'unknown-csp'

/** Runtime 注入的公开样式只允许来自宿主映射；组件 HTML 自身不能借此扩展 CSP 或访问宿主文档。 */
export interface PrepareSandboxSurfaceHtmlOptions {
  readonly hostThemeStyle?: string
}

/**
 * 表示 surface HTML 在创建 iframe 前被拒绝的受控错误。
 *
 * 错误不携带原 HTML、URL 或 DOMParser 原始异常，避免第三方载荷进入诊断或 UI。
 */
export class SurfaceHtmlPreparationError extends Error {
  /** 创建仅包含稳定分类的 HTML 准备错误。 */
  constructor(readonly code: SurfaceHtmlErrorCode) {
    super('组件 surface 不符合受限运行格式。')
    this.name = 'SurfaceHtmlPreparationError'
  }
}

/**
 * 判断 URL 属性是否是 CSP 基线允许的内联二进制资源。
 *
 * 空属性和非 data/blob 来源都会被拒绝，避免相对路径在 opaque origin 中变成意外网络请求。
 */
function isAllowedInlineResource(value: string | null): boolean {
  if (!value) return false
  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue.startsWith('data:') || normalizedValue.startsWith('blob:')
}

/**
 * 检查所有会触发资源请求的节点。
 *
 * production ZIP 必须自包含，所以仅允许 data/blob 图片、媒体和字体，不允许任何脚本、样式表、嵌套 frame 或对象来源。
 */
function assertNoExternalResources(document: Document): void {
  if (document.querySelector('script[src], link[href], base, iframe, frame, object, embed')) {
    throw new SurfaceHtmlPreparationError('external-resource')
  }

  const resourceSelectors = ['img[src]', 'audio[src]', 'video[src]', 'source[src]', 'track[src]']
  for (const selector of resourceSelectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!isAllowedInlineResource(element.getAttribute('src'))) {
        throw new SurfaceHtmlPreparationError('external-resource')
      }
    }
  }

  if (document.querySelector('[srcset], meta[http-equiv="refresh" i]')) {
    throw new SurfaceHtmlPreparationError('external-resource')
  }

  for (const script of document.querySelectorAll('script:not([src])')) {
    if (/\bimport\s*\(/.test(script.textContent ?? '')) {
      throw new SurfaceHtmlPreparationError('external-resource')
    }
  }
}

/**
 * 检查文档只含宿主可控 CSP，并拒绝会与宿主策略叠加后产生不可预测结果的已有策略。
 */
function assertNoExistingCsp(document: Document): void {
  for (const meta of document.querySelectorAll('meta[http-equiv]')) {
    if (meta.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy') {
      throw new SurfaceHtmlPreparationError('unknown-csp')
    }
  }
}

/**
 * 生成在第三方文档最早执行的握手 bootstrap。
 *
 * 它先验证父窗口、一次性令牌和独占端口，再保留端口给 SDK/Broker 使用；第三方代码不能通过 window 消息伪造已连接状态。
 */
export function createSandboxBootstrap(): string {
  return `(() => {
  let preparedToken = null
  let connected = false
  let brokerPort = null
  let hostRequestSequence = 0
  const applyThemeTokens = (tokens) => {
    if (!tokens || tokens.version !== 1 || !tokens.values || typeof tokens.values !== 'object') return
    for (const [name, value] of Object.entries(tokens.values)) {
      if (!/^--pt-[a-z-]+$/.test(name) || typeof value !== 'string') continue
      document.documentElement.style.setProperty(name, value)
    }
  }
  const requestHostClose = () => {
    if (!brokerPort || !preparedToken) return
    hostRequestSequence += 1
    brokerPort.postMessage({
      protocol: 'patab-widget',
      apiVersion: 1,
      sessionId: preparedToken,
      requestId: 'host-close-' + hostRequestSequence,
      method: 'ui.closeSurface',
      params: {},
    })
  }
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    requestHostClose()
  }, true)
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return
    if (event.data.type === '${SANDBOX_PREPARE_MESSAGE}') {
      if (preparedToken !== null || typeof event.data.token !== 'string') return
      preparedToken = event.data.token
      window.parent.postMessage({ type: '${SANDBOX_READY_MESSAGE}', token: preparedToken }, '*')
      return
    }
    if (event.data.type !== '${SANDBOX_CONNECT_MESSAGE}' || connected || event.data.token !== preparedToken) return
    const port = event.ports[0]
    if (!port) return
    connected = true
    brokerPort = port
    port.start()
    window.__PATAB_WIDGET_PORT__ = port
    window.__PATAB_WIDGET_SESSION_ID__ = preparedToken
    port.addEventListener('message', (portEvent) => {
      const message = portEvent.data
      if (message?.type === '${SANDBOX_ACTIVATE_MESSAGE}' && message.token === preparedToken) {
        window.dispatchEvent(new CustomEvent('patab-widget-connected'))
        return
      }
      if (!message || typeof message !== 'object' || message.event !== 'themeChanged') return
      applyThemeTokens(message.payload?.tokens)
    })
    port.postMessage({ type: '${SANDBOX_CONNECTED_MESSAGE}', token: preparedToken })
  })
})()`
}

/**
 * 对已经通过包校验的自包含 HTML 执行惰性 DOM 检查，并在不执行脚本的前提下注入 CSP 与握手 bootstrap。
 *
 * 调用方只能把返回值交给 SandboxAdapter；如果任一结构不符合生产格式，函数会在创建 iframe 前拒绝。
 */
export function prepareSandboxSurfaceHtml(
  surfaceHtml: string,
  options: PrepareSandboxSurfaceHtmlOptions = {},
): string {
  if (!surfaceHtml.trim()) {
    throw new SurfaceHtmlPreparationError('invalid-structure')
  }

  const document = new DOMParser().parseFromString(surfaceHtml, 'text/html')
  if (!document.documentElement || !document.head || !document.body || document.querySelector('parsererror')) {
    throw new SurfaceHtmlPreparationError('invalid-structure')
  }

  assertNoExistingCsp(document)
  assertNoExternalResources(document)

  const csp = document.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', SURFACE_PRODUCTION_CSP)
  document.head.insertBefore(csp, document.head.firstChild)

  let theme: HTMLStyleElement | undefined
  if (options.hostThemeStyle) {
    theme = document.createElement('style')
    theme.setAttribute('data-patab-theme', 'v1')
    theme.textContent = options.hostThemeStyle
    document.head.insertBefore(theme, csp.nextSibling)
  }

  const bootstrap = document.createElement('script')
  bootstrap.textContent = createSandboxBootstrap()
  const bootstrapAnchor = options.hostThemeStyle ? theme?.nextSibling ?? null : csp.nextSibling
  document.head.insertBefore(bootstrap, bootstrapAnchor)
  return `<!doctype html>\n${document.documentElement.outerHTML}`
}
