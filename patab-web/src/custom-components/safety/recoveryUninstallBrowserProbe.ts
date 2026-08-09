import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'

import CustomWidgetHost from '@/components/custom-components/CustomWidgetHost.vue'
import {
  getInstalledComponent,
  installComponentPackage,
} from '@/custom-components/repository/componentPackageRepository'
import {
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from '@/custom-components/repository/customComponentDatabase'
import { uninstallComponentPackage } from '@/custom-components/repository/componentUninstallRepository'
import { getInstanceStorageValue, setInstanceStorageValue } from '@/custom-components/repository/instanceStorageRepository'
import { getRuntimeHealth, recordRuntimeFailure } from '@/custom-components/repository/runtimeHealthRepository'
import { SandboxAdapterError } from '@/custom-components/runtime/protocol'
import { Mv3SandboxAdapter, WebSandboxAdapter, type SandboxAdapter, type SandboxMountRequest } from '@/custom-components/runtime/sandboxAdapter'
import { SandboxRuntime } from '@/custom-components/runtime/sandboxRuntime'
import {
  beginCustomComponentBoot,
  CUSTOM_COMPONENT_SAFETY_STORAGE_KEY,
  exitCustomComponentSafeMode,
  recoverInterruptedCustomComponentBoot,
} from '@/custom-components/safety/customComponentSafetyState'
import { createCustomComponentUninstallActions } from '@/stores/customComponentUninstall'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { i18n } from '@/i18n'
import type { CustomWidgetTile } from '@/types'

import { createRuntimeHealthReporter } from './runtimeHealthReporter'

/** 浏览器验收报告只包含恢复策略的布尔结论与安全模式 iframe 数量，避免泄露组件正文或私有数据。 */
interface RecoveryUninstallProbeReport {
  readonly environment: 'mv3' | 'web'
  readonly handshakeFailuresAutoDisabled: boolean
  readonly protocolFloodAutoDisabled: boolean
  /** 洪泛每轮等待结束时实际落库的连续失败数，便于验收失败时定位而不展示任何载荷。 */
  readonly protocolFloodObservedCounts: readonly number[]
  /** Broker 脱敏诊断类别，仅用于确认探针是否到达真实端口限流边界。 */
  readonly protocolFloodDiagnostics: readonly string[]
  readonly interruptedBootSafeMode: boolean
  readonly safeModeIframeCount: number
  readonly uninstallCancelPreserved: boolean
  readonly uninstallConfirmedAtomically: boolean
  readonly status: 'failed' | 'passed'
}

/** 获取验收页节点；页面结构被意外修改时中止而非输出伪通过。 */
function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error('恢复与卸载验收页缺少必要节点。')
  return element
}

const runButton = requireElement<HTMLButtonElement>('#run-recovery-uninstall')
const resultElement = requireElement<HTMLPreElement>('#result')
const sandboxHost = requireElement<HTMLDivElement>('#recovery-uninstall-sandbox-host')
const safeModeWidgetHost = requireElement<HTMLDivElement>('#safe-mode-widget-host')

/** 判断当前页面是否由真实 MV3 扩展页加载，以便只使用固定 Manifest sandbox 页。 */
function isMv3Page(): boolean {
  return window.location.protocol === 'chrome-extension:'
}

/** 创建每次浏览器验收独有的组件 ID，避免 IndexedDB 中历史探针干扰计数。 */
function createComponentId(suffix: string): string {
  return `com.patab.recovery${suffix}${crypto.randomUUID().replaceAll('-', '')}`
}

/** 生成最小已验证包；普通 surface 使用注入 bootstrap，洪泛 surface 仅通过已握手端口发起 RPC。 */
function createPackage(componentId: string, flood: boolean = false) {
  const surface = flood ? createFloodSurface() : '<!doctype html><html><body><main>recovery probe</main></body></html>'
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: componentId,
      version: '1.0.0',
      name: { default: 'Recovery probe' },
      description: { default: 'Recovery and uninstall probe' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    grantedPermissions: [],
    grantedNetworkOrigins: [],
    files: [
      { path: 'surfaces/widget.html', content: surface },
      { path: 'assets/icon.png', content: new Blob(['probe'], { type: 'image/png' }) },
    ],
  }
}

/** 创建连续请求 103 次的第三方 surface；它不访问宿主数据，只触发既有 Broker 洪泛防护。 */
function createFloodSurface(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Flood probe</title></head><body><main>flood</main><script>
(() => {
  let started = false
  window.addEventListener('message', (event) => {
    if (started || event.source !== window.parent || event.data?.type !== 'patab:sandbox-connect') return
    started = true
    const sessionId = event.data.token
    window.setTimeout(() => {
      const port = window.__PATAB_WIDGET_PORT__
      if (!port) return
      let index = 0
      const send = () => {
        if (index >= 103) return
        const requestId = 'recovery-flood-' + index
        index += 1
        port.postMessage({ protocol: 'patab-widget', apiVersion: 1, sessionId, requestId, method: 'context.get', params: {} })
      }
      port.onmessage = (response) => {
        if (typeof response.data?.requestId === 'string' && response.data.requestId.startsWith('recovery-flood-')) send()
      }
      port.start()
      send()
    }, 100)
  })
})()
</script></body></html>`
}

/** 创建当前环境的生产 Adapter，Web 与 MV3 均经真实 iframe、CSP 与两段握手路径运行。 */
function createProductionAdapter(): SandboxAdapter {
  return isMv3Page()
    ? new Mv3SandboxAdapter({ document, mv3SandboxPageUrl: '/custom-component-sandbox.html' })
    : new WebSandboxAdapter({ document })
}

/** 创建会在真实浏览器 DOM 中留下无 bootstrap iframe 的超时替身，用来覆盖 Runtime 的握手失败恢复分支。 */
function createHandshakeTimeoutAdapter(): SandboxAdapter {
  return {
    environment: isMv3Page() ? 'mv3' : 'web',
    async mount(request: SandboxMountRequest) {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.srcdoc = '<!doctype html><html><body><main>handshake timeout probe</main></body></html>'
      request.container.append(frame)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25))
      frame.remove()
      throw new SandboxAdapterError('handshake-timeout')
    },
  }
}

/** 在有限时间内轮询异步条件，浏览器事件未结算时返回 false 而不抛出原始异常。 */
async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number = 2_500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25))
  }
  return predicate()
}

/** 等待指定实例的健康计数落库，确保下一轮 Runtime 启动不会与前一轮 IndexedDB 事务竞争。 */
async function waitForHealthCount(componentId: string, instanceId: string, count: number): Promise<boolean> {
  return waitUntil(async () => (await getRuntimeHealth(componentId, instanceId))?.consecutiveFailures === count)
}

/** 在同一实例真实执行三轮握手超时，验证第三次失败会通知宿主自动停用。 */
async function verifyHandshakeFailureAutoDisable(): Promise<boolean> {
  const componentId = createComponentId('timeout')
  const instanceId = crypto.randomUUID()
  let autoDisabledCount = 0
  const runtime = new SandboxRuntime({
    adapter: createHandshakeTimeoutAdapter(),
    health: createRuntimeHealthReporter(),
    onInstanceAutoDisabled: () => { autoDisabledCount += 1 },
  })
  try {
    await installComponentPackage(createPackage(componentId))
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await runtime.start({ componentId, instanceId, surface: 'widget', container: sandboxHost }).catch(() => undefined)
      if (!await waitForHealthCount(componentId, instanceId, attempt)) return false
    }
    const health = await getRuntimeHealth(componentId, instanceId)
    return autoDisabledCount === 1
      && health?.disabledReason === 'handshake-timeout'
      && sandboxHost.querySelectorAll('iframe').length === 0
  } finally {
    runtime.destroyAll()
    await uninstallComponentPackage(componentId).catch(() => undefined)
  }
}

/** 在同一实例真实运行三轮 sandbox RPC 洪泛，验证 Broker 销毁与健康停用会共同生效。 */
async function verifyProtocolFloodAutoDisable(): Promise<{
  readonly passed: boolean
  readonly observedCounts: readonly number[]
  readonly diagnostics: readonly string[]
}> {
  const componentId = createComponentId('flood')
  const instanceId = crypto.randomUUID()
  let autoDisabledCount = 0
  const observedCounts: number[] = []
  const diagnostics: string[] = []
  const runtime = new SandboxRuntime({
    adapter: createProductionAdapter(),
    health: createRuntimeHealthReporter(),
    onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic) },
    onInstanceAutoDisabled: () => { autoDisabledCount += 1 },
  })
  try {
    await installComponentPackage(createPackage(componentId, true))
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await runtime.start({ componentId, instanceId, surface: 'widget', container: sandboxHost })
      const settled = await waitForHealthCount(componentId, instanceId, attempt)
      observedCounts.push((await getRuntimeHealth(componentId, instanceId))?.consecutiveFailures ?? 0)
      if (!settled) return { passed: false, observedCounts, diagnostics }
    }
    const health = await getRuntimeHealth(componentId, instanceId)
    return {
      passed: autoDisabledCount === 1
        && health?.disabledReason === 'protocol-flood'
        && sandboxHost.querySelectorAll('iframe').length === 0,
      observedCounts,
      diagnostics,
    }
  } finally {
    runtime.destroyAll()
    await uninstallComponentPackage(componentId).catch(() => undefined)
  }
}

/** 连续模拟三次未清理启动后挂载真实 Widget 宿主，确认安全模式不创建任何第三方 iframe。 */
async function verifyInterruptedBootSafeMode(): Promise<{ readonly safeMode: boolean; readonly iframeCount: number }> {
  const componentId = createComponentId('safe')
  localStorage.removeItem(CUSTOM_COMPONENT_SAFETY_STORAGE_KEY)
  let app: ReturnType<typeof createApp> | undefined
  try {
    await installComponentPackage(createPackage(componentId))
    for (let attempt = 0; attempt < 3; attempt += 1) {
      beginCustomComponentBoot(localStorage, attempt + 1)
      recoverInterruptedCustomComponentBoot(localStorage)
    }
    const pinia = createPinia()
    const safety = useCustomComponentSafetyStore(pinia)
    safety.beginInitialBoot()
    const tile: CustomWidgetTile = {
      id: `safe-tile-${crypto.randomUUID()}`,
      type: 'widget',
      widgetType: 'custom',
      componentId,
      instanceId: crypto.randomUUID(),
      size: { w: 2, h: 2 },
    }
    app = createApp({ render: () => h(CustomWidgetHost, { tile }) })
    app.use(pinia).use(i18n).mount(safeModeWidgetHost)
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100))
    const state = recoverInterruptedCustomComponentBoot(localStorage)
    return {
      safeMode: state.globalSafeMode,
      iframeCount: safeModeWidgetHost.querySelectorAll('iframe').length,
    }
  } finally {
    app?.unmount()
    safeModeWidgetHost.replaceChildren()
    exitCustomComponentSafeMode(localStorage)
    localStorage.removeItem(CUSTOM_COMPONENT_SAFETY_STORAGE_KEY)
    await uninstallComponentPackage(componentId).catch(() => undefined)
  }
}

/** 等待 IndexedDB 事务提交，避免浏览器探针读取到仍在队列中的删除前快照。 */
function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(new Error('验收数据事务已回滚。'))
    transaction.onerror = () => undefined
  })
}

/** 写入活动包以外的回滚版本与 staged 数据，确保浏览器验收覆盖完整卸载事务范围。 */
async function seedUninstallFootprint(componentId: string, instanceId: string): Promise<void> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction([
      CUSTOM_COMPONENT_STORE_VERSIONS,
      CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
    ], 'readwrite')
    transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).put({
      componentId,
      version: '0.9.0',
      isActive: false,
      isRollback: true,
      stagedUpdateId: 'recovery-uninstall-staged',
      installedAt: 1,
    })
    transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).put({
      updateId: 'recovery-uninstall-staged',
      instanceId,
      key: 'probe',
      value: { staged: true },
      serializedBytes: 16,
      updatedAt: 1,
    })
    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

/** 读取组件范围内剩余记录数，确认删除后不遗留私有数据、健康或 staged 临时快照。 */
async function countUninstallFootprint(componentId: string): Promise<readonly number[]> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction([
      CUSTOM_COMPONENT_STORE_VERSIONS,
      CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
      CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
      CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
    ], 'readonly')
    const componentRange = IDBKeyRange.bound([componentId, ''], [componentId, '\uffff'])
    const stagedRange = IDBKeyRange.bound(['recovery-uninstall-staged', '', ''], ['recovery-uninstall-staged', '\uffff', '\uffff'])
    const requests = [
      transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).count(componentRange),
      transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).count(componentRange),
      transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).count(componentRange),
      transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).count(stagedRange),
    ]
    return Promise.all(requests.map((request) => new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('验收删除范围读取失败。'))
    })))
  } finally {
    database.close()
  }
}

/** 经 Store 的预览、取消和二次确认入口执行完整卸载，验证取消无写入、确认后原子清理所有足迹。 */
async function verifyUninstallCancelAndConfirm(): Promise<{ readonly cancelPreserved: boolean; readonly confirmedAtomically: boolean }> {
  const componentId = createComponentId('uninstall')
  const instanceId = crypto.randomUUID()
  const actions = createCustomComponentUninstallActions({ refreshInstalledComponents: async () => undefined })
  let referencesRemovedFor: string | undefined
  try {
    await installComponentPackage(createPackage(componentId))
    await setInstanceStorageValue({ componentId, instanceId }, 'probe', { private: true })
    await recordRuntimeFailure(componentId, instanceId, 'protocol-flood')
    await seedUninstallFootprint(componentId, instanceId)

    const previewOpened = await actions.requestUninstall(componentId, 1)
    actions.cancelUninstall()
    const cancelPreserved = previewOpened
      && (await getInstalledComponent(componentId)) !== undefined
      && (await getInstanceStorageValue({ componentId, instanceId }, 'probe')) !== undefined
      && (await getRuntimeHealth(componentId, instanceId)) !== undefined

    const secondPreviewOpened = await actions.requestUninstall(componentId, 1)
    const confirmed = await actions.confirmUninstall((removedComponentId) => { referencesRemovedFor = removedComponentId })
    const [component, privateValue, health, footprint] = await Promise.all([
      getInstalledComponent(componentId),
      getInstanceStorageValue({ componentId, instanceId }, 'probe'),
      getRuntimeHealth(componentId, instanceId),
      countUninstallFootprint(componentId),
    ])
    return {
      cancelPreserved,
      confirmedAtomically: secondPreviewOpened
        && confirmed
        && referencesRemovedFor === componentId
        && component === undefined
        && privateValue === undefined
        && health === undefined
        && footprint.every((count) => count === 0),
    }
  } finally {
    await uninstallComponentPackage(componentId).catch(() => undefined)
  }
}

/** 将脱敏验收报告写到页面，便于 Web 与 MV3 自动化读取稳定结论。 */
function showResult(report: RecoveryUninstallProbeReport | { readonly environment: string; readonly status: 'running' }): void {
  resultElement.textContent = JSON.stringify(report, null, 2)
}

/** 依次运行恢复和卸载验收；每个探针都清理自身 package、安全状态与 iframe，不污染正常 PaTab 启动。 */
async function runRecoveryUninstallProbe(): Promise<void> {
  runButton.disabled = true
  sandboxHost.replaceChildren()
  safeModeWidgetHost.replaceChildren()
  const environment = isMv3Page() ? 'mv3' : 'web'
  showResult({ environment, status: 'running' })
  try {
    const handshakeFailuresAutoDisabled = await verifyHandshakeFailureAutoDisable()
    const flood = await verifyProtocolFloodAutoDisable()
    const safeMode = await verifyInterruptedBootSafeMode()
    const uninstall = await verifyUninstallCancelAndConfirm()
    const report: RecoveryUninstallProbeReport = {
      environment,
      handshakeFailuresAutoDisabled,
      protocolFloodAutoDisabled: flood.passed,
      protocolFloodObservedCounts: flood.observedCounts,
      protocolFloodDiagnostics: flood.diagnostics,
      interruptedBootSafeMode: safeMode.safeMode,
      safeModeIframeCount: safeMode.iframeCount,
      uninstallCancelPreserved: uninstall.cancelPreserved,
      uninstallConfirmedAtomically: uninstall.confirmedAtomically,
      status: handshakeFailuresAutoDisabled
        && flood.passed
        && safeMode.safeMode
        && safeMode.iframeCount === 0
        && uninstall.cancelPreserved
        && uninstall.confirmedAtomically
        ? 'passed'
        : 'failed',
    }
    showResult(report)
  } catch {
    showResult({
      environment,
      handshakeFailuresAutoDisabled: false,
      protocolFloodAutoDisabled: false,
      protocolFloodObservedCounts: [],
      protocolFloodDiagnostics: [],
      interruptedBootSafeMode: false,
      safeModeIframeCount: -1,
      uninstallCancelPreserved: false,
      uninstallConfirmedAtomically: false,
      status: 'failed',
    })
  } finally {
    sandboxHost.replaceChildren()
    safeModeWidgetHost.replaceChildren()
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  void runRecoveryUninstallProbe()
})
