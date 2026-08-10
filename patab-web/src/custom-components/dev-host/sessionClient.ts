import {
  validateWidgetDevSessionDescriptor,
  type WidgetDevSessionDescriptor,
} from '@patab/widget-sdk/dev-host'

/** 开发宿主启动失败的稳定分类；界面不得显示 fetch、URL 或 JSON 原始异常。 */
export type WidgetDevSessionClientErrorCode = 'AUTH_REQUIRED' | 'SESSION_INVALID' | 'SESSION_UNAVAILABLE'

/** 只携带稳定分类的开发会话客户端错误。 */
export class WidgetDevSessionClientError extends Error {
  /** 创建不包含 token、响应正文或浏览器异常的启动错误。 */
  constructor(readonly code: WidgetDevSessionClientErrorCode) {
    super('组件开发会话不可用。')
    this.name = 'WidgetDevSessionClientError'
  }
}

/** 从 URL fragment 读取一次性 token，并立即清除地址栏中的 secret。 */
export function consumeWidgetDevSessionToken(
  location: Pick<Location, 'hash' | 'href' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>,
): string {
  const fragment = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.hash)
  const token = fragment.get('session')
  if (!token || !/^[A-Za-z0-9_-]{22,256}$/.test(token)) {
    throw new WidgetDevSessionClientError('AUTH_REQUIRED')
  }
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  return token
}

/**
 * 使用内存 token 拉取并校验当前开发会话描述。
 *
 * 认证、HTTP、JSON 或契约失败都会压缩为稳定分类，响应正文和请求 header 不离开本模块。
 */
export async function fetchWidgetDevSessionDescriptor(options: {
  readonly token: string
  readonly fetch?: typeof globalThis.fetch
}): Promise<WidgetDevSessionDescriptor> {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  if (!fetchImplementation) throw new WidgetDevSessionClientError('SESSION_UNAVAILABLE')
  let response: Response
  try {
    response = await fetchImplementation('/__patab_dev__/session', {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.token}` },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw new WidgetDevSessionClientError('SESSION_UNAVAILABLE')
  }
  if (!response.ok) throw new WidgetDevSessionClientError(response.status === 401 ? 'AUTH_REQUIRED' : 'SESSION_UNAVAILABLE')
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new WidgetDevSessionClientError('SESSION_INVALID')
  }
  const validation = validateWidgetDevSessionDescriptor(value)
  if (!validation.valid) throw new WidgetDevSessionClientError('SESSION_INVALID')
  return validation.value
}
