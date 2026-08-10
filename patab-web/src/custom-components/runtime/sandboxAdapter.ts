import {
  SANDBOX_ACTIVATE_MESSAGE,
  SANDBOX_CONNECTED_MESSAGE,
  SANDBOX_CONNECT_MESSAGE,
  SANDBOX_MOUNT_MESSAGE,
  SANDBOX_PREPARE_MESSAGE,
  SANDBOX_READY_MESSAGE,
  SandboxAdapterError,
} from './protocol'

/** Runtime 向薄适配层提交的最终挂载输入；HTML 已完成静态检查、CSP 与 bootstrap 注入。 */
export interface SandboxMountRequest {
  readonly container: HTMLElement
  readonly surfaceHtml: string
  readonly sessionToken: string
  readonly handshakeTimeoutMs: number
}

/** Runtime 从薄适配层取得的唯一可执行 frame、可信端口和幂等销毁句柄。 */
export interface SandboxMountHandle {
  readonly frameElement: HTMLIFrameElement
  readonly port: MessagePort
  activate(): void
  destroy(): void
}

/** Web/MV3 环境差异的唯一接口；不读取 Repository、grant 或 Capability。 */
export interface SandboxAdapter {
  readonly environment: 'web' | 'mv3'
  mount(request: SandboxMountRequest): Promise<SandboxMountHandle>
}

/** 适配器可注入的浏览器原语，测试可使用替身验证错误路径而无需放宽生产协议。 */
export interface SandboxAdapterDependencies {
  readonly document: Document
  readonly createMessageChannel?: () => MessageChannel
  readonly mv3SandboxPageUrl?: string
}

/**
 * 创建 sandbox iframe 并只授予脚本执行权。
 *
 * 两端都不得添加 allow-same-origin；MV3 的固定 sandbox page 也通过同一属性嵌入，确保普通扩展页不执行第三方 HTML。
 */
function createSandboxFrame(document: Document): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  return frame
}

/**
 * 等待由可信子窗口发起的两段握手。
 *
 * 第一步只接受预期 source 与 token 的 ready 窗口消息，第二步才转移 MessagePort，并在端口确认失败、加载失败或超时时统一销毁整棵 iframe。
 */
function completeSandboxHandshake(
  frame: HTMLIFrameElement,
  request: SandboxMountRequest,
  prepare: () => void,
  document: Document,
  createMessageChannel: () => MessageChannel,
): Promise<SandboxMountHandle> {
  const window = document.defaultView
  if (!window || !frame.contentWindow) {
    throw new SandboxAdapterError('adapter-unavailable')
  }
  const ownerWindow = window

  return new Promise((resolve, reject) => {
    let settled = false
    let destroyed = false
    let activated = false
    let port: MessagePort | undefined
    let timer: number | undefined

    /** 清理所有监听器、端口、定时器和 DOM，确保失败不会遗留可执行 iframe。 */
    function cleanup(removeFrame: boolean): void {
      ownerWindow.removeEventListener('message', onWindowMessage)
      frame.removeEventListener('error', onFrameError)
      frame.removeEventListener('load', onFrameLoad)
      if (timer !== undefined) ownerWindow.clearTimeout(timer)
      timer = undefined
      if (removeFrame) frame.remove()
    }

    /** 以稳定分类结束失败路径，不把底层浏览器错误传给 Runtime。 */
    function fail(code: ConstructorParameters<typeof SandboxAdapterError>[0]): void {
      if (settled) return
      settled = true
      port?.close()
      cleanup(true)
      reject(new SandboxAdapterError(code))
    }

    /** 返回幂等销毁句柄；Broker 会在上层销毁时先停止消息处理，端口随后由此处关闭。 */
    function succeed(activePort: MessagePort): void {
      if (settled) return
      settled = true
      cleanup(false)
      resolve({
        frameElement: frame,
        port: activePort,
        activate: () => {
          if (destroyed || activated) return
          activated = true
          activePort.postMessage({ type: SANDBOX_ACTIVATE_MESSAGE, token: request.sessionToken })
        },
        destroy: () => {
          if (destroyed) return
          destroyed = true
          activePort.onmessage = null
          activePort.close()
          frame.remove()
        },
      })
    }

    /** 仅接受当前 iframe 或固定 MV3 外层页发送的准备确认。 */
    function onWindowMessage(event: MessageEvent<unknown>): void {
      if (event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return
      const message = event.data as { type?: unknown; token?: unknown }
      if (message.type !== SANDBOX_READY_MESSAGE || message.token !== request.sessionToken || port) return

      const channel = createMessageChannel()
      const activePort = channel.port1
      port = activePort
      activePort.onmessage = (portEvent) => {
        const portMessage = portEvent.data as { type?: unknown; token?: unknown } | null
        if (portMessage?.type !== SANDBOX_CONNECTED_MESSAGE || portMessage.token !== request.sessionToken) {
          fail('handshake-invalid')
          return
        }
        activePort.onmessage = null
        succeed(activePort)
      }
      activePort.start()
      try {
        frame.contentWindow?.postMessage(
          { type: SANDBOX_CONNECT_MESSAGE, token: request.sessionToken },
          '*',
          [channel.port2],
        )
      } catch {
        fail('handshake-invalid')
      }
    }

    /** frame 级加载错误同样不能让未握手 surface 留在页面中。 */
    function onFrameError(): void {
      fail('frame-load-failed')
    }

    /** 只在子文档注册 bootstrap 后发送准备消息，避免快速 srcdoc 初始化时丢失首次握手。 */
    function onFrameLoad(): void {
      try {
        prepare()
      } catch {
        fail('handshake-invalid')
      }
    }

    ownerWindow.addEventListener('message', onWindowMessage)
    frame.addEventListener('error', onFrameError, { once: true })
    frame.addEventListener('load', onFrameLoad, { once: true })
    timer = ownerWindow.setTimeout(() => fail('handshake-timeout'), request.handshakeTimeoutMs)
  })
}

/**
 * 以 Web srcdoc 模式挂载最终 HTML。
 *
 * 适配器不解释 Manifest 或权限；完成 load 后仅向 opaque-origin iframe 发出准备消息，随后复用统一握手流程。
 */
export class WebSandboxAdapter implements SandboxAdapter {
  readonly environment = 'web' as const

  /** 创建 Web 适配器，生产默认使用当前 document 和原生 MessageChannel。 */
  constructor(private readonly dependencies: SandboxAdapterDependencies = { document }) {}

  /** 创建唯一 srcdoc iframe 并在超时或异常时自动移除。 */
  mount(request: SandboxMountRequest): Promise<SandboxMountHandle> {
    const frame = createSandboxFrame(this.dependencies.document)
    frame.srcdoc = request.surfaceHtml
    request.container.append(frame)
    return completeSandboxHandshake(
      frame,
      request,
      () => frame.contentWindow?.postMessage(
        { type: SANDBOX_PREPARE_MESSAGE, token: request.sessionToken },
        '*',
      ),
      this.dependencies.document,
      this.dependencies.createMessageChannel ?? (() => new MessageChannel()),
    )
  }
}

/**
 * 以 MV3 固定 Manifest sandbox page 模式挂载最终 HTML。
 *
 * 宿主只向固定页传递已准备的 HTML；固定页负责创建唯一内层 opaque-origin iframe，业务层无法接触此环境分支。
 */
export class Mv3SandboxAdapter implements SandboxAdapter {
  readonly environment = 'mv3' as const

  /** 创建 MV3 适配器；固定页地址只能由宿主内置资源提供。 */
  constructor(private readonly dependencies: SandboxAdapterDependencies = { document }) {}

  /** 通过固定 sandbox page 转交 HTML 和端口，绝不在普通扩展页直接写入第三方 srcdoc。 */
  mount(request: SandboxMountRequest): Promise<SandboxMountHandle> {
    const sandboxPageUrl = this.dependencies.mv3SandboxPageUrl
    if (!sandboxPageUrl) {
      return Promise.reject(new SandboxAdapterError('adapter-unavailable'))
    }

    const frame = createSandboxFrame(this.dependencies.document)
    frame.src = sandboxPageUrl
    request.container.append(frame)
    return completeSandboxHandshake(
      frame,
      request,
      () => frame.contentWindow?.postMessage(
        {
          type: SANDBOX_MOUNT_MESSAGE,
          token: request.sessionToken,
          markup: request.surfaceHtml,
        },
        '*',
      ),
      this.dependencies.document,
      this.dependencies.createMessageChannel ?? (() => new MessageChannel()),
    )
  }
}
