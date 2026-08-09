/** 阶段 0.4 两种 surface 共用的生产 CSP 基线。 */
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

/** 本实验支持的最小自包含 surface 类型。 */
export type SurfaceCspProbeKind = 'vanilla' | 'vue'

/** 子 iframe 回报给宿主页的最小可验证结果。 */
export interface SurfaceCspProbeReport {
  readonly type: 'patab:surface-csp-ready'
  readonly token: string
  readonly kind: SurfaceCspProbeKind
  readonly rendered: boolean
  readonly vueRuntimeLoaded: boolean
  readonly networkBlocked: boolean
  readonly unsafeEvalAllowed: boolean
  readonly externalResourceCount: number
}

/**
 * 转义受控脚本内容中可能提前关闭 script 节点的标记。
 *
 * 此函数只用于内置 Vue 生产运行时和实验 bootstrap，确保生成的单文件 HTML
 * 不会因文本中的闭合标签被 HTML 解析器截断。
 */
function escapeInlineScript(script: string): string {
  return script.replaceAll('</script', '<\\/script')
}

/**
 * 生成子 surface 的回报 bootstrap。
 *
 * 该代码故意发起一个相对路径 fetch，以确认 CSP 的 `connect-src 'none'`
 * 在浏览器中会拒绝直接连接；请求失败后才回报结果，且不会依赖任何远程资源。
 */
function createProbeBootstrap(kind: SurfaceCspProbeKind, token: string): string {
  const serializedKind = JSON.stringify(kind).replaceAll('<', '\\u003C')
  const serializedToken = JSON.stringify(token).replaceAll('<', '\\u003C')
  const vueMountCode = kind === 'vue'
    ? `
      const mountPoint = document.querySelector('#surface-root')
      const app = window.Vue?.createApp({
        render() {
          return window.Vue.h('strong', { 'data-surface-kind': 'vue' }, 'Vue surface 已渲染')
        },
      })
      app?.mount(mountPoint)
    `
    : `
      const mountPoint = document.querySelector('#surface-root')
      if (mountPoint) {
        mountPoint.textContent = 'Vanilla surface 已渲染'
        mountPoint.dataset.surfaceKind = 'vanilla'
      }
    `

  return `
    (() => {
      const kind = ${serializedKind}
      const token = ${serializedToken}
      let hostPort = null
      let probeStarted = false
      ${vueMountCode}

      /** 收集页面内可能导致额外请求的资源节点，保证测试产物保持自包含。 */
      function countExternalResources() {
        return document.querySelectorAll('script[src], link[href], img[src]:not([src^="data:"]):not([src^="blob:"]), audio[src], video[src], iframe[src]').length
      }

      /** 将浏览器实际 CSP 结果通知创建 iframe 的宿主页或固定 MV3 sandbox 页。 */
      function report(networkBlocked) {
        const rendered = kind === 'vue'
          ? Boolean(document.querySelector('[data-surface-kind="vue"]'))
          : document.querySelector('#surface-root')?.textContent === 'Vanilla surface 已渲染'
        const result = {
          type: 'patab:surface-csp-ready',
          token,
          kind,
          rendered,
          vueRuntimeLoaded: kind === 'vue' ? Boolean(window.Vue?.createApp) : false,
          networkBlocked,
          unsafeEvalAllowed: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.includes("'unsafe-eval'") === true,
          externalResourceCount: countExternalResources(),
        }
        if (hostPort) {
          hostPort.postMessage(result)
          return
        }
        window.parent.postMessage(result, '*')
      }

      /** 仅启动一次 CSP 网络拦截探测，兼容 Web 直连与 MV3 固定页转交端口。 */
      function startNetworkProbe() {
        if (probeStarted) {
          return
        }
        probeStarted = true
        fetch('network-probe', { mode: 'no-cors' }).then(
          () => report(false),
          () => report(true),
        )
      }

      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'patab:surface-csp-connect' || event.data.token !== token || !event.ports[0]) {
          return
        }
        hostPort = event.ports[0]
        hostPort.start()
        startNetworkProbe()
      })

      window.setTimeout(startNetworkProbe, 50)
    })()
  `
}

/**
 * 生成供 opaque-origin iframe 使用的完整自包含 HTML。
 *
 * Vanilla surface 只使用原生 DOM；Vue surface 必须由调用者传入仅运行时的 Vue
 * 生产文本，随后被内联到同一 HTML，避免 script/link 外部资源依赖或模板编译求值。
 */
export function createSurfaceCspHtml(
  kind: SurfaceCspProbeKind,
  token: string,
  vueProductionRuntime = '',
): string {
  if (kind === 'vue' && !vueProductionRuntime) {
    throw new Error('Vue surface CSP 实验缺少内联生产运行时')
  }

  const vueRuntimeScript = kind === 'vue'
    ? `<script>${escapeInlineScript(vueProductionRuntime)}</script>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${SURFACE_PRODUCTION_CSP}">
    <title>PaTab ${kind} surface CSP 实验</title>
    <style>body { color: CanvasText; background: Canvas; }</style>
  </head>
  <body>
    <main id="surface-root"></main>
    ${vueRuntimeScript}
    <script>${escapeInlineScript(createProbeBootstrap(kind, token))}</script>
  </body>
</html>`
}
