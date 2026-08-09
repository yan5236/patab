import { describe, expect, it, vi } from 'vitest'
import {
  WEB_SANDBOX_CONNECT_MESSAGE,
  WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS,
  WEB_SANDBOX_READY_MESSAGE,
  WebSandboxHandshakeTimeoutError,
  WebSandboxIsolationError,
  createWebSandboxIframe,
  createWebSandboxSrcdoc,
  startWebSandboxHandshake,
  type WebSandboxMessageChannel,
} from './webSandbox'

/**
 * 创建可由测试直接触发消息回调的 MessagePort 替身。
 */
function createFakePort() {
  return {
    close: vi.fn(),
    postMessage: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
  }
}

/**
 * 创建可控的双端口，避免 jsdom 对跨 iframe MessageChannel 行为的实现差异干扰单元测试。
 */
function createFakeMessageChannel(): WebSandboxMessageChannel & {
  port1: ReturnType<typeof createFakePort>
  port2: ReturnType<typeof createFakePort>
} {
  return {
    port1: createFakePort(),
    port2: createFakePort(),
  } as unknown as WebSandboxMessageChannel & {
    port1: ReturnType<typeof createFakePort>
    port2: ReturnType<typeof createFakePort>
  }
}

describe('Web 自定义组件沙箱最小实验', () => {
  it('仅授予 allow-scripts，srcdoc 内置 opaque origin 隔离探测', () => {
    const iframe = createWebSandboxIframe(document, '<script>window.thirdPartyLoaded = true<\/script>', 'token-a')

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.srcdoc).toContain('window.parent.document.documentElement')
    expect(iframe.srcdoc).toContain("window.localStorage.getItem('__patab_sandbox_probe__')")
    expect(iframe.srcdoc).toContain('window.thirdPartyLoaded = true')
  })

  it('仅接受携带匹配令牌且隔离探测通过的端口回应', async () => {
    const channel = createFakeMessageChannel()
    const postMessage = vi.fn()
    const iframe = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement

    const handshake = startWebSandboxHandshake(iframe, 'token-b', {
      createMessageChannel: () => channel,
    })

    expect(postMessage).toHaveBeenCalledWith(
      { type: WEB_SANDBOX_CONNECT_MESSAGE, token: 'token-b' },
      '*',
      [channel.port2],
    )

    channel.port1.onmessage?.({
      data: {
        type: WEB_SANDBOX_READY_MESSAGE,
        token: 'other-token',
        isolation: { parentDomAccessible: false, localStorageAccessible: false },
      },
    } as MessageEvent)
    channel.port1.onmessage?.({
      data: {
        type: WEB_SANDBOX_READY_MESSAGE,
        token: 'token-b',
        isolation: { parentDomAccessible: false, localStorageAccessible: false },
      },
    } as MessageEvent)

    await expect(handshake).resolves.toEqual({
      token: 'token-b',
      isolation: { parentDomAccessible: false, localStorageAccessible: false },
    })
    expect(channel.port1.close).toHaveBeenCalledOnce()
  })

  it('当 iframe 报告可读取父 DOM 或 localStorage 时拒绝握手', async () => {
    const channel = createFakeMessageChannel()
    const iframe = { contentWindow: { postMessage: vi.fn() } } as unknown as HTMLIFrameElement
    const handshake = startWebSandboxHandshake(iframe, 'token-c', {
      createMessageChannel: () => channel,
    })

    channel.port1.onmessage?.({
      data: {
        type: WEB_SANDBOX_READY_MESSAGE,
        token: 'token-c',
        isolation: { parentDomAccessible: true, localStorageAccessible: false },
      },
    } as MessageEvent)

    await expect(handshake).rejects.toBeInstanceOf(WebSandboxIsolationError)
  })

  it('超过默认五秒仍未收到有效回应时超时', async () => {
    vi.useFakeTimers()
    const channel = createFakeMessageChannel()
    const iframe = { contentWindow: { postMessage: vi.fn() } } as unknown as HTMLIFrameElement
    const handshake = startWebSandboxHandshake(iframe, 'token-d', {
      createMessageChannel: () => channel,
    })
    const rejection = expect(handshake).rejects.toBeInstanceOf(WebSandboxHandshakeTimeoutError)

    await vi.advanceTimersByTimeAsync(WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS)
    await rejection
    vi.useRealTimers()
  })

  it('在写入 srcdoc 前转义令牌中的尖括号', () => {
    const srcdoc = createWebSandboxSrcdoc('', '</script><script>window.escaped = false</script>')

    expect(srcdoc).toContain('\\u003C/script>')
    expect(srcdoc).not.toContain('const handshakeToken = "</script>')
  })
})
