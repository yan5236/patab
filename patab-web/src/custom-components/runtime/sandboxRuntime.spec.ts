import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installComponentPackage } from '@/custom-components/repository/componentPackageRepository'
import type { RuntimeHealthFailureResult } from '@/custom-components/repository/runtimeHealthRepository'
import type { RuntimeHealthReporter } from '@/custom-components/safety/runtimeHealthReporter'
import { stageComponentUpdate } from '@/custom-components/updates/stagedComponentUpdateRepository'
import { getStagedInstanceStorageValue } from '@/custom-components/updates/stagedInstanceStorageRepository'

import { SandboxAdapterError } from './protocol'
import { SandboxRuntime } from './sandboxRuntime'
import type { SandboxAdapter, SandboxMountRequest } from './sandboxAdapter'

/** 创建最小已安装组件包，确保 Runtime 只能从活动 Repository 文件读取实际执行 HTML。 */
function createInstallInput() {
  return {
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.runtime',
      version: '1.0.0',
      name: { default: 'Runtime' },
      description: { default: 'Runtime 测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      assets: { icon: 'assets/icon.png' },
    },
    integrity: { schemaVersion: 1, algorithm: 'sha256', files: [] },
    grantedPermissions: [],
    files: [
      { path: 'surfaces/widget.html', content: '<!doctype html><html><body><main>组件</main></body></html>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  } as Parameters<typeof installComponentPackage>[0]
}

/** 创建 Runtime 可用的适配器替身，只记录最终 HTML 与销毁，不执行第三方脚本。 */
function createAdapter() {
  const port = {
    close: vi.fn(),
    postMessage: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
  const destroy = vi.fn()
  const mount = vi.fn(async (request: SandboxMountRequest) => {
    const frame = document.createElement('iframe')
    request.container.append(frame)
    return { frameElement: frame, port: port as unknown as MessagePort, activate: vi.fn(), destroy }
  })
  const adapter: SandboxAdapter = { environment: 'web', mount }
  return { adapter, mount, destroy, port }
}

/** 创建内存健康报告器，隔离 Runtime 注入边界测试与其他文件的 fake-indexeddb 全局替换。 */
function createInMemoryHealthReporter() {
  let failureCount = 0
  const reporter: RuntimeHealthReporter = {
    async recordFailure({ componentId, instanceId, reason }): Promise<RuntimeHealthFailureResult> {
      failureCount += 1
      return {
        autoDisabled: failureCount >= 3,
        record: {
          componentId,
          instanceId,
          consecutiveFailures: failureCount,
          firstFailedAt: 1,
          lastFailedAt: failureCount,
          lastErrorCode: reason,
          ...(failureCount >= 3 ? { disabledReason: reason } : {}),
        },
      }
    },
    async recordHealthy(): Promise<void> {},
  }
  return { reporter, getFailureCount: () => failureCount }
}

/** 创建包含 migration surface 的高版本包，供 staged Runtime 验证只读取暂存文件与受限方法表。 */
function createStagedUpdateInput() {
  return {
    manifest: {
      ...createInstallInput().manifest,
      version: '1.1.0',
      surfaces: {
        widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } },
        migration: { entry: 'surfaces/migration.html' as const, title: { default: 'Migration' } },
      },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    files: [
      { path: 'surfaces/widget.html', content: '<!doctype html><html><body><main>staged-widget</main></body></html>' },
      { path: 'surfaces/migration.html', content: '<!doctype html><html><body><main>staged-migration</main></body></html>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 每个 Runtime 测试使用独立数据库，避免前一个组件活动版本改变本用例的启动判定。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  document.body.replaceChildren()
  document.documentElement.lang = 'zh-CN'
  document.documentElement.dataset.theme = 'light'
})

/** 覆盖 Runtime 对已安装包、声明 surface、CSP 准备与幂等销毁的编排边界。 */
describe('SandboxRuntime', () => {
  /** 验证 Runtime 可通过只读 Source 与 HTML preparer 启动，而不把 Repository 实现固化在编排类中。 */
  it('通过注入 source 与 preparer 启动同一 Adapter 和 Broker', async () => {
    const adapter = createAdapter()
    const source = {
      loadComponent: vi.fn(async () => ({
        componentId: 'com.example.runtime',
        version: '1.0.0',
        manifest: createInstallInput().manifest,
      })),
      loadSurface: vi.fn(async () => '<!doctype html><html><body>开发 surface</body></html>'),
    }
    const prepareSurface = vi.fn(() => '<!doctype html><html><body>已准备开发 surface</body></html>')
    const runtime = new SandboxRuntime({
      adapter: adapter.adapter,
      source,
      prepareSurface,
      createSessionToken: () => 'source-session',
    })

    await runtime.start({
      componentId: 'com.example.runtime',
      instanceId: 'instance-source',
      surface: 'widget',
      container: document.createElement('div'),
    })

    expect(source.loadComponent).toHaveBeenCalledWith('com.example.runtime')
    expect(source.loadSurface).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.0' }), 'widget')
    expect(prepareSurface).toHaveBeenCalledWith(expect.stringContaining('开发 surface'), expect.objectContaining({
      hostThemeStyle: expect.stringContaining('--pt-'),
    }))
    expect(adapter.mount).toHaveBeenCalledWith(expect.objectContaining({
      surfaceHtml: expect.stringContaining('已准备开发 surface'),
      sessionToken: 'source-session',
    }))
  })

  /** 验证 Runtime 从活动 Repository 文件准备 CSP 后才调用适配器，并把端口留给内部 Broker。 */
  it('仅启动活动包中已声明 surface 的已准备 HTML', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const runtime = new SandboxRuntime({ adapter: adapter.adapter, createSessionToken: () => 'runtime-session' })
    const container = document.createElement('div')

    const handle = await runtime.start({
      componentId: 'com.example.runtime',
      instanceId: 'instance-1',
      surface: 'widget',
      container,
    })

    expect(adapter.mount).toHaveBeenCalledWith(expect.objectContaining({
      sessionToken: 'runtime-session',
      handshakeTimeoutMs: 5_000,
      surfaceHtml: expect.stringContaining("connect-src 'none'"),
    }))
    expect(handle.session).toMatchObject({ componentId: 'com.example.runtime', instanceId: 'instance-1' })
    handle.destroy()
    handle.destroy()
    expect(adapter.destroy).toHaveBeenCalledOnce()
  })

  /** 验证缺包和未声明 surface 在创建 iframe 前拒绝，避免调用方通过 Runtime 执行任意内容。 */
  it('拒绝缺包和未声明 surface 而不调用适配器', async () => {
    const adapter = createAdapter()
    const runtime = new SandboxRuntime({ adapter: adapter.adapter })
    const container = document.createElement('div')

    await expect(runtime.start({
      componentId: 'com.example.missing',
      instanceId: 'instance-1',
      surface: 'widget',
      container,
    })).rejects.toMatchObject({ code: 'INSTANCE_DISABLED' })
    await installComponentPackage(createInstallInput())
    await expect(runtime.start({
      componentId: 'com.example.runtime',
      instanceId: 'instance-1',
      surface: 'settings',
      container,
    })).rejects.toMatchObject({ code: 'SURFACE_NOT_DECLARED' })
    expect(adapter.mount).not.toHaveBeenCalled()
  })

  /** 验证三次握手失败在 24 小时健康窗口内自动停用实例，并保留稳定失败原因。 */
  it('连续三次握手失败后自动停用实例', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const autoDisabled = vi.fn()
    const health = createInMemoryHealthReporter()
    adapter.mount.mockRejectedValue(new SandboxAdapterError('handshake-timeout'))
    const runtime = new SandboxRuntime({
      adapter: adapter.adapter,
      health: health.reporter,
      onInstanceAutoDisabled: autoDisabled,
    })
    const request = {
      componentId: 'com.example.runtime',
      instanceId: 'instance-unhealthy',
      surface: 'widget',
      container: document.createElement('div'),
    }

    await expect(runtime.start(request)).rejects.toMatchObject({ code: 'TIMEOUT' })
    await expect(runtime.start(request)).rejects.toMatchObject({ code: 'TIMEOUT' })
    await expect(runtime.start(request)).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(autoDisabled).toHaveBeenCalledOnce()
    expect(health.getFailureCount()).toBe(3)
  })

  /** 验证三轮持续 RPC 洪泛都会销毁当前 iframe，第三轮沿用同一健康窗口自动停用实例。 */
  it('连续三次协议洪泛后销毁会话并自动停用实例', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const autoDisabled = vi.fn()
    const health = createInMemoryHealthReporter()
    const runtime = new SandboxRuntime({
      adapter: adapter.adapter,
      createSessionToken: () => 'flood-session',
      health: health.reporter,
      onInstanceAutoDisabled: autoDisabled,
    })
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await runtime.start({
        componentId: 'com.example.runtime',
        instanceId: 'instance-flood',
        surface: 'widget',
        container: document.createElement('div'),
      })
      for (let index = 0; index < 103; index += 1) {
        adapter.port.onmessage?.({ data: {
          protocol: 'patab-widget', apiVersion: 1, sessionId: 'flood-session',
          requestId: `flood-${attempt}-${index}`, method: 'context.get', params: {},
        } } as MessageEvent<unknown>)
        await Promise.resolve()
        await Promise.resolve()
      }
      await vi.waitFor(() => expect(adapter.destroy).toHaveBeenCalledTimes(attempt))
      await vi.waitFor(() => expect(health.getFailureCount()).toBe(attempt))
    }

    await vi.waitFor(() => expect(autoDisabled).toHaveBeenCalledOnce())
    expect(health.getFailureCount()).toBe(3)
  })

  /** 验证宿主根节点主题和语言变化会通过既有 Broker 实时同步公开 token，而不重建 sandbox。 */
  it('主题与语言变化实时广播给已运行 surface', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const runtime = new SandboxRuntime({ adapter: adapter.adapter, createSessionToken: () => 'runtime-observer-session' })
    const container = document.createElement('div')

    const handle = await runtime.start({
      componentId: 'com.example.runtime',
      instanceId: 'instance-observer',
      surface: 'widget',
      container,
    })
    adapter.port.postMessage.mockClear()
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.lang = 'en-US'
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(adapter.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      event: 'themeChanged',
      payload: expect.objectContaining({
        theme: 'dark',
        tokens: expect.objectContaining({ values: expect.objectContaining({ '--pt-surface': expect.any(String) }) }),
      }),
    }))
    expect(adapter.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      event: 'localeChanged',
      payload: { locale: 'en-US' },
    }))
    expect(adapter.mount).toHaveBeenCalledOnce()
    handle.destroy()
  })

  /** staged migration 复用现有会话/Broker，但只开放 staged storage、公开迁移上下文和完成信号。 */
  it('在五秒内运行受限 staged migration 而不开放 UI、todos 或网络方法', async () => {
    await installComponentPackage(createInstallInput())
    const staged = createStagedUpdateInput()
    await stageComponentUpdate({ updateId: 'runtime-staged', manifest: staged.manifest, integrity: staged.integrity, files: staged.files })
    const adapter = createAdapter()
    adapter.mount.mockImplementationOnce(async (request) => {
      const frame = document.createElement('iframe')
      request.container.append(frame)
      setTimeout(() => {
        adapter.port.onmessage?.({ data: {
          protocol: 'patab-widget', apiVersion: 1, sessionId: request.sessionToken,
          requestId: 'staged-storage', method: 'storage.set', params: { key: 'migrated', value: { staged: true } },
        } } as MessageEvent<unknown>)
        adapter.port.onmessage?.({ data: {
          protocol: 'patab-widget', apiVersion: 1, sessionId: request.sessionToken,
          requestId: 'migration-context', method: 'migration.getContext', params: {},
        } } as MessageEvent<unknown>)
        adapter.port.onmessage?.({ data: {
          protocol: 'patab-widget', apiVersion: 1, sessionId: request.sessionToken,
          requestId: 'blocked-ui', method: 'ui.toast', params: { message: 'blocked' },
        } } as MessageEvent<unknown>)
      }, 0)
      setTimeout(() => {
        adapter.port.onmessage?.({ data: {
          protocol: 'patab-widget', apiVersion: 1, sessionId: request.sessionToken,
          requestId: 'migration-complete', method: 'migration.complete', params: {},
        } } as MessageEvent<unknown>)
      }, 15)
      return { frameElement: frame, port: adapter.port as unknown as MessagePort, activate: vi.fn(), destroy: adapter.destroy }
    })
    const runtime = new SandboxRuntime({ adapter: adapter.adapter, createSessionToken: () => 'staged-session' })
    const container = document.createElement('div')

    const handle = await runtime.startStagedUpdateSurface({
      componentId: 'com.example.runtime',
      instanceId: 'instance-staged',
      updateId: 'runtime-staged',
      surface: 'migration',
      container,
      oldVersion: '1.0.0',
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(adapter.mount).toHaveBeenCalledWith(expect.objectContaining({
      sessionToken: 'staged-session',
      handshakeTimeoutMs: expect.any(Number),
      surfaceHtml: expect.stringContaining('staged-migration'),
    }))
    expect(adapter.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'migration-context', ok: true, result: { oldVersion: '1.0.0', newVersion: '1.1.0', instanceId: 'instance-staged' },
    }))
    expect(adapter.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'blocked-ui', ok: false, error: expect.objectContaining({ code: 'UNKNOWN_METHOD' }),
    }))
    await expect(getStagedInstanceStorageValue({
      updateId: 'runtime-staged', componentId: 'com.example.runtime', instanceId: 'instance-staged',
    }, 'migrated')).resolves.toEqual({ staged: true })
    handle.destroy()
  })
})
