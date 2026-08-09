/** 清单中唯一允许此实验申请的精确 HTTPS 主机权限模式。 */
const DECLARED_ORIGIN = 'https://permission-spike.patab.example/*'

/** 故意不出现在扩展清单中的 HTTPS 主机权限模式。 */
const UNDECLARED_ORIGIN = 'https://undeclared-permission-spike.patab.example/*'

/**
 * 读取实验页必需元素，页面被意外修改时立即失败，避免把缺失交互误报为权限通过。
 */
function requireElement(selector) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`MV3 权限实验页缺少必要节点：${selector}`)
  }
  return element
}

const declaredOriginElement = requireElement('#declared-origin')
const undeclaredOriginElement = requireElement('#undeclared-origin')
const requestDeclaredOriginButton = requireElement('#request-declared-origin')
const removeDeclaredOriginButton = requireElement('#remove-declared-origin')
const requestUndeclaredOriginButton = requireElement('#request-undeclared-origin')
const refreshPermissionStateButton = requireElement('#refresh-permission-state')
const resultElement = requireElement('#result')

declaredOriginElement.textContent = DECLARED_ORIGIN
undeclaredOriginElement.textContent = UNDECLARED_ORIGIN

/**
 * 把结构化浏览器 API 结果显示在实验页，供真实扩展载入后的人工和自动化验收读取。
 */
function showResult(value) {
  resultElement.textContent = JSON.stringify(value, null, 2)
}

/**
 * 将浏览器错误压缩为可比较的诊断，保留是否为 API 拒绝而不依赖某个 Chrome 版本的完整报错文本。
 */
function describePermissionError(error) {
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  }
}

/**
 * 查询指定主机权限当前是否真的由该扩展持有，避免仅凭上一个 API 返回值推断状态。
 */
async function containsOrigin(origin) {
  return chrome.permissions.contains({ origins: [origin] })
}

/**
 * 刷新已声明和未声明来源的授权状态，为撤销和重开后的状态转换提供同一读数。
 */
async function refreshPermissionState() {
  try {
    const [declaredGranted, undeclaredGranted] = await Promise.all([
      containsOrigin(DECLARED_ORIGIN),
      containsOrigin(UNDECLARED_ORIGIN),
    ])
    showResult({
      status: 'state',
      declaredGranted,
      undeclaredGranted,
    })
  } catch (error) {
    showResult({
      status: 'failed',
      step: 'refresh',
      error: describePermissionError(error),
    })
  }
}

/**
 * 在按钮点击的有效用户手势中请求唯一已声明来源；Chrome 原生提示框的接受或拒绝会映射为 granted 布尔值。
 */
async function handleDeclaredOriginRequest() {
  requestDeclaredOriginButton.disabled = true
  showResult({ status: 'requesting', origin: DECLARED_ORIGIN })

  try {
    const permissionRequest = chrome.permissions.request({ origins: [DECLARED_ORIGIN] })
    const grantedBeforeRequest = await containsOrigin(DECLARED_ORIGIN)
    const granted = await permissionRequest
    showResult({
      status: granted ? 'granted' : 'denied',
      origin: DECLARED_ORIGIN,
      granted,
      grantedBeforeRequest,
      containsAfterRequest: await containsOrigin(DECLARED_ORIGIN),
    })
  } catch (error) {
    showResult({
      status: 'failed',
      step: 'request-declared-origin',
      error: describePermissionError(error),
    })
  } finally {
    requestDeclaredOriginButton.disabled = false
  }
}

/**
 * 撤销此前授予的唯一来源，并紧接着重新查询，确保 remove 的回调结果未掩盖真实持有状态。
 */
async function handleDeclaredOriginRemoval() {
  removeDeclaredOriginButton.disabled = true
  showResult({ status: 'removing', origin: DECLARED_ORIGIN })

  try {
    const grantedBeforeRemove = await containsOrigin(DECLARED_ORIGIN)
    const removed = await chrome.permissions.remove({ origins: [DECLARED_ORIGIN] })
    showResult({
      status: removed ? 'removed' : 'not-removed',
      origin: DECLARED_ORIGIN,
      removed,
      grantedBeforeRemove,
      containsAfterRemove: await containsOrigin(DECLARED_ORIGIN),
    })
  } catch (error) {
    showResult({
      status: 'failed',
      step: 'remove-declared-origin',
      error: describePermissionError(error),
    })
  } finally {
    removeDeclaredOriginButton.disabled = false
  }
}

/**
 * 在有效用户手势中申请未列入 optional_host_permissions 的来源，验证 Chrome 会在显示任何授权前拒绝该请求。
 */
async function handleUndeclaredOriginRequest() {
  requestUndeclaredOriginButton.disabled = true
  showResult({ status: 'requesting-undeclared', origin: UNDECLARED_ORIGIN })

  try {
    const granted = await chrome.permissions.request({ origins: [UNDECLARED_ORIGIN] })
    showResult({
      status: granted ? 'unexpected-grant' : 'undeclared-denied',
      origin: UNDECLARED_ORIGIN,
      granted,
      containsAfterRequest: await containsOrigin(UNDECLARED_ORIGIN),
    })
  } catch (error) {
    showResult({
      status: 'undeclared-rejected',
      origin: UNDECLARED_ORIGIN,
      containsAfterRequest: await containsOrigin(UNDECLARED_ORIGIN),
      error: describePermissionError(error),
    })
  } finally {
    requestUndeclaredOriginButton.disabled = false
  }
}

requestDeclaredOriginButton.addEventListener('click', handleDeclaredOriginRequest)
removeDeclaredOriginButton.addEventListener('click', handleDeclaredOriginRemoval)
requestUndeclaredOriginButton.addEventListener('click', handleUndeclaredOriginRequest)
refreshPermissionStateButton.addEventListener('click', refreshPermissionState)

void refreshPermissionState()
