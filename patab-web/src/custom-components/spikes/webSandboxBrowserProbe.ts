import {
  WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS,
  WebSandboxHandshakeTimeoutError,
  createWebSandboxIframe,
  startWebSandboxHandshake,
} from './webSandbox'

/** 浏览器实验页显示给人工验收者的最小结果结构。 */
interface WebSandboxBrowserProbeResult {
  sandbox: string | null
  parentDomAccessible: boolean
  localStorageAccessible: boolean
}

/**
 * 获取实验页必须存在的节点，避免后续事件处理在错误页面结构中静默失效。
 */
function requireProbeElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) {
    throw new Error(`Web 沙箱实验页缺少必要节点：${selector}`)
  }
  return element
}

const resultElement = requireProbeElement<HTMLPreElement>('#result')
const sandboxHost = requireProbeElement<HTMLDivElement>('#sandbox-host')
const isolationButton = requireProbeElement<HTMLButtonElement>('#run-isolation')
const timeoutButton = requireProbeElement<HTMLButtonElement>('#run-timeout')

/**
 * 把实验状态写入页面，确保人工浏览器验收无需读取开发者控制台。
 */
function showResult(value: unknown): void {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/**
 * 等待 iframe 进入加载完成状态，避免在 srcdoc 尚未初始化时转移 MessagePort。
 */
function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.addEventListener('error', () => reject(new Error('Web 沙箱 iframe 加载失败')), { once: true })
  })
}

/**
 * 销毁上一次实验的 iframe，防止前次端口或子文档影响本次测量。
 */
function clearSandboxHost(): void {
  sandboxHost.replaceChildren()
}

/**
 * 在真实浏览器中验证仅 allow-scripts 的 srcdoc iframe 无法访问父 DOM 与 localStorage。
 */
async function runIsolationProbe(): Promise<void> {
  clearSandboxHost()
  isolationButton.disabled = true
  timeoutButton.disabled = true
  showResult({ status: 'running-isolation' })

  try {
    const token = crypto.randomUUID()
    const iframe = createWebSandboxIframe(document, '', token)
    sandboxHost.append(iframe)
    await waitForIframeLoad(iframe)
    const handshake = await startWebSandboxHandshake(iframe, token)
    const result: WebSandboxBrowserProbeResult = {
      sandbox: iframe.getAttribute('sandbox'),
      parentDomAccessible: handshake.isolation.parentDomAccessible,
      localStorageAccessible: handshake.isolation.localStorageAccessible,
    }
    showResult({ status: 'passed', ...result })
  } catch (error) {
    showResult({ status: 'failed', error: error instanceof Error ? error.message : '未知错误' })
  } finally {
    isolationButton.disabled = false
    timeoutButton.disabled = false
  }
}

/**
 * 在真实浏览器中验证缺少 SDK 初始化回应时，宿主会按固定五秒上限拒绝该 iframe。
 */
async function runTimeoutProbe(): Promise<void> {
  clearSandboxHost()
  isolationButton.disabled = true
  timeoutButton.disabled = true
  showResult({ status: 'running-timeout', timeoutMs: WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS })

  try {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.srcdoc = '<!doctype html><title>无握手回应</title><script>void 0<\\/script>'
    sandboxHost.append(iframe)
    await waitForIframeLoad(iframe)
    await startWebSandboxHandshake(iframe, crypto.randomUUID())
    showResult({ status: 'failed', error: '无回应 iframe 意外完成了握手' })
  } catch (error) {
    if (error instanceof WebSandboxHandshakeTimeoutError) {
      showResult({ status: 'passed', timeoutMs: WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS })
      return
    }
    showResult({ status: 'failed', error: error instanceof Error ? error.message : '未知错误' })
  } finally {
    isolationButton.disabled = false
    timeoutButton.disabled = false
  }
}

isolationButton.addEventListener('click', () => {
  void runIsolationProbe()
})
timeoutButton.addEventListener('click', () => {
  void runTimeoutProbe()
})
