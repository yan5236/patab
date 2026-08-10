import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SANDBOX_ACTIVATE_MESSAGE,
  SANDBOX_CONNECTED_MESSAGE,
  SANDBOX_MOUNT_MESSAGE,
  SANDBOX_PREPARE_MESSAGE,
  SANDBOX_READY_MESSAGE,
} from './protocol'
import { Mv3SandboxAdapter, WebSandboxAdapter, type SandboxAdapterDependencies } from './sandboxAdapter'

/** 创建可直接触发端口回调的最小 MessagePort 替身，避免 jsdom 不执行 srcdoc 脚本影响协议验证。 */
function createFakePort() {
  return {
    close: vi.fn(),
    postMessage: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
}

/** 创建成对端口替身，使测试能断言仅在准备完成后才转移 port2。 */
function createFakeMessageChannel() {
  return {
    port1: createFakePort(),
    port2: createFakePort(),
  }
}

/** 创建使用测试 document 和可控 MessageChannel 的适配器依赖。 */
function createDependencies(channel: ReturnType<typeof createFakeMessageChannel>): SandboxAdapterDependencies {
  return {
    document,
    createMessageChannel: () => channel as unknown as MessageChannel,
    mv3SandboxPageUrl: '/custom-component-sandbox.html',
  }
}

/** 触发当前 iframe 的可信 ready 与端口确认，模拟 opaque-origin surface 的完整两段握手。 */
function completeHandshake(
  frame: HTMLIFrameElement,
  token: string,
  channel: ReturnType<typeof createFakeMessageChannel>,
): void {
  frame.dispatchEvent(new Event('load'))
  window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    data: { type: SANDBOX_READY_MESSAGE, token },
  }))
  channel.port1.onmessage?.({
    data: { type: SANDBOX_CONNECTED_MESSAGE, token },
  } as MessageEvent<unknown>)
}

/** 每个用例后移除测试创建的 iframe，确保 source 比对不会被上一个用例干扰。 */
afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** 覆盖 Web/MV3 适配器的唯一 iframe、source/token/port 验证、超时和幂等销毁边界。 */
describe('SandboxAdapter', () => {
  /** 验证 Web adapter 仅创建 allow-scripts srcdoc iframe，并拒绝其他窗口伪造的 ready 消息。 */
  it('Web adapter 验证 source、令牌与端口后才返回句柄', async () => {
    const channel = createFakeMessageChannel()
    const adapter = new WebSandboxAdapter(createDependencies(channel))
    const container = document.createElement('div')
    document.body.append(container)

    const mounting = adapter.mount({
      container,
      surfaceHtml: '<!doctype html><html><body>组件</body></html>',
      sessionToken: 'session-web',
      handshakeTimeoutMs: 1000,
    })
    const frame = container.querySelector('iframe')
    if (!frame) throw new Error('测试没有创建 Web iframe')
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')

    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    frame.dispatchEvent(new Event('load'))
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: SANDBOX_PREPARE_MESSAGE, token: 'session-web' },
      '*',
    )
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: SANDBOX_READY_MESSAGE, token: 'session-web' },
    }))
    expect(channel.port1.start).not.toHaveBeenCalled()

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: SANDBOX_READY_MESSAGE, token: 'session-web' },
    }))
    expect(channel.port1.start).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'patab:sandbox-connect', token: 'session-web' }),
      '*',
      [channel.port2],
    )
    channel.port1.onmessage?.({ data: { type: SANDBOX_CONNECTED_MESSAGE, token: 'session-web' } } as MessageEvent<unknown>)

    const handle = await mounting
    handle.activate()
    handle.activate()
    expect(channel.port1.postMessage).toHaveBeenCalledOnce()
    expect(channel.port1.postMessage).toHaveBeenCalledWith({
      type: SANDBOX_ACTIVATE_MESSAGE,
      token: 'session-web',
    })
    handle.destroy()
    handle.destroy()
    expect(channel.port1.close).toHaveBeenCalledOnce()
    expect(container.querySelector('iframe')).toBeNull()
  })

  /** 验证错误令牌不会获得端口，最终由五秒以内的调用方超时销毁完整 iframe。 */
  it('Web adapter 拒绝伪造 token 并在超时时关闭端口和移除 iframe', async () => {
    vi.useFakeTimers()
    const channel = createFakeMessageChannel()
    const adapter = new WebSandboxAdapter(createDependencies(channel))
    const container = document.createElement('div')
    document.body.append(container)
    const mounting = adapter.mount({
      container,
      surfaceHtml: '<!doctype html><html><body>组件</body></html>',
      sessionToken: 'session-timeout',
      handshakeTimeoutMs: 5,
    })
    const frame = container.querySelector('iframe')
    if (!frame) throw new Error('测试没有创建 Web iframe')

    frame.dispatchEvent(new Event('load'))
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: SANDBOX_READY_MESSAGE, token: 'forged-token' },
    }))
    const rejection = expect(mounting).rejects.toMatchObject({ code: 'handshake-timeout' })
    await vi.advanceTimersByTimeAsync(5)

    await rejection
    expect(container.querySelector('iframe')).toBeNull()
    expect(channel.port1.close).not.toHaveBeenCalled()
  })

  /** 验证 MV3 adapter 只把完整 HTML 交给固定 sandbox page，业务层仍通过相同 source/port 生命周期获得句柄。 */
  it('MV3 adapter 通过固定 sandbox page 挂载并复用统一握手', async () => {
    const channel = createFakeMessageChannel()
    const adapter = new Mv3SandboxAdapter(createDependencies(channel))
    const container = document.createElement('div')
    document.body.append(container)
    const mounting = adapter.mount({
      container,
      surfaceHtml: '<!doctype html><html><body>MV3 组件</body></html>',
      sessionToken: 'session-mv3',
      handshakeTimeoutMs: 1000,
    })
    const frame = container.querySelector('iframe')
    if (!frame) throw new Error('测试没有创建 MV3 iframe')
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')

    frame.dispatchEvent(new Event('load'))
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.src).toContain('/custom-component-sandbox.html')
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: SANDBOX_MOUNT_MESSAGE, token: 'session-mv3', markup: expect.any(String) }),
      '*',
    )
    completeHandshake(frame, 'session-mv3', channel)

    const handle = await mounting
    handle.destroy()
    expect(container.querySelector('iframe')).toBeNull()
  })

  /** 验证未配置固定 Manifest sandbox page 时直接拒绝，绝不回退为扩展宿主 srcdoc。 */
  it('MV3 adapter 缺少固定 sandbox page 时不创建可执行 iframe', async () => {
    const adapter = new Mv3SandboxAdapter({ document })
    const container = document.createElement('div')
    document.body.append(container)

    await expect(adapter.mount({
      container,
      surfaceHtml: '<!doctype html><html><body>组件</body></html>',
      sessionToken: 'unavailable',
      handshakeTimeoutMs: 1000,
    })).rejects.toMatchObject({ code: 'adapter-unavailable' })
    expect(container.querySelector('iframe')).toBeNull()
  })
})
