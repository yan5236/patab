/** MV3 固定 sandbox 页与内层 iframe 共享的最小实验请求名。 */
const MV3_SANDBOX_CONNECT_MESSAGE = 'patab:mv3-sandbox-connect'

/** 内层唯一来源 iframe 返回给宿主页的实验回应名。 */
const MV3_SANDBOX_READY_MESSAGE = 'patab:mv3-sandbox-ready'

/**
 * 读取实验页必需节点；页面结构错误时立即失败，避免测试显示伪成功。
 */
function requireElement(selector) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`MV3 沙箱实验页缺少必要节点：${selector}`)
  }
  return element
}

const runButton = requireElement('#run-mv3-sandbox')
const resultElement = requireElement('#result')
const sandboxPage = requireElement('#sandbox-page')

/**
 * 将结构化实验状态显示给浏览器验收，避免依赖开发者工具中的临时输出。
 */
function showResult(value) {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/**
 * 重新加载固定 sandbox page 并等待完成，确保它已能接收宿主页转移的端口。
 */
function waitForSandboxPageLoad() {
  return new Promise((resolve, reject) => {
    sandboxPage.addEventListener('load', () => resolve(), { once: true })
    sandboxPage.addEventListener('error', () => reject(new Error('MV3 固定 sandbox page 加载失败')), { once: true })
    const source = sandboxPage.dataset.src
    if (!source) {
      reject(new Error('MV3 sandbox 实验页未声明固定 sandbox page 地址'))
      return
    }
    sandboxPage.src = source
  })
}

/**
 * 在真实扩展页验证第三方代码仅在内层 opaque-origin iframe 中运行且收不到扩展 API。
 */
async function runMv3SandboxProbe() {
  runButton.disabled = true
  showResult({ status: 'running' })

  const token = crypto.randomUUID()
  const channel = new MessageChannel()
  const timeoutId = window.setTimeout(() => {
    channel.port1.close()
    showResult({ status: 'failed', error: 'MV3 sandbox 握手在 5,000 ms 内未完成' })
    runButton.disabled = false
  }, 5_000)

  channel.port1.onmessage = (event) => {
    const report = event.data
    if (report?.type !== MV3_SANDBOX_READY_MESSAGE || report.token !== token) {
      return
    }
    window.clearTimeout(timeoutId)
    channel.port1.close()
    showResult({
      status: report.isolation?.parentDomAccessible === false
        && report.isolation?.localStorageAccessible === false
        && report.isolation?.chromeApiAccessible === false
        ? 'passed'
        : 'failed',
      outerSandboxAttribute: sandboxPage.getAttribute('sandbox'),
      ...report.isolation,
    })
    runButton.disabled = false
  }
  channel.port1.start()

  try {
    await waitForSandboxPageLoad()
    sandboxPage.contentWindow?.postMessage(
      {
        type: MV3_SANDBOX_CONNECT_MESSAGE,
        token,
        markup: '<script>window.thirdPartyExecuted = true</script>',
      },
      '*',
      [channel.port2],
    )
  } catch (error) {
    window.clearTimeout(timeoutId)
    channel.port1.close()
    showResult({ status: 'failed', error: error instanceof Error ? error.message : '未知错误' })
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  void runMv3SandboxProbe()
})
