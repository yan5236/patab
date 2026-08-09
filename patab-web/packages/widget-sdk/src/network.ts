import {
  createWidgetContractValidationFailure,
  createWidgetContractValidationSuccess,
  type WidgetContractValidationResult,
} from './validation.js'

/** 受控网络请求允许的 HTTP 方法，CONNECT 与 TRACE 等方法不会进入公开 SDK 契约。 */
export const WIDGET_NETWORK_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** 受控网络请求正文的最大 UTF-8 字节数。 */
export const WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES = 1024 * 1024

/** 受控网络响应正文的最大 UTF-8 字节数。 */
export const WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES = 2 * 1024 * 1024

/** 单实例网络请求的最大持续时间，超过后宿主返回 TIMEOUT。 */
export const WIDGET_NETWORK_TIMEOUT_MS = 10_000

/** 单实例允许并行的最大网络请求数，超过后宿主返回 CONCURRENCY_LIMIT。 */
export const WIDGET_NETWORK_CONCURRENCY_MAX = 4

/** 公开网络 URL 的最大字符数，避免超长 URL 成为 RPC 载荷放大通道。 */
export const WIDGET_NETWORK_URL_MAX_LENGTH = 2_048

/** 单个公开网络请求允许的最大头字段数。 */
export const WIDGET_NETWORK_HEADER_COUNT_MAX = 32

/** 单个公开网络头名称允许的最大字符数。 */
export const WIDGET_NETWORK_HEADER_NAME_MAX_LENGTH = 128

/** 单个公开网络头值允许的最大 UTF-8 字节数。 */
export const WIDGET_NETWORK_HEADER_VALUE_MAX_BYTES = 8_192

/**
 * 列出不允许由第三方组件传入的危险请求头；Authorization 虽可传递，但其值绝不能进入诊断日志。
 */
export const WIDGET_NETWORK_FORBIDDEN_REQUEST_HEADER_NAMES = [
  'cookie',
  'host',
  'origin',
  'referer',
] as const

/**
 * 列出宿主可返回给第三方组件的安全响应头，明确排除 Set-Cookie 等会泄露或影响浏览器会话的字段。
 */
export const WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST = [
  'cache-control',
  'content-language',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
] as const

/**
 * 表示 API v1 支持的受控网络 HTTP 方法。
 */
export type WidgetNetworkHttpMethod = (typeof WIDGET_NETWORK_HTTP_METHODS)[number]

/**
 * 描述可跨 sandbox 边界安全传输的网络头字段集合；宿主将在发送前实施危险头过滤和凭据剥离。
 */
export type WidgetNetworkHeaders = Readonly<Record<string, string>>

/**
 * 描述第三方组件可申请的网络请求，不提供 credentials、redirect 或浏览器 fetch 初始化项的控制权。
 */
export interface WidgetNetworkRequest {
  readonly url: string
  readonly method: WidgetNetworkHttpMethod
  readonly headers?: WidgetNetworkHeaders
  readonly body?: string
}

/**
 * 描述宿主过滤后的网络响应，只提供状态、允许暴露的头字段和受大小限制的文本正文。
 */
export interface WidgetNetworkResponse {
  readonly status: number
  readonly headers: WidgetNetworkHeaders
  readonly body: string
}

/**
 * 计算字符串的 UTF-8 字节数，使浏览器与 Node 对请求、响应和头字段上限使用相同口径。
 */
function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * 判断请求头名称是否属于危险保留头或浏览器安全头前缀，避免第三方伪造网络上下文。
 */
function isWidgetNetworkForbiddenHeader(name: string): boolean {
  const normalizedName = name.toLowerCase()
  return WIDGET_NETWORK_FORBIDDEN_REQUEST_HEADER_NAMES.includes(normalizedName as never)
    || normalizedName.startsWith('proxy-')
    || normalizedName.startsWith('sec-')
}

/**
 * 校验请求头的数量、字符边界、换行注入与危险名称；不会发送网络请求或记录 Authorization 值。
 */
function validateWidgetNetworkHeaders(headers: WidgetNetworkHeaders): WidgetContractValidationResult {
  const entries = Object.entries(headers)
  if (entries.length > WIDGET_NETWORK_HEADER_COUNT_MAX) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '网络请求头数量超过上限。',
      'headers',
    )
  }

  for (const [name, value] of entries) {
    if (!name || name.length > WIDGET_NETWORK_HEADER_NAME_MAX_LENGTH || /[\r\n]/.test(name)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '网络请求头名称无效。',
        `headers.${name}`,
      )
    }
    if (getUtf8ByteLength(value) > WIDGET_NETWORK_HEADER_VALUE_MAX_BYTES || /[\r\n]/.test(value)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '网络请求头值超过上限或包含非法换行。',
        `headers.${name}`,
      )
    }
    if (isWidgetNetworkForbiddenHeader(name)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '网络请求包含不允许的头字段。',
        `headers.${name}`,
      )
    }
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验宿主暴露的响应头只来自安全白名单，避免把 Cookie、跨域策略或其他浏览器内部状态带回 sandbox。
 */
function validateWidgetNetworkResponseHeaders(headers: WidgetNetworkHeaders): WidgetContractValidationResult {
  const entries = Object.entries(headers)
  if (entries.length > WIDGET_NETWORK_HEADER_COUNT_MAX) {
    return createWidgetContractValidationFailure(
      'INVALID_ARGUMENT',
      '网络响应头数量超过上限。',
      'headers',
    )
  }

  const allowedNames = new Set<string>(WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST)
  for (const [name, value] of entries) {
    const normalizedName = name.toLowerCase()
    if (!name || name.length > WIDGET_NETWORK_HEADER_NAME_MAX_LENGTH || /[\r\n]/.test(name)) {
      return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络响应头名称无效。', `headers.${name}`)
    }
    if (getUtf8ByteLength(value) > WIDGET_NETWORK_HEADER_VALUE_MAX_BYTES || /[\r\n]/.test(value)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '网络响应头值超过上限或包含非法换行。',
        `headers.${name}`,
      )
    }
    if (!allowedNames.has(normalizedName)) {
      return createWidgetContractValidationFailure(
        'INVALID_ARGUMENT',
        '网络响应头不在公开白名单中。',
        `headers.${name}`,
      )
    }
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验网络请求的 HTTPS URL、方法、头字段和正文大小；授权 origin、CORS、重定向与并发由宿主 Broker 处理。
 */
export function validateWidgetNetworkRequest(input: WidgetNetworkRequest): WidgetContractValidationResult {
  if (input.url.length > WIDGET_NETWORK_URL_MAX_LENGTH) {
    return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络 URL 超过长度上限。', 'url')
  }

  try {
    const parsedUrl = new URL(input.url)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络 URL 必须是无用户信息的 HTTPS 地址。', 'url')
    }
  } catch {
    return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络 URL 格式无效。', 'url')
  }

  if (!WIDGET_NETWORK_HTTP_METHODS.includes(input.method)) {
    return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络请求方法不受支持。', 'method')
  }

  const headerValidation = validateWidgetNetworkHeaders(input.headers ?? {})
  if (!headerValidation.valid) return headerValidation

  if (input.body !== undefined && getUtf8ByteLength(input.body) > WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES) {
    return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络请求正文超过大小上限。', 'body')
  }

  return createWidgetContractValidationSuccess()
}

/**
 * 校验宿主准备返回给组件的公开响应形状和正文上限，防止超限响应绕过 API v1 的 2 MiB 边界。
 */
export function validateWidgetNetworkResponse(input: WidgetNetworkResponse): WidgetContractValidationResult {
  if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
    return createWidgetContractValidationFailure('INVALID_ARGUMENT', '网络响应状态码无效。', 'status')
  }

  const headerValidation = validateWidgetNetworkResponseHeaders(input.headers)
  if (!headerValidation.valid) return headerValidation

  if (getUtf8ByteLength(input.body) > WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES) {
    return createWidgetContractValidationFailure('RESPONSE_TOO_LARGE', '网络响应正文超过大小上限。', 'body')
  }

  return createWidgetContractValidationSuccess()
}
