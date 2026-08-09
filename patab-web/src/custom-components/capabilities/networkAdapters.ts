import {
  WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES,
  WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST,
  WIDGET_NETWORK_TIMEOUT_MS,
  validateWidgetNetworkResponse,
  type WidgetApiError,
  type WidgetNetworkHeaders,
  type WidgetNetworkResponse,
} from '@patab/widget-sdk'

import type { NormalizedWidgetNetworkRequest } from './networkPolicy'

/** 可替换的 fetch 边界，使 Web/MV3 网络行为能在不接触真实网络的条件下覆盖。 */
export type WidgetNetworkFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** 描述 MV3 可选 host permission 所需的最小浏览器接口，所有调用方只能传入单一精确 origin 模式。 */
export interface Mv3OptionalHostPermissionApi {
  readonly contains: (permissions: { readonly origins: readonly string[] }) => Promise<boolean>
  readonly request: (permissions: { readonly origins: readonly string[] }) => Promise<boolean>
  readonly remove: (permissions: { readonly origins: readonly string[] }) => Promise<boolean>
}

/** 网络适配器的统一接口；策略层和 Broker 不需要知道底层是 Web CORS 还是 MV3 host permission。 */
export interface WidgetNetworkAdapter {
  readonly execute: (request: NormalizedWidgetNetworkRequest) => Promise<WidgetNetworkResponse>
}

/** 表示适配器已经映射为 SDK 可公开错误的失败，禁止把 fetch/Chrome 原始异常交给 Broker。 */
export class WidgetNetworkAdapterError extends Error {
  /** 创建稳定网络错误；message 只能使用预定义安全文案。 */
  constructor(readonly error: WidgetApiError) {
    super(error.message)
    this.name = 'WidgetNetworkAdapterError'
  }
}

/** 从精确 origin 构造 Chrome permissions API 所需的单一匹配模式，不能扩展为通配来源。 */
export function createMv3OriginPattern(origin: `https://${string}`): string {
  return `${origin}/*`
}

/** 读取浏览器 MV3 权限 API；网页环境和不完整测试环境安全返回 undefined。 */
export function getMv3OptionalHostPermissionApi(): Mv3OptionalHostPermissionApi | undefined {
  const chromeApi = (globalThis as {
    chrome?: { permissions?: Mv3OptionalHostPermissionApi }
  }).chrome
  const permissions = chromeApi?.permissions
  if (!permissions || typeof permissions.contains !== 'function' || typeof permissions.request !== 'function' || typeof permissions.remove !== 'function') {
    return undefined
  }
  return permissions
}

/** 在安装确认的用户手势中请求一个精确来源；API 缺失或拒绝均安全返回 false。 */
export async function requestMv3OriginPermission(
  origin: `https://${string}`,
  api: Mv3OptionalHostPermissionApi | undefined = getMv3OptionalHostPermissionApi(),
): Promise<boolean> {
  if (!api) return false
  try {
    return await api.request({ origins: [createMv3OriginPattern(origin)] })
  } catch {
    return false
  }
}

/** 撤销单一精确来源的浏览器 host permission；失败时返回 false 并保留调用方现有授权状态。 */
export async function removeMv3OriginPermission(
  origin: `https://${string}`,
  api: Mv3OptionalHostPermissionApi | undefined = getMv3OptionalHostPermissionApi(),
): Promise<boolean> {
  if (!api) return false
  try {
    return await api.remove({ origins: [createMv3OriginPattern(origin)] })
  } catch {
    return false
  }
}

/** 查询浏览器是否仍实际持有该精确来源，供每次 MV3 请求在 fetch 前重新检查撤销结果。 */
export async function containsMv3OriginPermission(
  origin: `https://${string}`,
  api: Mv3OptionalHostPermissionApi | undefined = getMv3OptionalHostPermissionApi(),
): Promise<boolean> {
  if (!api) return false
  try {
    return await api.contains({ origins: [createMv3OriginPattern(origin)] })
  } catch {
    return false
  }
}

/** 从浏览器 Response 读取白名单响应头，显式排除 Set-Cookie、跨域策略和其它会话关联信息。 */
function readSafeResponseHeaders(headers: Headers): WidgetNetworkHeaders {
  const result: Record<string, string> = {}
  for (const name of WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST) {
    const value = headers.get(name)
    if (value !== null) result[name] = value
  }
  return result
}

/** 流式读取响应正文并在累计字节超过 2 MiB 时中断，避免 response.text 先分配无界内存。 */
async function readResponseBody(response: Response, controller: AbortController): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength && Number(declaredLength) > WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES) {
    controller.abort()
    throw new WidgetNetworkAdapterError({ code: 'RESPONSE_TOO_LARGE', message: '网络响应正文超过允许大小。' })
  }

  if (!response.body) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES) {
      throw new WidgetNetworkAdapterError({ code: 'RESPONSE_TOO_LARGE', message: '网络响应正文超过允许大小。' })
    }
    return body
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      byteLength += result.value.byteLength
      if (byteLength > WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES) {
        controller.abort()
        throw new WidgetNetworkAdapterError({ code: 'RESPONSE_TOO_LARGE', message: '网络响应正文超过允许大小。' })
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/** 映射网络、CORS 和浏览器拒绝为稳定错误，禁止拼接原始 URL、异常文本、Authorization 或正文。 */
function mapFetchFailure(error: unknown, timedOut: boolean): WidgetNetworkAdapterError {
  if (error instanceof WidgetNetworkAdapterError) return error
  if (timedOut) return new WidgetNetworkAdapterError({ code: 'TIMEOUT', message: '网络请求超过 10 秒未完成。' })
  return new WidgetNetworkAdapterError({
    code: 'INVALID_REQUEST',
    message: '网络请求因浏览器网络或跨域限制失败。',
  })
}

/**
 * 使用受限 fetch 初始化发送请求并复制安全响应。
 *
 * credentials、referrer 和 redirect 由宿主固定，第三方 DTO 无法覆盖；该函数不记录请求或响应内容。
 */
async function executeFetchRequest(
  request: NormalizedWidgetNetworkRequest,
  fetchImpl: WidgetNetworkFetch,
): Promise<WidgetNetworkResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, WIDGET_NETWORK_TIMEOUT_MS)

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: controller.signal,
    })
    if (response.redirected || response.status >= 300 && response.status < 400) {
      throw new WidgetNetworkAdapterError({ code: 'ORIGIN_NOT_ALLOWED', message: '网络响应发生重定向，已被拒绝。' })
    }

    const result: WidgetNetworkResponse = {
      status: response.status,
      headers: readSafeResponseHeaders(response.headers),
      body: await readResponseBody(response, controller),
    }
    const validation = validateWidgetNetworkResponse(result)
    if (!validation.valid) {
      throw new WidgetNetworkAdapterError({
        code: validation.error.code,
        message: validation.error.code === 'RESPONSE_TOO_LARGE'
          ? '网络响应正文超过允许大小。'
          : '网络响应不符合公开安全边界。',
      })
    }
    return result
  } catch (error) {
    throw mapFetchFailure(error, timedOut)
  } finally {
    clearTimeout(timer)
  }
}

/** 创建网页端网络适配器；浏览器原生 CORS 失败直接映射稳定错误，绝不回退到代理服务。 */
export function createWebWidgetNetworkAdapter(
  fetchImpl: WidgetNetworkFetch = globalThis.fetch.bind(globalThis),
): WidgetNetworkAdapter {
  return { execute: (request) => executeFetchRequest(request, fetchImpl) }
}

/**
 * 创建扩展端网络适配器；每次请求都先查询 Chrome 的精确 host permission。
 *
 * Repository grant 与浏览器 host permission 任一撤销都会阻止 fetch，避免扩展长期保留过期来源访问。
 */
export function createMv3WidgetNetworkAdapter(
  fetchImpl: WidgetNetworkFetch = globalThis.fetch.bind(globalThis),
  permissions: Mv3OptionalHostPermissionApi | undefined = getMv3OptionalHostPermissionApi(),
): WidgetNetworkAdapter {
  return {
    async execute(request) {
      if (!await containsMv3OriginPermission(request.origin, permissions)) {
        throw new WidgetNetworkAdapterError({ code: 'ORIGIN_NOT_ALLOWED', message: '网络来源未获浏览器授权。' })
      }
      return executeFetchRequest(request, fetchImpl)
    },
  }
}
