import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WidgetHostFeedback } from '@/custom-components/capabilities/hostFeedback'
import { installComponentPackage } from '@/custom-components/repository/componentPackageRepository'

import { SandboxRuntime } from './sandboxRuntime'
import type { SandboxAdapter, SandboxMountRequest } from './sandboxAdapter'

/** 创建可观察 RPC 响应与异步事件的最小 MessagePort 替身。 */
function createFakePort() {
  return {
    close: vi.fn(),
    postMessage: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
}

/** 创建支持 widget 与 settings 同实例运行的最小已安装组件包。 */
function createInstallInput() {
  return {
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.base-capabilities',
      version: '1.0.0',
      name: { default: '基础能力' },
      description: { default: '基础能力测试' },
      developer: { default: 'PaTab' },
      surfaces: {
        widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } },
        settings: { entry: 'surfaces/settings.html', title: { default: 'Settings' } },
      },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      defaultVariant: 'default',
      assets: { icon: 'assets/icon.png' },
    },
    integrity: { schemaVersion: 1, algorithm: 'sha256', files: [] },
    grantedPermissions: [],
    files: [
      { path: 'surfaces/widget.html', content: '<!doctype html><html><body>widget</body></html>' },
      { path: 'surfaces/settings.html', content: '<!doctype html><html><body>settings</body></html>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  } as Parameters<typeof installComponentPackage>[0]
}

/** 创建每次 mount 都分配新端口的 Adapter 替身，不执行任何第三方 HTML。 */
function createAdapter() {
  const ports: ReturnType<typeof createFakePort>[] = []
  const adapter: SandboxAdapter = {
    environment: 'web',
    mount: vi.fn(async (request: SandboxMountRequest) => {
      const frameElement = document.createElement('iframe')
      request.container.append(frameElement)
      const port = createFakePort()
      ports.push(port)
      return { frameElement, port: port as unknown as MessagePort, destroy: vi.fn() }
    }),
  }
  return { adapter, ports }
}

/** 读取测试 Adapter 已创建的端口；缺失时立即失败，避免把可选数组元素传入 Broker 断言。 */
function getPort(ports: readonly ReturnType<typeof createFakePort>[], index: number): ReturnType<typeof createFakePort> {
  const port = ports[index]
  if (!port) throw new Error('测试 Adapter 未创建预期 MessagePort。')
  return port
}

/** 创建通过 Broker 端口发送的最小 API v1 RPC 请求。 */
function createRequest(requestId: string, method: string, params: unknown) {
  return {
    protocol: 'patab-widget',
    apiVersion: 1,
    sessionId: 'session-' + (method.includes('settings') ? 'settings' : 'widget'),
    requestId,
    method,
    params,
  }
}

/** 等待 Broker、fake IndexedDB 和 storage 订阅所需的微任务与一次宏任务完成。 */
async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
  await Promise.resolve()
}

/** 向指定端口发送使用实际 sessionId 的请求，并等待其异步分发结束。 */
async function send(
  port: ReturnType<typeof createFakePort>,
  sessionId: string,
  requestId: string,
  method: string,
  params: unknown,
): Promise<void> {
  port.onmessage?.({ data: { ...createRequest(requestId, method, params), sessionId } } as MessageEvent<unknown>)
  await flushAsyncWork()
}

/** 每个集成用例使用全新数据库与 DOM，避免页面级订阅残留影响断言。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  document.body.replaceChildren()
  document.documentElement.lang = 'zh-CN'
  document.documentElement.dataset.theme = 'light'
})

/** 覆盖阶段 6 的 context、存储、实例通道、宿主反馈和外链在同一个 Runtime/Broker 上的集成边界。 */
describe('SandboxRuntime 基础 API 集成', () => {
  /** 验证安装快照、生命周期、跨 surface 存储与 64 KiB 通道均受同一 instanceId 和 Broker 约束。 */
  it('提供公开 context、生命周期、原子 storageChanged 和 widget/modal channel', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const feedback: WidgetHostFeedback = { toast: vi.fn(), confirm: vi.fn(async () => false) }
    const runtime = new SandboxRuntime({
      adapter: adapter.adapter,
      feedback,
      createSessionToken: (() => {
        const tokens = ['widget-session', 'settings-session']
        return () => tokens.shift()!
      })(),
      context: {
        getSnapshot: () => ({ locale: 'en-US', theme: 'dark', reducedMotion: true, visible: true, variantId: 'default' }),
      },
    })
    const container = document.createElement('div')
    const widget = await runtime.start({
      componentId: 'com.example.base-capabilities',
      instanceId: 'shared-instance',
      surface: 'widget',
      container,
    })
    const settings = await runtime.start({
      componentId: 'com.example.base-capabilities',
      instanceId: 'shared-instance',
      surface: 'settings',
      container,
    })
    const widgetPort = getPort(adapter.ports, 0)
    const settingsPort = getPort(adapter.ports, 1)

    await send(widgetPort, widget.session.sessionId, 'context-1', 'context.get', {})
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: true,
      result: expect.objectContaining({
        componentId: 'com.example.base-capabilities',
        instanceId: 'shared-instance',
        surface: 'widget',
        locale: 'en-US',
        theme: 'dark',
        reducedMotion: true,
        visible: true,
      }),
    }))

    expect(runtime.publishInstanceLifecycle('com.example.base-capabilities', 'shared-instance', {
      event: 'sizeChanged',
      payload: { previousSize: { w: 1, h: 1 }, size: { w: 3, h: 2 } },
    })).toBe(2)
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'sizeChanged', payload: { previousSize: { w: 2, h: 2 }, size: { w: 3, h: 2 } },
    }))
    expect(settingsPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'sizeChanged' }))
    expect(runtime.publishInstanceLifecycle('com.example.base-capabilities', 'shared-instance', {
      event: 'themeChanged',
      payload: { theme: 'light', reducedMotion: false },
    })).toBe(2)
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'themeChanged', payload: { theme: 'light', reducedMotion: false },
    }))
    expect(runtime.publishInstanceLifecycle('com.example.base-capabilities', 'shared-instance', {
      event: 'localeChanged',
      payload: { locale: 'zh-CN' },
    })).toBe(2)
    expect(runtime.publishInstanceLifecycle('com.example.base-capabilities', 'shared-instance', {
      event: 'variantChanged',
      payload: { previousVariantId: 'ignored', variantId: 'compact' },
    })).toBe(2)
    expect(settingsPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'variantChanged', payload: { previousVariantId: 'default', variantId: 'compact' },
    }))
    expect(runtime.publishSurfaceLifecycle(widget.session, {
      event: 'visibilityChanged',
      payload: { visible: false },
    })).toBe(true)
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'visibilityChanged', payload: { visible: false },
    }))

    await send(settingsPort, settings.session.sessionId, 'storage-sub-1', 'channel.subscribe', {})
    await send(widgetPort, widget.session.sessionId, 'storage-set-1', 'storage.set', { key: 'mode', value: { compact: true } })
    expect(settingsPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'storageChanged', payload: { key: 'mode', operation: 'set' },
    }))
    await send(settingsPort, settings.session.sessionId, 'storage-get-1', 'storage.get', { key: 'mode' })
    expect(settingsPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: true, result: { found: true, value: { compact: true } },
    }))

    await send(widgetPort, widget.session.sessionId, 'channel-sub-1', 'channel.subscribe', {})
    await send(settingsPort, settings.session.sessionId, 'channel-publish-1', 'channel.publish', { message: { action: 'refresh' } })
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      event: 'channelMessage', payload: { message: { action: 'refresh' } },
    }))

    await send(widgetPort, widget.session.sessionId, 'channel-invalid-1', 'channel.publish', { message: () => undefined })
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    }))
    await send(widgetPort, widget.session.sessionId, 'channel-large-1', 'channel.publish', { message: 'x'.repeat(64 * 1024) })
    expect(widgetPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    }))
    widget.destroy()
    settings.destroy()
  })

  /** 验证 storage 配额拒绝不会写入超限键，且 Repository 错误被映射为既有安全错误码。 */
  it('在超出实例存储配额时保留原数据并返回 QUOTA_EXCEEDED', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const runtime = new SandboxRuntime({ adapter: adapter.adapter, createSessionToken: () => 'quota-session' })
    const handle = await runtime.start({
      componentId: 'com.example.base-capabilities',
      instanceId: 'quota-instance',
      surface: 'widget',
      container: document.createElement('div'),
    })
    const port = getPort(adapter.ports, 0)
    for (let index = 0; index < 4; index += 1) {
      await send(port, handle.session.sessionId, `quota-${index}`, 'storage.set', {
        key: `part-${index}`,
        value: 'x'.repeat(230_000),
      })
      expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }))
    }
    await send(port, handle.session.sessionId, 'quota-overflow', 'storage.set', {
      key: 'overflow',
      value: 'x'.repeat(230_000),
    })
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'QUOTA_EXCEEDED' }),
    }))
    await send(port, handle.session.sessionId, 'quota-read', 'storage.get', { key: 'overflow' })
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true, result: { found: false } }))
    handle.destroy()
  })

  /** 验证 toast 限流、确认取消、非 HTTPS 和缺失用户手势均由 Broker 返回稳定结果而不产生外链副作用。 */
  it('以宿主反馈确认外链，并拒绝无手势或非 HTTPS 请求', async () => {
    await installComponentPackage(createInstallInput())
    const adapter = createAdapter()
    const feedback: WidgetHostFeedback = { toast: vi.fn(), confirm: vi.fn(async () => false) }
    const external = { isUserGestureActive: vi.fn(() => false), open: vi.fn(() => true) }
    const runtime = new SandboxRuntime({
      adapter: adapter.adapter,
      feedback,
      external,
      createSessionToken: () => 'feedback-session',
    })
    const handle = await runtime.start({
      componentId: 'com.example.base-capabilities',
      instanceId: 'feedback-instance',
      surface: 'widget',
      container: document.createElement('div'),
    })
    const port = getPort(adapter.ports, 0)

    for (let index = 0; index < 4; index += 1) {
      await send(port, handle.session.sessionId, `toast-${index}`, 'ui.toast', { message: `提示 ${index}` })
    }
    expect(feedback.toast).toHaveBeenCalledTimes(3)
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'RATE_LIMITED' }),
    }))

    await send(port, handle.session.sessionId, 'external-http', 'ui.openExternal', { url: 'http://example.com' })
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    }))
    await send(port, handle.session.sessionId, 'external-no-gesture', 'ui.openExternal', { url: 'https://example.com/path' })
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    }))

    external.isUserGestureActive.mockReturnValue(true)
    await send(port, handle.session.sessionId, 'external-cancel', 'ui.openExternal', { url: 'https://example.com/path' })
    expect(feedback.confirm).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'external', targetOrigin: 'https://example.com',
    }))
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true, result: { opened: false } }))
    expect(external.open).not.toHaveBeenCalled()
    handle.destroy()
  })
})
