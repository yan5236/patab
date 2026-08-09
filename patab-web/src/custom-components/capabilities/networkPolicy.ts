import {
  validateWidgetNetworkRequest,
  type WidgetApiError,
  type WidgetNetworkHeaders,
  type WidgetNetworkHttpMethod,
  type WidgetNetworkRequest,
} from '@patab/widget-sdk'

/** Fetch 规范阻止的危险端口；HTTPS 默认端口不会出现在 URL.port，因此不需要单独放行。 */
const DANGEROUS_NETWORK_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 993, 995, 2049, 3659, 4045, 6000, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
])

/** 描述完成 DTO、地址和头字段清洗后的网络请求，不携带用户原始对象引用。 */
export interface NormalizedWidgetNetworkRequest {
  readonly url: string
  readonly origin: `https://${string}`
  readonly method: WidgetNetworkHttpMethod
  readonly headers: WidgetNetworkHeaders
  readonly body?: string
}

/** 描述纯网络策略层的稳定成功或失败，Broker 再负责把失败写成 RPC 响应。 */
export type WidgetNetworkPolicyResult =
  | { readonly valid: true; readonly request: NormalizedWidgetNetworkRequest }
  | { readonly valid: false; readonly error: WidgetApiError }

/** 判断未知值是否为可安全读取自有字段的普通记录，拒绝数组、访问器原型和宿主对象。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 构造不含 URL、Authorization 或请求正文的稳定参数失败。 */
function invalidNetworkParams(message: string, path?: string): WidgetNetworkPolicyResult {
  return {
    valid: false,
    error: { code: 'INVALID_ARGUMENT', message, ...(path ? { path } : {}) },
  }
}

/** 判断 hostname 是否是 IP 字面量或 localhost；v1 不为本机、私网或裸 IP 建立网络例外。 */
function isDisallowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)
  const isIpv6 = normalized.includes(':')
  return normalized === 'localhost' || normalized.endsWith('.localhost') || isIpv4 || isIpv6
}

/** 校验 URL 的 HTTPS、无凭据、非本机/裸 IP 与危险端口限制，并返回浏览器规范化后的实例。 */
function parseNetworkUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || isDisallowedHost(url.hostname)) return undefined
    const port = url.port ? Number(url.port) : undefined
    if (port !== undefined && (!Number.isInteger(port) || DANGEROUS_NETWORK_PORTS.has(port))) return undefined
    url.hash = ''
    return url
  } catch {
    return undefined
  }
}

/**
 * 规范化请求头名称并拒绝大小写重复键，使 Authorization 的唯一明确值能够安全通过而不会被覆盖。
 *
 * 具体危险字段与长度检查继续复用 SDK 公共校验器，保证组件 CLI、导入端和 Broker 不发生规则漂移。
 */
function normalizeHeaders(value: unknown): WidgetNetworkHeaders | undefined {
  if (value === undefined) return {}
  if (!isPlainRecord(value)) return undefined

  const headers: Record<string, string> = {}
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== 'string') return undefined
    const normalizedName = name.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(headers, normalizedName)) return undefined
    headers[normalizedName] = headerValue
  }
  return headers
}

/** 解析未受信 RPC params 的顶层形状，禁止 headers/body 以外的 fetch 初始化项进入宿主。 */
function parseNetworkRequestShape(value: unknown): WidgetNetworkRequest | undefined {
  if (!isPlainRecord(value)) return undefined
  const allowedKeys = new Set(['url', 'method', 'headers', 'body'])
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) return undefined
  if (typeof value.url !== 'string' || typeof value.method !== 'string') return undefined
  if (value.body !== undefined && typeof value.body !== 'string') return undefined

  const headers = normalizeHeaders(value.headers)
  if (!headers) return undefined
  return {
    url: value.url,
    method: value.method as WidgetNetworkHttpMethod,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(typeof value.body === 'string' ? { body: value.body } : {}),
  }
}

/**
 * 从不可信 RPC params 创建精确 origin 的网络请求。
 *
 * 该函数仅执行纯校验与复制，不会请求 DNS、发送 fetch 或记录原始 URL、Authorization 和正文。
 */
export function normalizeWidgetNetworkRequest(value: unknown): WidgetNetworkPolicyResult {
  const input = parseNetworkRequestShape(value)
  if (!input) return invalidNetworkParams('网络请求参数格式无效。', 'params')

  const sdkValidation = validateWidgetNetworkRequest(input)
  if (!sdkValidation.valid) {
    return { valid: false, error: sdkValidation.error }
  }

  const url = parseNetworkUrl(input.url)
  if (!url) return invalidNetworkParams('网络地址必须是安全的 HTTPS 公网地址。', 'url')
  if (url.origin !== `https://${url.host}`) return invalidNetworkParams('网络来源格式无效。', 'url')

  return {
    valid: true,
    request: {
      url: url.href,
      origin: url.origin as `https://${string}`,
      method: input.method,
      headers: { ...(input.headers ?? {}) },
      ...(input.body !== undefined ? { body: input.body } : {}),
    },
  }
}
