import {
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  type WidgetEvent,
  type WidgetEventName,
  type WidgetRequest,
  type WidgetResponse,
} from './rpc.js'
import type { WidgetApiError } from './errors.js'

/** SDK 等待宿主转移可信 MessagePort 的默认上限，与生产 Runtime 握手上限保持一致。 */
export const WIDGET_CLIENT_CONNECT_TIMEOUT_MS = 5_000

/** 单个 SDK 请求的默认等待上限；网络请求的宿主上限仍由 Broker 统一执行。 */
export const WIDGET_CLIENT_REQUEST_TIMEOUT_MS = 12_000

/** SDK 在拿不到可信端口、超时或已关闭后给调用方的稳定本地失败分类。 */
export type WidgetClientErrorCode = 'CLIENT_CLOSED' | 'CLIENT_CONNECT_TIMEOUT' | 'CLIENT_REQUEST_TIMEOUT' | 'CLIENT_UNAVAILABLE'

/**
 * 表示 SDK 自身的本地连接错误。
 *
 * 该错误只描述端口生命周期，宿主返回的公开 API 失败会使用 WidgetApiRequestError，二者都不会携带 DOM、端口或宿主异常。
 */
export class WidgetClientError extends Error {
  /** 创建仅包含稳定客户端失败分类的错误。 */
  constructor(readonly code: WidgetClientErrorCode) {
    super('组件 SDK 当前无法完成请求。')
    this.name = 'WidgetClientError'
  }
}

/** 表示 Broker 已返回的公开 API 失败，保留 SDK contracts 中的稳定错误码、消息和可选字段路径。 */
export class WidgetApiRequestError extends Error {
  /** 创建由 Broker 响应映射的 API 错误，绝不包装或暴露宿主内部异常。 */
  constructor(readonly apiError: WidgetApiError) {
    super(apiError.message)
    this.name = 'WidgetApiRequestError'
  }
}

/** SDK 客户端可接受的显式端口与超时配置；测试和模拟器可直接提供端口，生产 surface 则使用 connectPatabWidgetClient。 */
export interface WidgetClientOptions {
  readonly port: MessagePort
  readonly sessionId: string
  readonly requestTimeoutMs?: number
  readonly createRequestId?: () => string
}

/** connectPatabWidgetClient 等待生产 bootstrap 时使用的可替换 window 边界，避免 Node 测试依赖真实浏览器。 */
export interface WidgetClientConnectOptions {
  readonly target?: Window
  readonly timeoutMs?: number
  readonly requestTimeoutMs?: number
  readonly createRequestId?: () => string
}

/** 生产 bootstrap 暴露给 SDK 的最小窗口状态；字段只存在于同一个 opaque sandbox 文档内。 */
interface WidgetClientWindow extends Window {
  __PATAB_WIDGET_PORT__?: MessagePort
  __PATAB_WIDGET_SESSION_ID__?: string
}

/** 组件 SDK 自身使用的连接完成事件名；它不是跨 iframe postMessage 协议的一部分。 */
const WIDGET_CLIENT_CONNECTED_EVENT = 'patab-widget-connected'

/** 挂起请求的最小清理信息，确保超时、响应和 close 任一路径都只结算一次。 */
interface PendingWidgetRequest {
  readonly timer: ReturnType<typeof setTimeout>
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
}

/** 判断响应是否含有可安全关联的请求标识，忽略任意不符合公开 contracts 的端口消息。 */
function isWidgetResponse(value: unknown): value is WidgetResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const response = value as Partial<WidgetResponse>
  return typeof response.requestId === 'string' && typeof response.ok === 'boolean'
}

/** 判断异步事件是否属于当前会话和 API 主版本，避免 surface 脚本误收无关端口流量。 */
function isWidgetEvent(value: unknown, sessionId: string): value is WidgetEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<WidgetEvent>
  return event.protocol === WIDGET_RPC_PROTOCOL
    && event.apiVersion === WIDGET_RPC_API_VERSION
    && event.sessionId === sessionId
    && typeof event.event === 'string'
}

/** 使用 Web Crypto 生成可回显的请求标识；缺少 crypto 时使用进程内递增序列，仍不引入宿主状态。 */
function createDefaultRequestId(): string {
  if (globalThis.crypto?.randomUUID) return `sdk-${globalThis.crypto.randomUUID()}`
  return `sdk-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 提供单个 sandbox surface 的 MessagePort RPC 客户端。
 *
 * 实例只接受 Runtime 已转移的端口，绝不直接访问 window.parent、PaTab Store 或 postMessage；调用 close 后会拒绝并回收所有挂起请求。
 */
export class WidgetClient {
  private readonly pendingRequests = new Map<string, PendingWidgetRequest>()
  private readonly eventListeners = new Map<WidgetEventName, Set<(payload: unknown) => void>>()
  private readonly requestTimeoutMs: number
  private closed = false

  /** 绑定可信端口并开始接收公开 RPC 响应和生命周期事件。 */
  constructor(private readonly options: WidgetClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? WIDGET_CLIENT_REQUEST_TIMEOUT_MS
    options.port.addEventListener('message', this.handleMessage)
    options.port.start()
  }

  /** 返回当前 Runtime 绑定的只读会话标识，组件可用于本地诊断但不应把它发送到任何外部服务。 */
  get sessionId(): string {
    return this.options.sessionId
  }

  /**
   * 调用一个公开 Broker 方法并以泛型结果解析。
   *
   * requestId 会在客户端侧唯一占位，防止调用方注入重复 ID；宿主错误转换为 WidgetApiRequestError，本地连接错误使用 WidgetClientError。
   */
  request<TResult>(method: string, params: unknown): Promise<TResult> {
    if (this.closed) return Promise.reject(new WidgetClientError('CLIENT_CLOSED'))
    const requestId = this.createUniqueRequestId()
    const request: WidgetRequest = {
      protocol: WIDGET_RPC_PROTOCOL,
      apiVersion: WIDGET_RPC_API_VERSION,
      sessionId: this.options.sessionId,
      requestId,
      method,
      params,
    }

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new WidgetClientError('CLIENT_REQUEST_TIMEOUT'))
      }, this.requestTimeoutMs)
      this.pendingRequests.set(requestId, {
        timer,
        resolve: (result) => resolve(result as TResult),
        reject,
      })
      try {
        this.options.port.postMessage(request)
      } catch {
        this.finishPendingRequest(requestId, new WidgetClientError('CLIENT_UNAVAILABLE'))
      }
    })
  }

  /**
   * 订阅一个公开生命周期或实例通道事件。
   *
   * 返回的函数只移除当前监听器；SDK 不会因为一个监听器抛错而影响其余监听器或端口处理。
   */
  subscribe<TPayload>(event: WidgetEventName, listener: (payload: TPayload) => void): () => void {
    const listeners = this.eventListeners.get(event) ?? new Set<(payload: unknown) => void>()
    const wrapped = listener as (payload: unknown) => void
    listeners.add(wrapped)
    this.eventListeners.set(event, listeners)
    return () => {
      listeners.delete(wrapped)
      if (listeners.size === 0) this.eventListeners.delete(event)
    }
  }

  /**
   * 关闭端口并以稳定错误拒绝尚未完成的请求。
   *
   * 此方法幂等，组件的卸载、HMR 清理和用户调用可以安全重叠，不会遗留计时器或事件监听。
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.options.port.removeEventListener('message', this.handleMessage)
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new WidgetClientError('CLIENT_CLOSED'))
      this.pendingRequests.delete(requestId)
    }
    this.eventListeners.clear()
    this.options.port.close()
  }

  /** 处理可信端口上的响应或事件，未知值、不同 session 和闭合后消息都会被安全忽略。 */
  private readonly handleMessage = (messageEvent: MessageEvent<unknown>): void => {
    if (this.closed) return
    if (isWidgetResponse(messageEvent.data)) {
      const response = messageEvent.data
      if (response.ok) this.finishPendingRequest(response.requestId, undefined, response.result)
      else this.finishPendingRequest(response.requestId, new WidgetApiRequestError(response.error))
      return
    }
    if (!isWidgetEvent(messageEvent.data, this.options.sessionId)) return
    const listeners = this.eventListeners.get(messageEvent.data.event)
    if (!listeners) return
    for (const listener of [...listeners]) {
      try {
        listener(messageEvent.data.payload)
      } catch {
        // 第三方监听器属于应用代码；它的异常不能中断同一 surface 的后续 API 通讯。
      }
    }
  }

  /** 完成并回收一个挂起请求；未知 requestId 可能来自旧端口消息，因此保持静默。 */
  private finishPendingRequest(requestId: string, error?: unknown, result?: unknown): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingRequests.delete(requestId)
    if (error !== undefined) pending.reject(error)
    else pending.resolve(result)
  }

  /** 生成当前客户端未占用的请求标识，避免测试注入器或低熵环境制造本地重复关联。 */
  private createUniqueRequestId(): string {
    const createRequestId = this.options.createRequestId ?? createDefaultRequestId
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const requestId = createRequestId()
      if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) && !this.pendingRequests.has(requestId)) return requestId
    }
    throw new WidgetClientError('CLIENT_UNAVAILABLE')
  }
}

/** 从生产 surface bootstrap 读取已转移的端口；端口或令牌任一缺失都不能提前创建 SDK。 */
function readConnectedClient(target: WidgetClientWindow, options: WidgetClientConnectOptions): WidgetClient | undefined {
  const port = target.__PATAB_WIDGET_PORT__
  const sessionId = target.__PATAB_WIDGET_SESSION_ID__
  return port && typeof sessionId === 'string' && sessionId.length > 0
    ? new WidgetClient({ port, sessionId, requestTimeoutMs: options.requestTimeoutMs, createRequestId: options.createRequestId })
    : undefined
}

/**
 * 等待 Runtime bootstrap 完成可信端口转移后创建 SDK 客户端。
 *
 * 生产页面必须先由宿主 prepareSandboxSurfaceHtml 注入 bootstrap；此函数只观察同文档事件，不向 parent 发起宽泛握手或接受任意 postMessage。
 */
export function connectPatabWidgetClient(options: WidgetClientConnectOptions = {}): Promise<WidgetClient> {
  const target = (options.target ?? globalThis.window) as WidgetClientWindow | undefined
  if (!target) return Promise.reject(new WidgetClientError('CLIENT_UNAVAILABLE'))
  const readyClient = readConnectedClient(target, options)
  if (readyClient) return Promise.resolve(readyClient)

  return new Promise<WidgetClient>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      target.removeEventListener(WIDGET_CLIENT_CONNECTED_EVENT, onConnected)
      reject(new WidgetClientError('CLIENT_CONNECT_TIMEOUT'))
    }, options.timeoutMs ?? WIDGET_CLIENT_CONNECT_TIMEOUT_MS)
    const onConnected = (): void => {
      const client = readConnectedClient(target, options)
      if (!client) return
      clearTimeout(timeoutId)
      target.removeEventListener(WIDGET_CLIENT_CONNECTED_EVENT, onConnected)
      resolve(client)
    }
    target.addEventListener(WIDGET_CLIENT_CONNECTED_EVENT, onConnected, { once: false })
  })
}
