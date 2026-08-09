import { createApp } from 'vue'

import CustomComponentFeedbackHost from '@/components/custom-components/CustomComponentFeedbackHost.vue'
import { installComponentPackage } from '@/custom-components/repository/componentPackageRepository'
import { i18n } from '@/i18n'
import '@/index.css'
import { SandboxRuntime } from './sandboxRuntime'
import { Mv3SandboxAdapter, WebSandboxAdapter } from './sandboxAdapter'

/** 浏览器人工验收页展示的最小隔离报告，不包含 token、端口、HTML 或宿主异常。 */
interface RuntimeSandboxProbeReport {
  readonly type: 'patab:runtime-sandbox-report'
  readonly chromeApiAccessible: boolean
  readonly directFetchBlocked: boolean
  readonly externalScriptBlocked: boolean
  readonly localStorageAccessible: boolean
  readonly parentDomAccessible: boolean
  readonly baseCapabilities: {
    readonly contextAvailable: boolean
    readonly storageRoundTrip: boolean
    readonly channelRoundTrip: boolean
    readonly hostFeedbackCancelled: boolean
  }
}

/** 获取浏览器验收页必需的节点，结构被改坏时立即报错而不是显示伪通过结果。 */
function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error('Runtime 沙箱验收页缺少必要节点。')
  return element
}

const runButton = requireElement<HTMLButtonElement>('#run-runtime-sandbox')
const resultElement = requireElement<HTMLPreElement>('#result')
const sandboxHost = requireElement<HTMLDivElement>('#sandbox-host')
const feedbackHost = requireElement<HTMLDivElement>('#component-feedback-host')
createApp(CustomComponentFeedbackHost).use(i18n).mount(feedbackHost)

/** 将浏览器验收状态写入页面，避免人工检查依赖控制台的非持久信息。 */
function showResult(value: unknown): void {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/** 判断当前页是否属于 MV3 扩展，确保仅该环境使用固定 Manifest sandbox page。 */
function isMv3Page(): boolean {
  return window.location.protocol === 'chrome-extension:'
}

/** 为当前验收运行生成唯一组件标识，避免 IndexedDB 中的历史测试包导致安装冲突。 */
function createComponentId(): string {
  return `com.patab.runtimeprobe${crypto.randomUUID().replaceAll('-', '')}`
}

/**
 * 生成实际运行在第三方 iframe 内的自包含 surface。
 *
 * 它只探测浏览器沙箱/CSP 结果，并通过已验证的 MessagePort 调用验收专用方法回报布尔值；不读取宿主业务状态、localStorage 内容或扩展对象。
 */
function createProbeSurfaceHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Runtime probe</title></head><body><main>运行中</main><script>
(() => {
  function canAccess(action) {
    try { action(); return true } catch { return false }
  }
  function waitForExternalScript() {
    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://runtime-probe.invalid/external.js'
      script.onload = () => resolve(false)
      script.onerror = () => resolve(true)
      document.head.append(script)
    })
  }
  function createRpcClient(port, sessionId) {
    let sequence = 0
    let channelMessageReceived = false
    const pending = new Map()
    port.onmessage = (event) => {
      const message = event.data
      if (message?.event === 'channelMessage' && message.payload?.message?.type === 'runtime-probe') {
        channelMessageReceived = true
        return
      }
      const resolve = pending.get(message?.requestId)
      if (!resolve) return
      pending.delete(message.requestId)
      resolve(message)
    }
    function request(method, params) {
      return new Promise((resolve, reject) => {
        const requestId = 'runtime-probe-' + sequence
        sequence += 1
        const timeout = window.setTimeout(() => {
          pending.delete(requestId)
          reject(new Error('Runtime 基础 API 响应超时。'))
        }, 2_000)
        pending.set(requestId, (response) => {
          window.clearTimeout(timeout)
          resolve(response)
        })
        port.postMessage({ protocol: 'patab-widget', apiVersion: 1, sessionId, requestId, method, params })
      })
    }
    return { request, hasChannelMessage: () => channelMessageReceived }
  }
  async function runBaseCapabilityProbe(sessionId) {
    const port = window.__PATAB_WIDGET_PORT__
    if (!port) return {
      contextAvailable: false,
      storageRoundTrip: false,
      channelRoundTrip: false,
      hostFeedbackCancelled: false,
    }
    try {
      const client = createRpcClient(port, sessionId)
      const context = await client.request('context.get', {})
      const storageSet = await client.request('storage.set', { key: 'runtime-probe', value: { verified: true } })
      const storageGet = await client.request('storage.get', { key: 'runtime-probe' })
      const subscribed = await client.request('channel.subscribe', {})
      const published = await client.request('channel.publish', { message: { type: 'runtime-probe' } })
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const toast = await client.request('ui.toast', { message: 'Runtime 基础 API 提示' })
      const confirmation = await client.request('ui.confirm', { message: 'Runtime 基础 API 确认' })
      return {
        contextAvailable: context?.ok === true
          && typeof context.result?.instanceId === 'string'
          && context.result?.surface === 'widget',
        storageRoundTrip: storageSet?.ok === true
          && storageGet?.ok === true
          && storageGet.result?.found === true
          && storageGet.result?.value?.verified === true,
        channelRoundTrip: subscribed?.ok === true && published?.ok === true && client.hasChannelMessage(),
        hostFeedbackCancelled: toast?.ok === true
          && confirmation?.ok === true
          && confirmation.result?.confirmed === false,
      }
    } catch {
      return {
        contextAvailable: false,
        storageRoundTrip: false,
        channelRoundTrip: false,
        hostFeedbackCancelled: false,
      }
    }
  }
  function runProbe(sessionId) {
    Promise.all([
      fetch('https://runtime-probe.invalid/direct-fetch', { mode: 'no-cors' }).then(() => false, () => true),
      waitForExternalScript(),
      runBaseCapabilityProbe(sessionId),
    ]).then(([directFetchBlocked, externalScriptBlocked, baseCapabilities]) => {
      const report = {
        type: 'patab:runtime-sandbox-report',
        parentDomAccessible: canAccess(() => window.parent.document.documentElement),
        localStorageAccessible: canAccess(() => window.localStorage.getItem('__patab_runtime_probe__')),
        chromeApiAccessible: typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function',
        directFetchBlocked,
        externalScriptBlocked,
        baseCapabilities,
      }
      window.__PATAB_WIDGET_PORT__?.postMessage({
        protocol: 'patab-widget',
        apiVersion: 1,
        sessionId,
        requestId: 'runtime-probe-report',
        method: 'probe.report',
        params: report,
      })
    })
  }
  window.addEventListener('message', (event) => {
    if (event.source === window.parent && event.data?.type === 'patab:sandbox-connect') {
      window.setTimeout(() => runProbe(event.data.token), 0)
    }
  })
})()
</script></body></html>`
}

/** 将未知 Broker 参数收窄为本页可验证的沙箱报告，拒绝缺字段或错误类型的伪造消息。 */
function parseProbeReport(value: unknown): RuntimeSandboxProbeReport | undefined {
  if (!value || typeof value !== 'object') return undefined
  const report = value as Partial<RuntimeSandboxProbeReport>
  if (report.type !== 'patab:runtime-sandbox-report'
    || typeof report.parentDomAccessible !== 'boolean'
    || typeof report.localStorageAccessible !== 'boolean'
    || typeof report.chromeApiAccessible !== 'boolean'
    || typeof report.directFetchBlocked !== 'boolean'
    || typeof report.externalScriptBlocked !== 'boolean'
    || typeof report.baseCapabilities?.contextAvailable !== 'boolean'
    || typeof report.baseCapabilities?.storageRoundTrip !== 'boolean'
    || typeof report.baseCapabilities?.channelRoundTrip !== 'boolean'
    || typeof report.baseCapabilities?.hostFeedbackCancelled !== 'boolean') {
    return undefined
  }
  return report as RuntimeSandboxProbeReport
}

/** 创建当前环境允许的薄适配器；MV3 固定页地址必须是内置资源，不允许第三方传入。 */
function createAdapter() {
  return isMv3Page()
    ? new Mv3SandboxAdapter({ document, mv3SandboxPageUrl: '/custom-component-sandbox.html' })
    : new WebSandboxAdapter({ document })
}

/**
 * 安装一次最小已验证测试包、启动生产 Runtime，并只经已握手 Broker 接收隔离报告。
 *
 * 该验收不测试任何业务 Capability，专注阶段 5 的执行、CSP、端口和环境隔离边界。
 */
async function runRuntimeProbe(): Promise<void> {
  runButton.disabled = true
  sandboxHost.replaceChildren()
  showResult({ status: 'running', environment: isMv3Page() ? 'mv3' : 'web' })
  const componentId = createComponentId()
  let resolveReport: ((report: RuntimeSandboxProbeReport) => void) | undefined
  const reportPromise = new Promise<RuntimeSandboxProbeReport>((resolve) => {
    resolveReport = resolve
  })
  const runtime = new SandboxRuntime({
    adapter: createAdapter(),
    methods: {
      'probe.report': {
        validateParams: (params) => parseProbeReport(params)
          ? undefined
          : { code: 'INVALID_ARGUMENT', message: 'Runtime 验收报告格式无效。' },
        invoke: (params) => {
          const report = parseProbeReport(params)
          if (report) resolveReport?.(report)
        },
      },
    },
  })

  try {
    await installComponentPackage({
      manifest: {
        schemaVersion: 1,
        apiVersion: '1',
        id: componentId,
        version: '1.0.0',
        name: { default: 'Runtime probe' },
        description: { default: 'Runtime probe' },
        developer: { default: 'PaTab' },
        surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Runtime probe' } } },
        sizes: [{ w: 2, h: 2 }],
        defaultSize: { w: 2, h: 2 },
        assets: { icon: 'assets/icon.png' },
      },
      integrity: { schemaVersion: 1, algorithm: 'sha256', files: [] },
      grantedPermissions: [],
      files: [
        { path: 'surfaces/widget.html', content: createProbeSurfaceHtml() },
        { path: 'assets/icon.png', content: new Blob(['probe'], { type: 'image/png' }) },
      ],
    })
    const handle = await runtime.start({
      componentId,
      instanceId: crypto.randomUUID(),
      surface: 'widget',
      container: sandboxHost,
    })
    const report = await Promise.race([
      reportPromise,
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Runtime 沙箱探测未收到隔离报告。')), 5_000)),
    ])
    const passed = !report.parentDomAccessible
      && !report.localStorageAccessible
      && !report.chromeApiAccessible
      && report.directFetchBlocked
      && report.externalScriptBlocked
      && report.baseCapabilities.contextAvailable
      && report.baseCapabilities.storageRoundTrip
      && report.baseCapabilities.channelRoundTrip
      && report.baseCapabilities.hostFeedbackCancelled
    showResult({ status: passed ? 'passed' : 'failed', environment: isMv3Page() ? 'mv3' : 'web', report })
    handle.destroy()
  } catch {
    showResult({ status: 'failed', environment: isMv3Page() ? 'mv3' : 'web', error: '运行时沙箱验收失败。' })
  } finally {
    runtime.destroyAll()
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  void runRuntimeProbe()
})
