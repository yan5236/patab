import {
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  type WidgetContext,
  type WidgetErrorCode,
  type WidgetTileSize,
} from '@patab/widget-sdk'

import {
  createWidgetChannelBrokerMethods,
  getDefaultInstanceChannelHub,
  type InstanceChannelHub,
} from '@/custom-components/capabilities/channel'
import { createWidgetContextCapability, type WidgetLifecycleUpdate } from '@/custom-components/capabilities/context'
import { createBrowserWidgetExternalAdapter, createWidgetExternalBrokerMethods, type WidgetExternalAdapter } from '@/custom-components/capabilities/external'
import { getWidgetHostFeedback, type WidgetHostFeedback } from '@/custom-components/capabilities/hostFeedback'
import { createWidgetNetworkBrokerMethods } from '@/custom-components/capabilities/network'
import {
  createMv3WidgetNetworkAdapter,
  createWebWidgetNetworkAdapter,
  type WidgetNetworkAdapter,
} from '@/custom-components/capabilities/networkAdapters'
import { createWidgetStorageBrokerMethods } from '@/custom-components/capabilities/storage'
import { createWidgetSurfaceBrokerMethods } from '@/custom-components/capabilities/surfaces'
import { createWidgetUiBrokerMethods } from '@/custom-components/capabilities/ui'
import {
  getActiveComponentVersion,
  getInstalledComponent,
  readActiveComponentFile,
} from '@/custom-components/repository/componentPackageRepository'
import { subscribeInstanceStorage } from '@/custom-components/repository/instanceStorageRepository'
import type { RuntimeFailureReason } from '@/custom-components/repository/runtimeHealthRepository'
import type { RuntimeHealthReporter } from '@/custom-components/safety/runtimeHealthReporter'

import {
  WidgetCapabilityBroker,
  type WidgetBrokerDiagnostic,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
  type WidgetPermissionSource,
} from './capabilityBroker'
import { SandboxAdapterError } from './protocol'
import { createRepositoryPermissionSource, getRepositoryPermissionSnapshot } from './permissions'
import { type SandboxAdapter, type SandboxMountHandle } from './sandboxAdapter'
import {
  startStagedSandboxSurface,
  StagedSandboxRuntimeError,
  type StagedSandboxRuntimeHandle,
  type StartStagedSandboxSurfaceRequest,
} from './stagedSandboxRunner'
import { prepareSandboxSurfaceHtml } from './surfaceHtml'
import { createWidgetThemeStyle, getWidgetThemeTokens } from './widgetTheme'

/** SDK 健康握手的固定上限；调用方不得把生产启动超时放宽到五秒之外。 */
export const SANDBOX_RUNTIME_HANDSHAKE_TIMEOUT_MS = 5_000

/** Runtime 启动输入只包含实例引用与所需 surface，不允许业务层传入任意 HTML 或权限。 */
export interface StartSandboxSurfaceRequest {
  readonly componentId: string
  readonly instanceId: string
  readonly surface: string
  readonly container: HTMLElement
  /** 宿主图块或 modal 提供的当前公开上下文，不接受 Store、DOM 或响应式对象。 */
  readonly context?: Partial<Pick<WidgetContext, 'locale' | 'theme' | 'reducedMotion' | 'size' | 'variantId' | 'visible'>>
}

/** 宿主可在启动时提供的公开上下文覆盖项；尺寸和 variant 后续可通过生命周期 API 更新。 */
export interface WidgetRuntimeContextSource {
  readonly getSnapshot?: (input: {
    readonly componentId: string
    readonly instanceId: string
    readonly surface: string
    readonly defaultSize: WidgetTileSize
    readonly defaultVariantId?: string
  }) => Partial<Pick<WidgetContext, 'locale' | 'theme' | 'reducedMotion' | 'size' | 'variantId' | 'visible'>>
}

/** Runtime 对外暴露的稳定启动失败；不会携带 HTML、DOMException、扩展 URL、token 或堆栈。 */
export class SandboxRuntimeError extends Error {
  /** 创建可由宿主 UI 映射为可恢复占位状态的运行时错误。 */
  constructor(readonly code: Extract<WidgetErrorCode, 'INSTANCE_DISABLED' | 'SURFACE_NOT_DECLARED' | 'TIMEOUT'>) {
    super('自定义组件无法启动。')
    this.name = 'SandboxRuntimeError'
  }
}

/** 已启动 surface 提供给宿主 UI 的最小控制句柄；端口只保留在 Broker 内部。 */
export interface SandboxRuntimeHandle {
  readonly frameElement: HTMLIFrameElement
  readonly session: WidgetBrokerSession
  destroy(): void
}

/** 阶段 9 更新服务通过 Runtime 启动受限 staged migration/健康 surface 的输入。 */
export type { StagedSandboxRuntimeHandle, StartStagedSandboxSurfaceRequest }

/** Runtime 的可替换依赖；基础能力默认注入，后续领域能力通过 methods 追加而非重建 Broker。 */
export interface SandboxRuntimeOptions {
  readonly adapter: SandboxAdapter
  readonly methods?: Readonly<Record<string, WidgetBrokerMethod>>
  readonly permissions?: WidgetPermissionSource
  readonly context?: WidgetRuntimeContextSource
  readonly feedback?: WidgetHostFeedback
  readonly external?: WidgetExternalAdapter
  /** Web/MV3 网络差异只通过此薄适配器注入，Capability 始终复用相同 Broker 与权限源。 */
  readonly network?: WidgetNetworkAdapter
  readonly channelHub?: InstanceChannelHub
  readonly createSessionToken?: () => string
  readonly onDiagnostic?: (diagnostic: WidgetBrokerDiagnostic) => void
  /** 健康计数通过独立安全模块注入，Runtime 不读取 runtimeHealth 表或解释其存储格式。 */
  readonly health?: RuntimeHealthReporter
  /** 达到自动停用阈值时通知宿主轻量引用；回调只接收稳定 ID 与失败类别。 */
  readonly onInstanceAutoDisabled?: (input: {
    readonly componentId: string
    readonly instanceId: string
    readonly reason: RuntimeFailureReason
  }) => void
}

/** Runtime 内部追踪的已启动 surface，集中保存所有需要在 destroy 时清理的订阅。 */
interface ActiveSandboxSession {
  readonly handle: SandboxRuntimeHandle
  readonly broker: WidgetCapabilityBroker
  readonly context: ReturnType<typeof createWidgetContextCapability>
  readonly unsubscribeStorage: () => void
}

/** 生成与 iframe 生命周期绑定的一次性会话令牌；缺少 Web Crypto 时不能安全启动第三方代码。 */
function createDefaultSessionToken(): string {
  if (!globalThis.crypto?.randomUUID) throw new SandboxRuntimeError('INSTANCE_DISABLED')
  return globalThis.crypto.randomUUID()
}

/** 根据会话三元组创建内部索引，允许同一实例的 widget/detail/settings 分别运行且独立销毁。 */
function createSessionKey(session: WidgetBrokerSession): string {
  return `${session.componentId}\0${session.instanceId}\0${session.sessionId}`
}

/** 复制公开尺寸，阻断宿主响应式对象或调用方后续修改穿透 SDK DTO。 */
function cloneSize(size: WidgetTileSize): WidgetTileSize {
  return { w: size.w, h: size.h } as WidgetTileSize
}

/** 判断未知值是否是 API v1 支持的四档图块尺寸。 */
function isWidgetTileSize(value: unknown): value is WidgetTileSize {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as { w?: unknown; h?: unknown }
  return (candidate.w === 1 && candidate.h === 1)
    || (candidate.w === 2 && candidate.h === 2)
    || (candidate.w === 3 && candidate.h === 2)
    || (candidate.w === 4 && candidate.h === 2)
}

/** 从当前文档读取可公开的全局默认状态；没有 DOM 的测试环境固定回退到安全默认值。 */
function readDocumentContextDefaults(): Pick<WidgetContext, 'locale' | 'theme' | 'reducedMotion' | 'visible'> {
  const root = globalThis.document?.documentElement
  const locale = root?.lang === 'en-US' ? 'en-US' : 'zh-CN'
  const theme = root?.dataset.theme === 'dark' ? 'dark' : 'light'
  const reducedMotion = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  return { locale, theme, reducedMotion, visible: globalThis.document?.visibilityState !== 'hidden' }
}

/**
 * 组合 Manifest 默认值、文档状态与宿主提供的公开覆盖项。
 *
 * 覆盖值即使来自宿主也必须通过白名单校验，避免错误的内部状态对象进入第三方 context。
 */
function createInitialContext(
  componentId: string,
  instanceId: string,
  componentVersion: string,
  surface: string,
  defaultSize: WidgetTileSize,
  defaultVariantId: string | undefined,
  permissions: WidgetContext['permissions'],
  source: WidgetRuntimeContextSource | undefined,
  requestContext: StartSandboxSurfaceRequest['context'],
): WidgetContext {
  const defaults = readDocumentContextDefaults()
  const overrides = {
    ...source?.getSnapshot?.({ componentId, instanceId, surface, defaultSize: cloneSize(defaultSize), defaultVariantId }),
    ...requestContext,
  }
  const locale = overrides?.locale === 'en-US' || overrides?.locale === 'zh-CN' ? overrides.locale : defaults.locale
  const theme = overrides?.theme === 'dark' || overrides?.theme === 'light' ? overrides.theme : defaults.theme
  const reducedMotion = typeof overrides?.reducedMotion === 'boolean' ? overrides.reducedMotion : defaults.reducedMotion
  const visible = typeof overrides?.visible === 'boolean' ? overrides.visible : defaults.visible
  const size = isWidgetTileSize(overrides?.size) ? cloneSize(overrides.size) : cloneSize(defaultSize)
  const variantId = typeof overrides?.variantId === 'string' && overrides.variantId.length > 0
    ? overrides.variantId
    : defaultVariantId
  return {
    componentId,
    instanceId,
    componentVersion,
    apiVersion: WIDGET_RPC_API_VERSION,
    surface,
    size,
    ...(variantId ? { variantId } : {}),
    locale,
    theme,
    reducedMotion,
    visible,
    permissions,
  }
}

/**
 * 编排已安装包到 SandboxAdapter 的安全启动和基础 API 生命周期。
 *
 * Runtime 只从活动 Repository 读取已验证 surface；其默认方法表由阶段 6 注入 context、storage、
 * channel、宿主反馈和外链能力，后续领域能力只能在同一个 Broker 上追加。
 */
export class SandboxRuntime {
  private readonly activeSessions = new Map<string, ActiveSandboxSession>()
  private lifecycleCleanup: (() => void) | undefined

  /** 创建 Runtime；默认使用 Repository 动态权限读取器、页面共享实例 Channel Hub 和浏览器外链适配器。 */
  constructor(private readonly options: SandboxRuntimeOptions) {}

  /**
   * 读取活动包、检查声明 surface、注入 CSP 后启动唯一 iframe 与基础 Broker 方法。
   *
   * 缺包、卸载、暂存版本、非字符串文件或未声明 surface 都在创建 iframe 前拒绝，
   * 不会执行任意第三方内容，也不会留下 storage/channel 订阅。
   */
  async start(request: StartSandboxSurfaceRequest): Promise<SandboxRuntimeHandle> {
    if (!request.componentId || !request.instanceId || !request.surface) throw new SandboxRuntimeError('INSTANCE_DISABLED')

    const [component, version] = await Promise.all([
      getInstalledComponent(request.componentId),
      getActiveComponentVersion(request.componentId),
    ])
    if (!component || !version || component.activeVersion !== version.version || !version.isActive || version.stagedUpdateId) {
      throw new SandboxRuntimeError('INSTANCE_DISABLED')
    }
    const declaration = version.manifest.surfaces[request.surface]
    if (!declaration) throw new SandboxRuntimeError('SURFACE_NOT_DECLARED')

    const file = await readActiveComponentFile(request.componentId, declaration.entry)
    if (!file || typeof file.content !== 'string') throw new SandboxRuntimeError('INSTANCE_DISABLED')

    const session: WidgetBrokerSession = {
      componentId: request.componentId,
      componentVersion: version.version,
      instanceId: request.instanceId,
      sessionId: (this.options.createSessionToken ?? createDefaultSessionToken)(),
    }

    const permissions = this.options.permissions ?? createRepositoryPermissionSource()
    const permissionSnapshot = await getRepositoryPermissionSnapshot(session).catch(() => ({ granted: [], networkOrigins: [] }))
    const context = createWidgetContextCapability(createInitialContext(
      session.componentId,
      session.instanceId,
      session.componentVersion,
      request.surface,
      version.manifest.defaultSize,
      version.manifest.defaultVariant,
      permissionSnapshot,
      this.options.context,
      request.context,
    ))
    const themeTokens = getWidgetThemeTokens()
    let preparedHtml: string
    try {
      preparedHtml = prepareSandboxSurfaceHtml(file.content, {
        hostThemeStyle: createWidgetThemeStyle(themeTokens),
      })
    } catch {
      throw new SandboxRuntimeError('INSTANCE_DISABLED')
    }

    let mountHandle: SandboxMountHandle
    try {
      mountHandle = await this.options.adapter.mount({
        container: request.container,
        surfaceHtml: preparedHtml,
        sessionToken: session.sessionId,
        handshakeTimeoutMs: SANDBOX_RUNTIME_HANDSHAKE_TIMEOUT_MS,
      })
    } catch (error) {
      const reason: RuntimeFailureReason = error instanceof SandboxAdapterError && error.code === 'handshake-timeout'
        ? 'handshake-timeout'
        : 'handshake-failed'
      await this.reportRuntimeFailure(session, reason)
      if (reason === 'handshake-timeout') throw new SandboxRuntimeError('TIMEOUT')
      throw new SandboxRuntimeError('INSTANCE_DISABLED')
    }
    await this.reportRuntimeHealthy(session)

    const channelHub = this.options.channelHub ?? getDefaultInstanceChannelHub()
    const feedback = this.options.feedback ?? getWidgetHostFeedback()
    const external = this.options.external ?? createBrowserWidgetExternalAdapter()
    const network = this.options.network ?? (this.options.adapter.environment === 'mv3'
      ? createMv3WidgetNetworkAdapter()
      : createWebWidgetNetworkAdapter())
    let broker: WidgetCapabilityBroker | undefined
    let unsubscribeStorage: (() => void) | undefined
    let destroyed = false
    const sessionKey = createSessionKey(session)
    const handle: SandboxRuntimeHandle = {
      frameElement: mountHandle.frameElement,
      session,
      destroy: () => {
        if (destroyed) return
        destroyed = true
        unsubscribeStorage?.()
        channelHub.removeSession(session)
        broker?.destroy()
        mountHandle.destroy()
        this.activeSessions.delete(sessionKey)
        this.releaseLifecycleObserversWhenIdle()
      },
    }
    const baseMethods: Readonly<Record<string, WidgetBrokerMethod>> = {
      ...context.methods,
      ...createWidgetStorageBrokerMethods(),
      ...createWidgetChannelBrokerMethods(session, channelHub, {
        canSend: (payload) => broker?.canSendInstanceMessage({
          protocol: WIDGET_RPC_PROTOCOL,
          apiVersion: WIDGET_RPC_API_VERSION,
          sessionId: session.sessionId,
          event: 'channelMessage',
          payload,
        }) ?? false,
        emit: (payload) => broker?.sendEvent({
          protocol: WIDGET_RPC_PROTOCOL,
          apiVersion: WIDGET_RPC_API_VERSION,
          sessionId: session.sessionId,
          event: 'channelMessage',
          payload,
        }) ?? false,
      }),
      ...createWidgetUiBrokerMethods(session, feedback),
      ...createWidgetSurfaceBrokerMethods(
        session,
        new Set(Object.keys(version.manifest.surfaces)),
        version.manifest.variants?.length ?? 0,
      ),
      ...createWidgetExternalBrokerMethods(session, feedback, external),
      ...createWidgetNetworkBrokerMethods(permissions, network),
    }
    broker = new WidgetCapabilityBroker({
      port: mountHandle.port,
      session,
      permissions,
      methods: { ...baseMethods, ...(this.options.methods ?? {}) },
      onDiagnostic: this.options.onDiagnostic,
      onFlood: () => {
        handle.destroy()
        void this.reportRuntimeFailure(session, 'protocol-flood')
      },
    })
    unsubscribeStorage = subscribeInstanceStorage(
      { componentId: session.componentId, instanceId: session.instanceId },
      (change) => {
        broker?.sendEvent({
          protocol: WIDGET_RPC_PROTOCOL,
          apiVersion: WIDGET_RPC_API_VERSION,
          sessionId: session.sessionId,
          event: 'storageChanged',
          payload: { key: change.key, operation: change.operation },
        })
      },
    )
    this.activeSessions.set(sessionKey, { handle, broker, context, unsubscribeStorage })
    this.ensureLifecycleObservers()
    return handle
  }

  /**
   * 在既有 Runtime 的 Adapter、CSP、MessageChannel 与 Broker 协议中启动一次受限 staged surface。
   *
   * 暂存 surface 不加入活动 session，不读取活动包或 grant；它只由更新服务用于 migration 和离屏
   * 健康握手，完成后必须立即销毁，因此不能通过此入口提前切换用户正在使用的版本。
   */
  async startStagedUpdateSurface(request: StartStagedSandboxSurfaceRequest): Promise<StagedSandboxRuntimeHandle> {
    try {
      return await startStagedSandboxSurface(request, {
        adapter: this.options.adapter,
        createSessionToken: this.options.createSessionToken ?? createDefaultSessionToken,
        onDiagnostic: this.options.onDiagnostic,
      })
    } catch (error) {
      if (error instanceof StagedSandboxRuntimeError) throw new SandboxRuntimeError(error.code)
      throw new SandboxRuntimeError('INSTANCE_DISABLED')
    }
  }

  /**
   * 向同一组件和实例的全部存活 surface 广播生命周期更新。
   *
   * size 与 variant 使用该入口保持 widget/modal context 一致；无实际状态变化或已经销毁的 session
   * 不会产生事件，返回值仅表示成功投递数量。
   */
  publishInstanceLifecycle(componentId: string, instanceId: string, update: WidgetLifecycleUpdate): number {
    let delivered = 0
    for (const active of this.activeSessions.values()) {
      if (active.handle.session.componentId !== componentId || active.handle.session.instanceId !== instanceId) continue
      if (this.publishLifecycleToSession(active, update)) delivered += 1
    }
    return delivered
  }

  /** 为单个 surface 更新可见性等局部生命周期状态，避免 modal 隐藏影响同实例 widget 的公开 context。 */
  publishSurfaceLifecycle(session: WidgetBrokerSession, update: WidgetLifecycleUpdate): boolean {
    const active = this.activeSessions.get(createSessionKey(session))
    return active ? this.publishLifecycleToSession(active, update) : false
  }

  /** 销毁当前 Runtime 追踪的全部 session，供页面卸载时回收 iframe、端口、storage/channel 监听器。 */
  destroyAll(): void {
    for (const active of [...this.activeSessions.values()]) active.handle.destroy()
  }

  /**
   * 销毁某组件的全部存活 iframe。
   *
   * 卸载在 IndexedDB 原子提交后调用此入口，确保 modal 与 widget 不会继续保有已删除包的端口、
   * storage 订阅或第三方执行上下文；返回值只用于测试和管理诊断，不暴露 session 内容。
   */
  destroyComponentSessions(componentId: string): number {
    let destroyed = 0
    for (const active of [...this.activeSessions.values()]) {
      if (active.handle.session.componentId !== componentId) continue
      active.handle.destroy()
      destroyed += 1
    }
    return destroyed
  }

  /** 将启动或洪泛失败交给健康模块；健康存储故障不得阻断 iframe 的既有安全销毁路径。 */
  private async reportRuntimeFailure(session: WidgetBrokerSession, reason: RuntimeFailureReason): Promise<void> {
    try {
      const result = await this.options.health?.recordFailure({
        componentId: session.componentId,
        instanceId: session.instanceId,
        reason,
      })
      if (result?.autoDisabled) {
        this.options.onInstanceAutoDisabled?.({
          componentId: session.componentId,
          instanceId: session.instanceId,
          reason,
        })
      }
    } catch {
      // runtimeHealth 只强化恢复策略；自身不可用不能使 PaTab 核心界面或 iframe 清理失败。
    }
  }

  /** 成功握手清除旧连续失败记录；失败时保留执行结果，避免健康元数据反向阻断组件启动。 */
  private async reportRuntimeHealthy(session: WidgetBrokerSession): Promise<void> {
    try {
      await this.options.health?.recordHealthy({ componentId: session.componentId, instanceId: session.instanceId })
    } catch {
      // 下一次失败仍会重建计数，健康记录持久化异常不影响已完成隔离握手。
    }
  }

  /** 把已验证的 context 更新转换为唯一 Broker 事件；非法端口或超过 64 KiB 时只安全丢弃。 */
  private publishLifecycleToSession(active: ActiveSandboxSession, update: WidgetLifecycleUpdate): boolean {
    const event = active.context.applyLifecycleUpdate(update)
    if (!event) return false
    return active.broker.sendEvent({
      protocol: WIDGET_RPC_PROTOCOL,
      apiVersion: WIDGET_RPC_API_VERSION,
      sessionId: active.handle.session.sessionId,
      event: event.event,
      payload: event.payload,
    })
  }

  /** 注册文档可观测的 visibility、语言、主题和 reduced-motion 变化，供已运行 surface 实时获得公共事件。 */
  private ensureLifecycleObservers(): void {
    if (this.lifecycleCleanup || typeof document === 'undefined') return
    const emitDocumentChanges = (): void => {
      const defaults = readDocumentContextDefaults()
      const tokens = getWidgetThemeTokens()
      for (const active of this.activeSessions.values()) {
        this.publishLifecycleToSession(active, { event: 'themeChanged', payload: {
          theme: defaults.theme,
          reducedMotion: defaults.reducedMotion,
          tokens,
        } })
        this.publishLifecycleToSession(active, { event: 'localeChanged', payload: { locale: defaults.locale } })
        this.publishLifecycleToSession(active, { event: 'visibilityChanged', payload: { visible: defaults.visible } })
      }
    }
    const onVisibilityChange = (): void => emitDocumentChanges()
    document.addEventListener('visibilitychange', onVisibilityChange)
    const observer = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => emitDocumentChanges())
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] })
    const media = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')
    media?.addEventListener('change', emitDocumentChanges)
    this.lifecycleCleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer?.disconnect()
      media?.removeEventListener('change', emitDocumentChanges)
      this.lifecycleCleanup = undefined
    }
  }

  /** 在最后一个 session 销毁后注销全局监听，防止 Runtime 退出仍保留 document 或 MediaQueryList 引用。 */
  private releaseLifecycleObserversWhenIdle(): void {
    if (this.activeSessions.size === 0) this.lifecycleCleanup?.()
  }
}
