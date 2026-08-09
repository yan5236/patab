/** MV3 宿主页发给固定 sandbox 页的最小实验请求名。 */
const MV3_SANDBOX_CONNECT_MESSAGE = 'patab:mv3-sandbox-connect'

/** 内层第三方 iframe 通过 MessagePort 返回的最小实验回应名。 */
const MV3_SANDBOX_READY_MESSAGE = 'patab:mv3-sandbox-ready'

/** Surface CSP 实验复用固定 MV3 sandbox 页的握手请求名。 */
const SURFACE_CSP_CONNECT_MESSAGE = 'patab:surface-csp-connect'

/** 生产 Runtime 向固定 sandbox page 写入最终自包含 HTML 的消息名。 */
const SANDBOX_MOUNT_MESSAGE = 'patab:sandbox-mount'

/** 生产 Runtime 与内层 opaque-origin surface 共享的两段握手消息名。 */
const SANDBOX_PREPARE_MESSAGE = 'patab:sandbox-prepare'
const SANDBOX_CONNECT_MESSAGE = 'patab:sandbox-connect'
const SANDBOX_READY_MESSAGE = 'patab:sandbox-ready'

/** 当前生产挂载的内层 iframe 与令牌；固定页始终至多保留一个可执行来源。 */
let runtimeInnerFrame = null
let runtimeSessionToken = null

/**
 * 在不执行宿主页代码的 sandbox 页中生成内层唯一来源 iframe 的 srcdoc。
 *
 * 传入的标记只会成为内层 `sandbox="allow-scripts"` 文档内容；本页不插入、
 * 不解析也不执行该标记，从而保留 MV3 宿主页与第三方代码之间的隔离边界。
 */
function createInnerSandboxSrcdoc(markup, token) {
  const serializedToken = JSON.stringify(token).replaceAll('<', '\\u003C')
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>PaTab MV3 内层沙箱实验</title></head>
  <body>
    <script>
      (() => {
        const handshakeToken = ${serializedToken}
        let connected = false

        /** 尝试读取隔离能力；浏览器拒绝时返回 false 且不终止握手。 */
        function canAccess(attempt) {
          try {
            attempt()
            return true
          } catch {
            return false
          }
        }

        window.addEventListener('message', (event) => {
          if (connected || event.data?.type !== '${MV3_SANDBOX_CONNECT_MESSAGE}' || event.data.token !== handshakeToken) {
            return
          }
          const port = event.ports[0]
          if (!port) {
            return
          }
          connected = true
          port.start()
          port.postMessage({
            type: '${MV3_SANDBOX_READY_MESSAGE}',
            token: handshakeToken,
            isolation: {
              parentDomAccessible: canAccess(() => window.parent.document.documentElement),
              localStorageAccessible: canAccess(() => window.localStorage.getItem('__patab_mv3_probe__')),
              chromeApiAccessible: typeof chrome !== 'undefined'
                && typeof chrome.runtime?.getManifest === 'function',
            },
          })
        })
      })()
    </script>
    ${markup}
  </body>
</html>`
}

/**
 * 销毁当前内层 iframe，保证每次实验和后续运行时都只有一个可执行来源。
 */
function replaceInnerSandbox(markup, token) {
  const sandboxHost = document.querySelector('#sandbox-host')
  if (!sandboxHost) {
    throw new Error('MV3 sandbox 页缺少内部 iframe 宿主节点')
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = createInnerSandboxSrcdoc(markup, token)
  sandboxHost.replaceChildren(iframe)
  return iframe
}

/**
 * 等待内层 iframe 完成 srcdoc 初始化，避免在子页面还未注册 message 监听时转移端口。
 */
function waitForInnerFrameLoad(iframe) {
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.addEventListener('error', () => reject(new Error('MV3 内层 sandbox iframe 加载失败')), { once: true })
  })
}

/**
 * 将已通过宿主静态审查并已注入 CSP 的完整 HTML 写入唯一内层 iframe。
 *
 * 固定 sandbox page 不解析、拼接或执行 markup；它只把文本作为 srcdoc 交给更内层的 opaque-origin iframe。
 */
function mountRuntimeInnerSandbox(markup, token) {
  const sandboxHost = document.querySelector('#sandbox-host')
  if (!sandboxHost) {
    throw new Error('MV3 sandbox 页缺少内部 iframe 宿主节点')
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = markup
  runtimeInnerFrame = iframe
  runtimeSessionToken = token
  sandboxHost.replaceChildren(iframe)
  return iframe
}

/**
 * 把内层 surface 的准备确认转发给普通扩展宿主。
 *
 * 只接受当前唯一 iframe、当前会话令牌和固定消息类型，阻止过期或并行 iframe 伪造已就绪状态。
 */
function forwardRuntimeReady(event) {
  if (event.source !== runtimeInnerFrame?.contentWindow || event.data?.type !== SANDBOX_READY_MESSAGE) {
    return
  }
  if (event.data.token !== runtimeSessionToken) {
    return
  }
  window.parent.postMessage({ type: SANDBOX_READY_MESSAGE, token: runtimeSessionToken }, '*')
}

window.addEventListener('message', forwardRuntimeReady)

/**
 * 接收宿主页的实验请求，并只把其端口转交给本页创建的唯一内层 sandbox iframe。
 */
window.addEventListener('message', async (event) => {
  if (
    event.source !== window.parent
    || (event.data?.type !== MV3_SANDBOX_CONNECT_MESSAGE && event.data?.type !== SURFACE_CSP_CONNECT_MESSAGE)
  ) {
    return
  }

  const { token, markup } = event.data
  const port = event.ports[0]
  if (typeof token !== 'string' || typeof markup !== 'string' || !port) {
    return
  }

  try {
    const iframe = replaceInnerSandbox(markup, token)
    await waitForInnerFrameLoad(iframe)
    iframe.contentWindow?.postMessage({ type: event.data.type, token }, '*', [port])
  } catch {
    port.close()
  }
})

/**
 * 处理生产 Runtime 的挂载与端口转交。
 *
 * 普通扩展页只能向固定 Manifest sandbox page 发消息；本页完成内层 iframe 的 source 校验后才转交唯一 MessagePort。
 */
window.addEventListener('message', async (event) => {
  if (event.source !== window.parent || !event.data || typeof event.data !== 'object') {
    return
  }

  if (event.data.type === SANDBOX_MOUNT_MESSAGE) {
    const { token, markup } = event.data
    if (typeof token !== 'string' || typeof markup !== 'string') {
      return
    }
    try {
      const iframe = mountRuntimeInnerSandbox(markup, token)
      await waitForInnerFrameLoad(iframe)
      iframe.contentWindow?.postMessage({ type: SANDBOX_PREPARE_MESSAGE, token }, '*')
    } catch {
      runtimeInnerFrame = null
      runtimeSessionToken = null
    }
    return
  }

  if (event.data.type !== SANDBOX_CONNECT_MESSAGE || event.data.token !== runtimeSessionToken) {
    return
  }
  const port = event.ports[0]
  if (!port || !runtimeInnerFrame?.contentWindow) {
    port?.close()
    return
  }
  try {
    runtimeInnerFrame.contentWindow.postMessage(
      { type: SANDBOX_CONNECT_MESSAGE, token: runtimeSessionToken },
      '*',
      [port],
    )
  } catch {
    port.close()
  }
})
