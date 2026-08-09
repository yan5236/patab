import {
  WidgetNetworkAdapterError,
  createMv3WidgetNetworkAdapter,
  createWebWidgetNetworkAdapter,
  removeMv3OriginPermission,
  requestMv3OriginPermission,
} from './networkAdapters'
import { normalizeWidgetNetworkRequest } from './networkPolicy'

/** 验收页使用的固定公开来源；无 Authorization、Cookie 或用户输入，避免探针本身扩大网络能力。 */
const PROBE_ORIGIN = 'https://api.github.com' as const

/** 获取验收页面必需元素，页面结构损坏时立即失败而不显示伪通过结论。 */
function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error('网络 Capability 验收页缺少必要节点。')
  return element
}

const runButton = requireElement<HTMLButtonElement>('#run-network-probe')
const revokeButton = requireElement<HTMLButtonElement>('#revoke-network-permission')
const resultElement = requireElement<HTMLPreElement>('#result')

/** 判断当前验收页是否处于真实 MV3 扩展上下文，避免网页端误调用不存在的 Chrome API。 */
function isMv3Page(): boolean {
  return window.location.protocol === 'chrome-extension:'
}

/** 显示不含响应正文、浏览器异常或授权字段的结构化验收结果，保持探针也遵守生产脱敏边界。 */
function showResult(value: unknown): void {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/** 生成已经过生产策略规范化的固定请求；若静态探针自身失效则安全中止，不继续发送 fetch。 */
function createProbeRequest() {
  const result = normalizeWidgetNetworkRequest({
    url: `${PROBE_ORIGIN}/`,
    method: 'GET',
  })
  return result.valid ? result.request : undefined
}

/** 将适配器公开失败压缩为可比较状态，绝不把原始异常或网络响应内容写入页面。 */
function describeAdapterFailure(error: unknown): { readonly code: string } {
  return { code: error instanceof WidgetNetworkAdapterError ? error.error.code : 'INVALID_REQUEST' }
}

/** 在网页端真实调用生产 Web adapter，CORS 成功与失败都只报告稳定公开结果。 */
async function runWebProbe(): Promise<void> {
  const request = createProbeRequest()
  if (!request) {
    showResult({ status: 'failed', reason: 'invalid-probe-request' })
    return
  }
  try {
    const response = await createWebWidgetNetworkAdapter().execute(request)
    showResult({
      status: 'passed',
      environment: 'web',
      responseStatus: response.status,
      responseBodyBytes: new TextEncoder().encode(response.body).byteLength,
    })
  } catch (error) {
    showResult({ status: 'failed', environment: 'web', error: describeAdapterFailure(error) })
  }
}

/** 在点击手势的同步路径立即申请精确 MV3 来源，再由生产 adapter 执行并复查该授权。 */
async function runMv3Probe(): Promise<void> {
  const request = createProbeRequest()
  if (!request) {
    showResult({ status: 'failed', reason: 'invalid-probe-request' })
    return
  }

  showResult({ status: 'requesting', environment: 'mv3', origin: PROBE_ORIGIN })
  const permissionPromise = requestMv3OriginPermission(PROBE_ORIGIN)
  const granted = await permissionPromise
  if (!granted) {
    showResult({ status: 'denied', environment: 'mv3', origin: PROBE_ORIGIN })
    return
  }

  try {
    const response = await createMv3WidgetNetworkAdapter().execute(request)
    showResult({
      status: 'passed',
      environment: 'mv3',
      origin: PROBE_ORIGIN,
      responseStatus: response.status,
      responseBodyBytes: new TextEncoder().encode(response.body).byteLength,
    })
  } catch (error) {
    showResult({ status: 'failed', environment: 'mv3', error: describeAdapterFailure(error) })
  }
}

/** 撤销精确 MV3 来源后立即复用生产 adapter 调用，只有 fetch 前返回 ORIGIN_NOT_ALLOWED 才算通过。 */
async function revokeMv3ProbePermission(): Promise<void> {
  const request = createProbeRequest()
  if (!request) {
    showResult({ status: 'failed', reason: 'invalid-probe-request' })
    return
  }

  const removed = await removeMv3OriginPermission(PROBE_ORIGIN)
  try {
    await createMv3WidgetNetworkAdapter().execute(request)
    showResult({ status: 'failed', environment: 'mv3', removed, blockedAfterRevoke: false })
  } catch (error) {
    const failure = describeAdapterFailure(error)
    showResult({
      status: removed && failure.code === 'ORIGIN_NOT_ALLOWED' ? 'passed' : 'failed',
      environment: 'mv3',
      removed,
      blockedAfterRevoke: failure.code === 'ORIGIN_NOT_ALLOWED',
    })
  }
}

/** 以显式按钮事件保留 MV3 原生权限气泡所需用户手势，网页端不申请任何浏览器权限。 */
function handleRunProbe(): void {
  runButton.disabled = true
  const task = isMv3Page() ? runMv3Probe() : runWebProbe()
  void task.finally(() => {
    runButton.disabled = false
  })
}

/** 仅在 MV3 页面允许撤销验收，网页端保持无副作用状态。 */
function handleRevokePermission(): void {
  if (!isMv3Page()) return
  revokeButton.disabled = true
  void revokeMv3ProbePermission().finally(() => {
    revokeButton.disabled = false
  })
}

runButton.addEventListener('click', handleRunProbe)
revokeButton.addEventListener('click', handleRevokePermission)
