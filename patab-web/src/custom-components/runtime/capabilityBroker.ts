import {
  WIDGET_NETWORK_CONCURRENCY_MAX,
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  type WidgetApiError,
  type WidgetEvent,
  type WidgetPermission,
  type WidgetRequest,
  type WidgetResponse,
} from '@patab/widget-sdk'

/** 单次 RPC 请求允许的最大序列化体积。 */
export const BROKER_REQUEST_MAX_BYTES = 256 * 1024

/** 同一实例 channel 事件允许的最大序列化体积，供阶段 6 发布消息时复用。 */
export const BROKER_INSTANCE_MESSAGE_MAX_BYTES = 64 * 1024

/** 单实例十秒滚动窗口最多可提交的 RPC 请求数。 */
export const BROKER_REQUEST_LIMIT_PER_WINDOW = 100

/** 请求与 toast 限流共用的滚动窗口长度。 */
export const BROKER_RATE_WINDOW_MS = 10_000

/** 所有普通 RPC 的最大未完成数量，网络请求也计入该总数。 */
export const BROKER_CONCURRENCY_MAX = 16

/** 单实例 UI toast 的滚动窗口最大次数。 */
export const BROKER_TOAST_LIMIT_PER_WINDOW = 3

/** 连续触发限流达到此阈值后销毁 session，避免恶意 surface 长时间占用消息通道。 */
export const BROKER_FLOOD_VIOLATION_LIMIT = 3

/** Broker 运行时验证权限快照的最小接口；每次调用都必须重新读取，不能缓存授权。 */
export interface WidgetPermissionSource {
  readonly hasPermission: (session: WidgetBrokerSession, permission: WidgetPermission) => Promise<boolean>
  /** 查询已安装组件仍持有的精确网络来源授权；未实现时网络 Capability 必须默认拒绝。 */
  readonly hasNetworkOrigin?: (session: WidgetBrokerSession, origin: `https://${string}`) => Promise<boolean>
}

/** Broker 绑定端口时固定的组件、实例、版本与会话边界。 */
export interface WidgetBrokerSession {
  readonly componentId: string
  readonly componentVersion: string
  readonly instanceId: string
  readonly sessionId: string
}

/** 领域能力注册给 Broker 的最小方法描述；阶段 6 才会填充具体 storage、UI、todos 与 network 实现。 */
export interface WidgetBrokerMethod {
  readonly requiredPermissions?: readonly WidgetPermission[]
  readonly kind?: 'network' | 'toast'
  readonly validateParams?: (params: unknown) => WidgetApiError | undefined
  readonly invoke: (params: unknown, session: WidgetBrokerSession) => Promise<unknown> | unknown
}

/**
 * 表示领域 Capability 已映射好的公开失败。
 *
 * Repository、宿主 UI 或外链适配器只能通过此类型把既有 SDK 错误码交回 Broker，
 * Broker 仍是唯一负责写入 RPC 响应的边界，避免各能力自行创建第二套响应协议。
 */
export class WidgetBrokerMethodError extends Error {
  /** 创建不含宿主异常、私有数据或调用栈的稳定 Capability 失败。 */
  constructor(readonly error: WidgetApiError) {
    super(error.message)
    this.name = 'WidgetBrokerMethodError'
  }
}

/** Broker 可记录的脱敏诊断类别；禁止把请求参数、Authorization 或异常对象交给监听器。 */
export type WidgetBrokerDiagnostic =
  | 'concurrency-limit'
  | 'duplicate-request-id'
  | 'invalid-request'
  | 'permission-denied'
  | 'rate-limited'
  | 'unknown-method'

/** 创建 Broker 所需的端口、会话与可插拔领域方法。 */
export interface WidgetCapabilityBrokerOptions {
  readonly port: MessagePort
  readonly session: WidgetBrokerSession
  readonly permissions: WidgetPermissionSource
  readonly methods: Readonly<Record<string, WidgetBrokerMethod>>
  readonly onDiagnostic?: (diagnostic: WidgetBrokerDiagnostic) => void
  readonly onFlood?: () => void
  readonly now?: () => number
}

/**
 * 判断未知值是否为可安全读取自有字段的普通记录。
 *
 * RPC 边界拒绝数组、函数实例和原型对象，防止 getter、原型污染或宿主对象穿透到 Capability。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * 计算未知消息的 JSON UTF-8 字节数。
 *
 * 不能安全序列化的循环、BigInt 或 undefined 请求会返回 undefined，并按无效请求处理而不是抛出内部异常。
 */
function getMessageBytes(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? new TextEncoder().encode(serialized).byteLength : undefined
  } catch {
    return undefined
  }
}

/** 检查请求对象未携带 SDK 契约之外的未知顶层字段。 */
function hasOnlyRequestKeys(value: Record<string, unknown>): boolean {
  const allowedKeys = new Set(['protocol', 'apiVersion', 'sessionId', 'requestId', 'method', 'params'])
  return Object.keys(value).every((key) => allowedKeys.has(key))
}

/** 检查请求标识可被 SDK 稳定回显，同时限制它不能成为日志或内存放大载荷。 */
function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
}

/** 检查 API v1 方法名只含稳定 ASCII 分段，避免把任意对象路径解释为方法。 */
function isMethodName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/.test(value) && value.length <= 128
}

/** 构造不含宿主异常或载荷的稳定错误。 */
function createError(code: WidgetApiError['code'], message: string, path?: string): WidgetApiError {
  return { code, message, ...(path ? { path } : {}) }
}

/** 将内部成功结果映射为公开 RPC 响应。 */
function createSuccessResponse(requestId: string, result: unknown): WidgetResponse {
  return { requestId, ok: true, ...(result === undefined ? {} : { result }) }
}

/** 将任一拒绝原因映射为不泄露宿主实现的公开 RPC 响应。 */
function createFailureResponse(requestId: string, error: WidgetApiError): WidgetResponse {
  return { requestId, ok: false, error }
}

/**
 * 提供按实例会话工作的 Capability Broker。
 *
 * Broker 只处理经过 SandboxAdapter 验证的 MessagePort；它不读取 DOM、Pinia 或 Repository，实现由权限源和能力注册表注入。
 */
export class WidgetCapabilityBroker {
  private readonly usedRequestIds = new Set<string>()
  private readonly requestTimestamps: number[] = []
  private readonly toastTimestamps: number[] = []
  private readonly floodTimestamps: number[] = []
  private inFlight = 0
  private inFlightNetwork = 0
  private destroyed = false

  /** 绑定端口并立即启动消息接收；上层 destroy 后所有后续调用都会被忽略。 */
  constructor(private readonly options: WidgetCapabilityBrokerOptions) {
    options.port.onmessage = (event) => {
      void this.handleMessage(event.data)
    }
    options.port.start()
  }

  /**
   * 停止接收 RPC 并关闭端口。
   *
   * 方法幂等，Runtime 可以在 iframe 卸载、超时恢复和用户关闭 modal 三条路径重复调用而不遗留监听器。
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.options.port.onmessage = null
    this.options.port.close()
  }

  /**
   * 校验即将发给当前实例的异步消息尺寸。
   *
   * 阶段 6 的 channel/lifecycle 事件必须先调用此函数，保证 64 KiB 边界不会被绕过。
   */
  canSendInstanceMessage(message: unknown): boolean {
    const bytes = getMessageBytes(message)
    return bytes !== undefined && bytes <= BROKER_INSTANCE_MESSAGE_MAX_BYTES
  }

  /**
   * 向当前已握手 surface 投递一个经过同一实例消息配额校验的公开事件。
   *
   * 事件不会进入 RPC requestId 流；在 session 销毁、序列化失败或超过 64 KiB 时静默返回 false，
   * 以免订阅通知反过来破坏已提交的存储事务或把 DataCloneError 暴露给第三方。
   */
  sendEvent<TPayload>(event: WidgetEvent<TPayload>): boolean {
    if (this.destroyed || event.sessionId !== this.options.session.sessionId) return false
    if (!this.canSendInstanceMessage(event)) return false
    try {
      this.options.port.postMessage(event)
      return true
    } catch {
      return false
    }
  }

  /** 处理 MessagePort 收到的单个请求，并保证任何异常都不会从异步事件处理器泄露。 */
  private async handleMessage(input: unknown): Promise<void> {
    if (this.destroyed) return

    const requestId = isPlainRecord(input) && isRequestId(input.requestId) ? input.requestId : ''
    const response = await this.dispatch(input, requestId)
    if (!this.destroyed) {
      this.options.port.postMessage(response)
    }
  }

  /** 按固定顺序完成请求体积、协议、会话、Schema、限流、权限和能力调用检查。 */
  private async dispatch(input: unknown, requestId: string): Promise<WidgetResponse> {
    const byteLength = getMessageBytes(input)
    if (byteLength === undefined || byteLength > BROKER_REQUEST_MAX_BYTES) {
      this.recordDiagnostic('invalid-request')
      return createFailureResponse(requestId, createError('INVALID_REQUEST', '组件请求格式无效或超过允许大小。'))
    }

    if (!isPlainRecord(input) || !hasOnlyRequestKeys(input) || !isRequestId(input.requestId) || !isMethodName(input.method)) {
      this.recordDiagnostic('invalid-request')
      return createFailureResponse(requestId, createError('INVALID_REQUEST', '组件请求格式无效。'))
    }

    const request = input as unknown as WidgetRequest
    if (request.protocol !== WIDGET_RPC_PROTOCOL || request.apiVersion !== WIDGET_RPC_API_VERSION) {
      this.recordDiagnostic('invalid-request')
      return createFailureResponse(request.requestId, createError('API_INCOMPATIBLE', '组件请求的 API 版本不兼容。'))
    }
    if (request.sessionId !== this.options.session.sessionId) {
      this.recordDiagnostic('invalid-request')
      return createFailureResponse(request.requestId, createError('INVALID_REQUEST', '组件会话无效。'))
    }
    if (this.usedRequestIds.has(request.requestId)) {
      this.recordDiagnostic('duplicate-request-id')
      return createFailureResponse(request.requestId, createError('INVALID_REQUEST', '请求标识已使用。', 'requestId'))
    }
    this.usedRequestIds.add(request.requestId)

    const now = (this.options.now ?? Date.now)()
    if (!this.acceptTimestamp(this.requestTimestamps, now, BROKER_REQUEST_LIMIT_PER_WINDOW)) {
      this.recordFlood(now)
      this.recordDiagnostic('rate-limited')
      return createFailureResponse(request.requestId, createError('RATE_LIMITED', '组件请求过于频繁。'))
    }

    const method = this.options.methods[request.method]
    if (!method) {
      this.recordDiagnostic('unknown-method')
      return createFailureResponse(request.requestId, createError('UNKNOWN_METHOD', '组件请求的方法不受支持。', 'method'))
    }
    if (method.kind === 'toast' && !this.acceptTimestamp(this.toastTimestamps, now, BROKER_TOAST_LIMIT_PER_WINDOW)) {
      this.recordFlood(now)
      this.recordDiagnostic('rate-limited')
      return createFailureResponse(request.requestId, createError('RATE_LIMITED', '组件提示调用过于频繁。'))
    }
    if (this.inFlight >= BROKER_CONCURRENCY_MAX || (method.kind === 'network' && this.inFlightNetwork >= WIDGET_NETWORK_CONCURRENCY_MAX)) {
      this.recordDiagnostic('concurrency-limit')
      return createFailureResponse(request.requestId, createError('CONCURRENCY_LIMIT', '组件请求并发数量超过上限。'))
    }

    const parameterError = method.validateParams?.(request.params)
    if (parameterError) {
      this.recordDiagnostic('invalid-request')
      return createFailureResponse(request.requestId, parameterError)
    }
    for (const permission of method.requiredPermissions ?? []) {
      if (!await this.options.permissions.hasPermission(this.options.session, permission)) {
        this.recordDiagnostic('permission-denied')
        return createFailureResponse(request.requestId, createError('PERMISSION_DENIED', '当前组件未获所需权限。'))
      }
    }

    this.inFlight += 1
    if (method.kind === 'network') this.inFlightNetwork += 1
    try {
      return createSuccessResponse(request.requestId, await method.invoke(request.params, this.options.session))
    } catch (error) {
      if (error instanceof WidgetBrokerMethodError) {
        return createFailureResponse(request.requestId, error.error)
      }
      return createFailureResponse(request.requestId, createError('INVALID_REQUEST', '组件请求未能完成。'))
    } finally {
      this.inFlight -= 1
      if (method.kind === 'network') this.inFlightNetwork -= 1
    }
  }

  /** 清除窗口外时间戳后尝试记录一次调用，统一维护滚动窗口语义。 */
  private acceptTimestamp(timestamps: number[], now: number, limit: number): boolean {
    const firstAcceptedAt = now - BROKER_RATE_WINDOW_MS
    while (timestamps[0] !== undefined && timestamps[0] <= firstAcceptedAt) timestamps.shift()
    if (timestamps.length >= limit) return false
    timestamps.push(now)
    return true
  }

  /** 记录持续洪泛；只有连续超限达到阈值时才要求 Runtime 销毁 iframe。 */
  private recordFlood(now: number): void {
    const firstAcceptedAt = now - BROKER_RATE_WINDOW_MS
    while (this.floodTimestamps[0] !== undefined && this.floodTimestamps[0] <= firstAcceptedAt) {
      this.floodTimestamps.shift()
    }
    this.floodTimestamps.push(now)
    if (this.floodTimestamps.length >= BROKER_FLOOD_VIOLATION_LIMIT) {
      this.options.onFlood?.()
    }
  }

  /** 隔离可选诊断监听器异常，保证诊断本身不能影响 Broker 或暴露载荷。 */
  private recordDiagnostic(diagnostic: WidgetBrokerDiagnostic): void {
    try {
      this.options.onDiagnostic?.(diagnostic)
    } catch {
      // 诊断属于外部观察；它失败时不能改变已经确定的 RPC 结果。
    }
  }
}
