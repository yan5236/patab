import { describe, expect, it, vi } from 'vitest'

import {
  BROKER_CONCURRENCY_MAX,
  BROKER_REQUEST_LIMIT_PER_WINDOW,
  WidgetCapabilityBroker,
  type WidgetBrokerMethod,
} from './capabilityBroker'

/** 创建可观察 Broker 响应的最小 MessagePort 替身。 */
function createFakePort() {
  return {
    close: vi.fn(),
    postMessage: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
}

/** 创建符合 API v1 的最小请求，调用方可覆盖单个字段验证攻击路径。 */
function createRequest(requestId: string, overrides: Record<string, unknown> = {}) {
  return {
    protocol: 'patab-widget',
    apiVersion: 1,
    sessionId: 'session-1',
    requestId,
    method: 'context.get',
    params: {},
    ...overrides,
  }
}

/** 向 Broker 端口投递消息后让异步 dispatch 处理当前微任务队列。 */
async function send(port: ReturnType<typeof createFakePort>, message: unknown): Promise<void> {
  port.onmessage?.({ data: message } as MessageEvent<unknown>)
  await Promise.resolve()
  await Promise.resolve()
}

/** 创建默认无权限但允许基础方法的 Broker，避免各用例重复配置会话与端口。 */
function createBroker(
  port: ReturnType<typeof createFakePort>,
  methods: Readonly<Record<string, WidgetBrokerMethod>>,
  overrides: Partial<ConstructorParameters<typeof WidgetCapabilityBroker>[0]> = {},
): WidgetCapabilityBroker {
  return new WidgetCapabilityBroker({
    port: port as unknown as MessagePort,
    session: {
      componentId: 'com.example.component',
      componentVersion: '1.0.0',
      instanceId: 'instance-1',
      sessionId: 'session-1',
    },
    permissions: { hasPermission: async () => false },
    methods,
    ...overrides,
  })
}

/** 创建由外部 resolve 控制的 Promise，用于验证并发上限不依赖真实计时。 */
function createDeferred() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve: () => resolve?.() }
}

/** 覆盖 Broker 对 session、重复 ID、体积、权限、限流和并发攻击面的拒绝。 */
describe('WidgetCapabilityBroker', () => {
  /** 验证伪造 session 与重复 requestId 都不会调用领域方法或泄露内部错误。 */
  it('拒绝伪造 session 与重复请求标识', async () => {
    const port = createFakePort()
    const invoke = vi.fn(() => ({ locale: 'zh-CN' }))
    createBroker(port, { 'context.get': { invoke } })

    await send(port, createRequest('forged', { sessionId: 'other-session' }))
    await send(port, createRequest('same-id'))
    await send(port, createRequest('same-id'))

    expect(invoke).toHaveBeenCalledOnce()
    expect(port.postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      requestId: 'forged', ok: false, error: { code: 'INVALID_REQUEST', message: '组件会话无效。' },
    }))
    expect(port.postMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({
      requestId: 'same-id', ok: false, error: { code: 'INVALID_REQUEST', message: '请求标识已使用。', path: 'requestId' },
    }))
  })

  /** 验证超过 256 KiB 的消息在方法查找前被拒绝，且未知方法不会进入任何 Capability。 */
  it('拒绝超限消息与未知方法', async () => {
    const port = createFakePort()
    const invoke = vi.fn()
    createBroker(port, { 'context.get': { invoke } })

    await send(port, createRequest('oversized', { params: { payload: 'x'.repeat(256 * 1024) } }))
    await send(port, createRequest('unknown', { method: 'todos.exfiltrate' }))

    expect(invoke).not.toHaveBeenCalled()
    expect(port.postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'INVALID_REQUEST' }),
    }))
    expect(port.postMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'UNKNOWN_METHOD' }),
    }))
  })

  /** 验证每次 RPC 都动态查询 grant，optional 权限在运行中撤销后立即阻止后续副作用。 */
  it('按实时权限快照拒绝已撤销能力', async () => {
    const port = createFakePort()
    let granted = true
    const invoke = vi.fn(() => ({ items: [] }))
    createBroker(port, {
      'todos.list': { requiredPermissions: ['todos.read'], invoke },
    }, {
      permissions: { hasPermission: async () => granted },
    })

    await send(port, createRequest('allowed', { method: 'todos.list' }))
    granted = false
    await send(port, createRequest('revoked', { method: 'todos.list' }))

    expect(invoke).toHaveBeenCalledOnce()
    expect(port.postMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      requestId: 'revoked', ok: false, error: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    }))
  })

  /** 验证普通并发 16 和网络并发 4 分别生效，不让网络方法绕过总并发配额。 */
  it('分别限制普通与网络未完成请求', async () => {
    const normalPort = createFakePort()
    const normalDeferred = createDeferred()
    const normalInvoke = vi.fn(() => normalDeferred.promise)
    createBroker(normalPort, { 'context.get': { invoke: normalInvoke } })
    for (let index = 0; index < BROKER_CONCURRENCY_MAX; index += 1) {
      await send(normalPort, createRequest(`normal-${index}`))
    }
    await send(normalPort, createRequest('normal-overflow'))
    expect(normalInvoke).toHaveBeenCalledTimes(BROKER_CONCURRENCY_MAX)
    expect(normalPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId: 'normal-overflow', ok: false, error: expect.objectContaining({ code: 'CONCURRENCY_LIMIT' }),
    }))
    normalDeferred.resolve()

    const networkPort = createFakePort()
    const networkDeferred = createDeferred()
    const networkInvoke = vi.fn(() => networkDeferred.promise)
    createBroker(networkPort, { 'network.fetch': { kind: 'network', invoke: networkInvoke } })
    for (let index = 0; index < 4; index += 1) {
      await send(networkPort, createRequest(`network-${index}`, { method: 'network.fetch' }))
    }
    await send(networkPort, createRequest('network-overflow', { method: 'network.fetch' }))
    expect(networkInvoke).toHaveBeenCalledTimes(4)
    expect(networkPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId: 'network-overflow', ok: false, error: expect.objectContaining({ code: 'CONCURRENCY_LIMIT' }),
    }))
    networkDeferred.resolve()
  })

  /** 验证 toast、滚动请求频率和持续洪泛都有独立且稳定的防护结果。 */
  it('限制 toast 与请求洪泛，并在持续超限时请求销毁 session', async () => {
    const toastPort = createFakePort()
    createBroker(toastPort, {
      'ui.toast': { kind: 'toast', invoke: () => undefined },
    }, { now: () => 100 })

    for (let index = 0; index < 4; index += 1) {
      await send(toastPort, createRequest(`toast-${index}`, { method: 'ui.toast' }))
    }
    expect(toastPort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId: 'toast-3', ok: false, error: expect.objectContaining({ code: 'RATE_LIMITED' }),
    }))

    const ratePort = createFakePort()
    const onFlood = vi.fn()
    createBroker(ratePort, { 'context.get': { invoke: () => undefined } }, { onFlood, now: () => 100 })
    for (let index = 0; index < BROKER_REQUEST_LIMIT_PER_WINDOW; index += 1) {
      await send(ratePort, createRequest(`rate-${index}`))
    }
    await send(ratePort, createRequest('rate-overflow-1'))
    await send(ratePort, createRequest('rate-overflow-2'))
    await send(ratePort, createRequest('rate-overflow-3'))

    expect(onFlood).toHaveBeenCalledOnce()
    expect(ratePort.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId: 'rate-overflow-3', ok: false, error: expect.objectContaining({ code: 'RATE_LIMITED' }),
    }))
  })

  /** 验证 64 KiB 事件边界在消息发布前可被后续 channel/lifecycle 能力复用。 */
  it('校验实例异步消息大小', () => {
    const port = createFakePort()
    const broker = createBroker(port, {})

    expect(broker.canSendInstanceMessage({ payload: 'x'.repeat(64 * 1024 - 128) })).toBe(true)
    expect(broker.canSendInstanceMessage({ payload: 'x'.repeat(64 * 1024) })).toBe(false)
    broker.destroy()
  })
})
