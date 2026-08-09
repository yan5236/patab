import vueProductionRuntime from 'vue/dist/vue.runtime.global.prod.js?raw'

import {
  type SurfaceCspProbeKind,
  type SurfaceCspProbeReport,
  createSurfaceCspHtml,
} from './surfaceCsp'

/** 浏览器实验页展示的单个 surface 验证结果。 */
interface SurfaceCspBrowserResult extends SurfaceCspProbeReport {
  readonly sandbox: string | null
}

/**
 * 获取实验页所需节点，防止页面结构改动后出现未运行却显示成功的情况。
 */
function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) {
    throw new Error(`Surface CSP 实验页缺少必要节点：${selector}`)
  }
  return element
}

const runButton = requireElement<HTMLButtonElement>('#run-surface-csp')
const resultElement = requireElement<HTMLPreElement>('#result')
const surfaceHost = requireElement<HTMLDivElement>('#surface-host')

/**
 * 将结构化验证结果写回页面，令真实 Web 与 MV3 验收可直接读取相同证据。
 */
function showResult(value: unknown): void {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/**
 * 校验来自 opaque-origin iframe 的消息结构，避免无关窗口伪造实验通过结果。
 */
function parseProbeReport(
  value: unknown,
  token: string,
  kind: SurfaceCspProbeKind,
): SurfaceCspProbeReport | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const report = value as Partial<SurfaceCspProbeReport>
  if (
    report.type !== 'patab:surface-csp-ready'
    || report.token !== token
    || report.kind !== kind
    || typeof report.rendered !== 'boolean'
    || typeof report.vueRuntimeLoaded !== 'boolean'
    || typeof report.networkBlocked !== 'boolean'
    || typeof report.unsafeEvalAllowed !== 'boolean'
    || typeof report.externalResourceCount !== 'number'
  ) {
    return null
  }

  return report as SurfaceCspProbeReport
}

/**
 * 等待 iframe 完成加载，避免向固定 MV3 sandbox 页过早转移 MessagePort。
 */
function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.addEventListener('error', () => reject(new Error('Surface CSP 固定 sandbox 页加载失败')), { once: true })
  })
}

/**
 * 判断当前实验是否运行在扩展页，以便选择 MV3 必需的固定 sandbox page 转接路径。
 */
function isMv3ExtensionPage(): boolean {
  return window.location.protocol === 'chrome-extension:'
}

/**
 * 在固定 MV3 sandbox 页创建唯一内层 iframe，并通过专属端口接收 surface 探测结果。
 */
async function startMv3SurfaceProbe(
  iframe: HTMLIFrameElement,
  kind: SurfaceCspProbeKind,
  token: string,
  receiveReport: (value: unknown) => void,
): Promise<void> {
  const channel = new MessageChannel()
  channel.port1.onmessage = (event) => receiveReport(event.data)
  channel.port1.start()
  iframe.src = '/custom-component-sandbox.html'
  await waitForIframeLoad(iframe)
  iframe.contentWindow?.postMessage(
    {
      type: 'patab:surface-csp-connect',
      token,
      markup: createSurfaceCspHtml(kind, token, vueProductionRuntime),
    },
    '*',
    [channel.port2],
  )
}

/**
 * 等待一个自包含 iframe 经过 CSP 拦截网络探测后回报实际渲染状态。
 *
 * Web 直接接收 opaque-origin iframe 的 `postMessage`；MV3 则经 manifest 声明的
 * 固定 sandbox page 把同一自包含 HTML 和独占 MessagePort 转交给内层 iframe。
 */
function runSurfaceProbe(kind: SurfaceCspProbeKind): Promise<SurfaceCspBrowserResult> {
  const token = crypto.randomUUID()
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  if (!isMv3ExtensionPage()) {
    iframe.srcdoc = createSurfaceCspHtml(kind, token, vueProductionRuntime)
  }
  surfaceHost.append(iframe)

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      iframe.remove()
      reject(new Error(`${kind} surface CSP 探测在 5,000 ms 内未完成`))
    }, 5_000)

    /**
     * 仅接受当前 iframe、当前随机令牌和当前 surface 类型的浏览器探测回报。
     */
    function finishFromReport(value: unknown): void {
      const report = parseProbeReport(value, token, kind)
      if (!report) {
        return
      }

      window.clearTimeout(timeoutId)
      window.removeEventListener('message', onMessage)
      resolve({ ...report, sandbox: iframe.getAttribute('sandbox') })
    }

    /** 仅接收当前 Web iframe 的窗口消息，拒绝其他页面伪造实验结果。 */
    function onMessage(event: MessageEvent<unknown>): void {
      if (event.source === iframe.contentWindow) {
        finishFromReport(event.data)
      }
    }

    window.addEventListener('message', onMessage)
    if (isMv3ExtensionPage()) {
      void startMv3SurfaceProbe(iframe, kind, token, finishFromReport).catch((error) => {
        window.clearTimeout(timeoutId)
        window.removeEventListener('message', onMessage)
        iframe.remove()
        reject(error)
      })
    }
  })
}

/**
 * 依次运行 Vanilla 与 Vue 自包含 surface，便于直接比较 Web/MV3 的同一输出契约。
 */
async function runAllSurfaceProbes(): Promise<void> {
  runButton.disabled = true
  surfaceHost.replaceChildren()
  showResult({ status: 'running' })

  try {
    const results = await Promise.all([
      runSurfaceProbe('vanilla'),
      runSurfaceProbe('vue'),
    ])
    const passed = results.every((result) =>
      result.rendered
      && result.networkBlocked
      && !result.unsafeEvalAllowed
      && result.externalResourceCount === 0
      && result.sandbox === 'allow-scripts'
      && (result.kind !== 'vue' || result.vueRuntimeLoaded),
    )
    showResult({ status: passed ? 'passed' : 'failed', results })
  } catch (error) {
    showResult({ status: 'failed', error: error instanceof Error ? error.message : '未知错误' })
  } finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  void runAllSurfaceProbes()
})
