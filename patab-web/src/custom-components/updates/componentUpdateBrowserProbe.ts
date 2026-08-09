import {
  getActiveComponentVersion,
  getRollbackComponentVersion,
  installComponentPackage,
} from '@/custom-components/repository/componentPackageRepository'
import { getInstanceStorageValue, setInstanceStorageValue } from '@/custom-components/repository/instanceStorageRepository'
import { Mv3SandboxAdapter, WebSandboxAdapter } from '@/custom-components/runtime/sandboxAdapter'
import { SandboxRuntime } from '@/custom-components/runtime/sandboxRuntime'
import { createComponentUpdateId, executeComponentUpdate } from '@/custom-components/updates/componentUpdateService'

/** 浏览器验收页的脱敏结果；仅记录版本与布尔状态，不展示 component HTML、私有值或错误堆栈。 */
interface ComponentUpdateProbeReport {
  readonly environment: 'mv3' | 'web'
  readonly activeVersion: string | undefined
  readonly rollbackVersion: string | undefined
  readonly failedUpdatePreserved: boolean
  readonly storagePreserved: boolean
  readonly status: 'failed' | 'passed'
}

/** 读取验收页必需元素，结构意外变化时失败而不是输出伪通过结果。 */
function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error('组件更新验收页缺少必要节点。')
  return element
}

const runButton = requireElement<HTMLButtonElement>('#run-component-update')
const resultElement = requireElement<HTMLPreElement>('#result')
const sandboxHost = requireElement<HTMLDivElement>('#update-sandbox-host')

/** 判断当前探针是否在真实 MV3 扩展页，选择固定 sandbox page 薄适配器。 */
function isMv3Page(): boolean {
  return window.location.protocol === 'chrome-extension:'
}

/** 创建一次性组件 ID，避免浏览器 IndexedDB 内的历史验收包相互冲突。 */
function createComponentId(): string {
  return `com.patab.updateprobe${crypto.randomUUID().replaceAll('-', '')}`
}

/** 创建会在 bootstrap 连接后确认 migration 完成的自包含 surface。 */
function createMigrationSurface(complete: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration probe</title></head><body><main>migration</main><script>
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'patab:sandbox-connect' || !${complete ? 'true' : 'false'}) return
  const port = window.__PATAB_WIDGET_PORT__
  if (!port) return
  port.postMessage({ protocol: 'patab-widget', apiVersion: 1, sessionId: event.data.token, requestId: 'migration-complete', method: 'migration.complete', params: {} })
})
</script></body></html>`
}

/** 创建仅依赖 Runtime bootstrap 的自包含 widget，离屏健康检查只验证真实握手成功。 */
function createWidgetSurface(version: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Widget probe</title></head><body><main>widget-${version}</main></body></html>`
}

/** 根据版本和 migration 行为生成最小已验证包输入，避免验收页绕开生产 Repository/Runtime 事务。 */
function createPackage(componentId: string, version: string, migration?: boolean, migrationCompletes?: boolean) {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: componentId,
      version,
      name: { default: 'Component update probe' },
      description: { default: 'Component update probe' },
      developer: { default: 'PaTab' },
      surfaces: {
        widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } },
        ...(migration ? { migration: { entry: 'surfaces/migration.html' as const, title: { default: 'Migration' } } } : {}),
      },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    files: [
      { path: 'surfaces/widget.html', content: createWidgetSurface(version) },
      ...(migration ? [{ path: 'surfaces/migration.html', content: createMigrationSurface(migrationCompletes === true) }] : []),
      { path: 'assets/icon.png', content: new Blob(['probe'], { type: 'image/png' }) },
    ],
  }
}

/** 创建当前环境严格允许的 Adapter，不让探针自行分叉 iframe 或 session 实现。 */
function createAdapter() {
  return isMv3Page()
    ? new Mv3SandboxAdapter({ document, mv3SandboxPageUrl: '/custom-component-sandbox.html' })
    : new WebSandboxAdapter({ document })
}

/** 将稳定验收报告写回页面，方便 Web 与 MV3 自动化读取而无需控制台原始异常。 */
function showResult(report: ComponentUpdateProbeReport | { readonly environment: string; readonly status: 'running' }): void {
  resultElement.textContent = JSON.stringify(report, null, 2)
}

/**
 * 真实执行成功更新与超时失败更新，验证旧回滚包和活动数据仍可恢复。
 *
 * 第二次 migration 故意不发送完成信号，因此严格走五秒 Runtime 超时与 staged 清理路径；
 * 它不是生产故障模拟接口，也不会读取或显示任何第三方私有数据。
 */
async function runComponentUpdateProbe(): Promise<void> {
  runButton.disabled = true
  sandboxHost.replaceChildren()
  const environment = isMv3Page() ? 'mv3' : 'web'
  showResult({ status: 'running', environment })
  const componentId = createComponentId()
  const instanceId = crypto.randomUUID()
  const runtime = new SandboxRuntime({ adapter: createAdapter() })
  try {
    const initial = createPackage(componentId, '1.0.0')
    await installComponentPackage({ ...initial, grantedPermissions: [], grantedNetworkOrigins: [] })
    await setInstanceStorageValue({ componentId, instanceId }, 'probe', { preserved: true })
    const successful = createPackage(componentId, '1.1.0', true, true)
    await executeComponentUpdate({
      updateId: createComponentUpdateId(componentId),
      ...successful,
      grantedPermissions: [],
      grantedNetworkOrigins: [],
      instanceIds: [instanceId],
    }, { runtime })
    const failing = createPackage(componentId, '1.2.0', true, false)
    let failedUpdatePreserved = false
    try {
      await executeComponentUpdate({
        updateId: createComponentUpdateId(componentId),
        ...failing,
        grantedPermissions: [],
        grantedNetworkOrigins: [],
        instanceIds: [instanceId],
      }, { runtime })
    } catch {
      failedUpdatePreserved = true
    }
    const [active, rollback, value] = await Promise.all([
      getActiveComponentVersion(componentId),
      getRollbackComponentVersion(componentId),
      getInstanceStorageValue({ componentId, instanceId }, 'probe'),
    ])
    const report: ComponentUpdateProbeReport = {
      environment,
      activeVersion: active?.version,
      rollbackVersion: rollback?.version,
      failedUpdatePreserved,
      storagePreserved: (value as { preserved?: unknown } | undefined)?.preserved === true,
      status: active?.version === '1.1.0'
        && rollback?.version === '1.0.0'
        && failedUpdatePreserved
        && (value as { preserved?: unknown } | undefined)?.preserved === true
        ? 'passed'
        : 'failed',
    }
    showResult(report)
  } catch {
    showResult({ status: 'failed', environment, activeVersion: undefined, rollbackVersion: undefined, failedUpdatePreserved: false, storagePreserved: false })
  } finally {
    runtime.destroyAll()
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  void runComponentUpdateProbe()
})
