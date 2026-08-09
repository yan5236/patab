/**
 * Web 自定义组件沙箱最小实验。
 *
 * 该模块只验证浏览器原生隔离边界：iframe 使用 srcdoc 和仅含 allow-scripts 的 sandbox，
 * 子页面通过 MessageChannel 报告自己不能读取父页面 DOM 或 localStorage。
 */

/** MessageChannel 握手允许等待的最长时间。 */
export const WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS = 5_000

/** 父页面发送给受限 iframe 的握手请求类型。 */
export const WEB_SANDBOX_CONNECT_MESSAGE = 'patab:web-sandbox-connect'

/** 受限 iframe 返回给父页面的握手完成类型。 */
export const WEB_SANDBOX_READY_MESSAGE = 'patab:web-sandbox-ready'

/**
 * 记录 iframe 内脚本对受保护浏览器能力的实际探测结果。
 *
 * 这些值由浏览器运行时探测得出，父端仍通过 sandbox 属性建立真正的隔离边界。
 */
export interface WebSandboxIsolationReport {
  parentDomAccessible: boolean
  localStorageAccessible: boolean
}

/** 经过令牌校验且通过隔离探测的握手结果。 */
export interface WebSandboxHandshake {
  token: string
  isolation: WebSandboxIsolationReport
}

/** 允许测试替换浏览器 MessageChannel 的最小通道形状。 */
export interface WebSandboxMessageChannel {
  port1: MessagePort
  port2: MessagePort
}

/** 握手函数的可选依赖，默认全部使用浏览器原生实现。 */
export interface WebSandboxHandshakeOptions {
  timeoutMs?: number
  createMessageChannel?: () => WebSandboxMessageChannel
}

/**
 * 表示 iframe 在规定时间内没有完成可信握手的错误。
 */
export class WebSandboxHandshakeTimeoutError extends Error {
  /**
   * 创建包含实际超时值的错误，便于调用方记录诊断信息。
   */
  constructor(timeoutMs: number) {
    super(`Web 自定义组件沙箱握手在 ${timeoutMs}ms 内未完成`)
    this.name = 'WebSandboxHandshakeTimeoutError'
  }
}

/**
 * 表示 iframe 报告仍可读取父 DOM 或 localStorage 的错误。
 */
export class WebSandboxIsolationError extends Error {
  /**
   * 创建隔离失败错误，阻止不满足最小隔离条件的 iframe 被视为可用。
   */
  constructor() {
    super('Web 自定义组件沙箱未通过父 DOM 与 localStorage 隔离探测')
    this.name = 'WebSandboxIsolationError'
  }
}

/**
 * 将令牌安全地嵌入内联脚本，防止令牌中的尖括号提前结束脚本节点。
 */
function serializeInlineScriptValue(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C')
}

/**
 * 判断未知值是否为可安全读取字段的普通记录。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 将子页面发来的消息收窄为当前令牌对应的握手结果。
 *
 * 非法、过期或来自其他 iframe 的消息会被忽略，而不是影响当前等待中的连接。
 */
function parseSandboxHandshake(data: unknown, token: string): WebSandboxHandshake | null {
  if (!isRecord(data) || data.type !== WEB_SANDBOX_READY_MESSAGE || data.token !== token) {
    return null
  }

  if (!isRecord(data.isolation)) {
    return null
  }

  const { parentDomAccessible, localStorageAccessible } = data.isolation
  if (typeof parentDomAccessible !== 'boolean' || typeof localStorageAccessible !== 'boolean') {
    return null
  }

  return {
    token,
    isolation: { parentDomAccessible, localStorageAccessible },
  }
}

/**
 * 生成运行在 opaque origin iframe 内的 srcdoc 文档。
 *
 * thirdPartyMarkup 可以包含待验证的第三方内联脚本；bootstrap 会先接收唯一端口，
 * 再用实际访问结果报告父 DOM 和 localStorage 是否被浏览器隔离。
 */
export function createWebSandboxSrcdoc(thirdPartyMarkup: string, token: string): string {
  const serializedToken = serializeInlineScriptValue(token)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>PaTab Web 组件沙箱实验</title>
  </head>
  <body>
    <script>
      (() => {
        const handshakeToken = ${serializedToken}
        let accepted = false

        /** 尝试访问隔离能力；浏览器拒绝时以 false 报告而不让脚本中断。 */
        function canAccess(attempt) {
          try {
            attempt()
            return true
          } catch {
            return false
          }
        }

        window.addEventListener('message', (event) => {
          if (accepted || event.data?.type !== '${WEB_SANDBOX_CONNECT_MESSAGE}' || event.data.token !== handshakeToken) {
            return
          }

          const port = event.ports[0]
          if (!port) {
            return
          }

          accepted = true
          port.start()
          port.postMessage({
            type: '${WEB_SANDBOX_READY_MESSAGE}',
            token: handshakeToken,
            isolation: {
              parentDomAccessible: canAccess(() => window.parent.document.documentElement),
              localStorageAccessible: canAccess(() => window.localStorage.getItem('__patab_sandbox_probe__')),
            },
          })
        })
      })()
    <\/script>
    ${thirdPartyMarkup}
  </body>
</html>`
}

/**
 * 创建仅允许执行脚本的 iframe，故意不授予 allow-same-origin。
 *
 * 缺少 allow-same-origin 时，srcdoc 页面在浏览器中获得 opaque origin，不能借同源权限读取父页面或自身 localStorage。
 */
export function createWebSandboxIframe(
  document: Document,
  thirdPartyMarkup: string,
  token: string,
): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = createWebSandboxSrcdoc(thirdPartyMarkup, token)
  return iframe
}

/**
 * 默认创建浏览器原生 MessageChannel，保持生产代码不依赖测试替身。
 */
function createNativeMessageChannel(): WebSandboxMessageChannel {
  return new MessageChannel()
}

/**
 * 向已加载的 sandbox iframe 发起单次 MessageChannel 握手。
 *
 * 调用方应在 iframe 的 load 事件中调用本函数；opaque origin 没有可指定的可信 origin，
 * 因而 targetOrigin 必须为 "*"，但结果必须同时通过独占端口、消息类型和随机令牌校验。
 */
export function startWebSandboxHandshake(
  iframe: Pick<HTMLIFrameElement, 'contentWindow'>,
  token: string,
  options: WebSandboxHandshakeOptions = {},
): Promise<WebSandboxHandshake> {
  const timeoutMs = options.timeoutMs ?? WEB_SANDBOX_HANDSHAKE_TIMEOUT_MS
  const channel = (options.createMessageChannel ?? createNativeMessageChannel)()

  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: number | null = null

    /**
     * 统一清理端口和计时器，确保成功、隔离失败与超时均只结算一次。
     */
    function finish(callback: () => void): void {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      channel.port1.onmessage = null
      channel.port1.close()
      callback()
    }

    channel.port1.onmessage = (event) => {
      const handshake = parseSandboxHandshake(event.data, token)
      if (!handshake) {
        return
      }

      if (handshake.isolation.parentDomAccessible || handshake.isolation.localStorageAccessible) {
        finish(() => reject(new WebSandboxIsolationError()))
        return
      }

      finish(() => resolve(handshake))
    }
    channel.port1.start()

    const targetWindow = iframe.contentWindow
    if (!targetWindow) {
      finish(() => reject(new Error('Web 自定义组件沙箱 iframe 尚未加载')))
      return
    }

    timeoutId = window.setTimeout(() => {
      finish(() => reject(new WebSandboxHandshakeTimeoutError(timeoutMs)))
    }, timeoutMs)
    targetWindow.postMessage(
      { type: WEB_SANDBOX_CONNECT_MESSAGE, token },
      '*',
      [channel.port2],
    )
  })
}
