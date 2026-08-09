import type { WidgetNetworkDeclaration, WidgetTileSize } from './manifest.js'
import type { WidgetPermission } from './permissions.js'
import type { WidgetSdkApiVersion } from './types.js'
import type { WidgetApiError } from './errors.js'

/**
 * 标识 SDK 与 Capability Broker 使用的固定 RPC 协议名称，避免第三方 surface 与其他 postMessage 流量混淆。
 */
export const WIDGET_RPC_PROTOCOL = 'patab-widget' as const

/**
 * 标识当前 RPC DTO 支持的 API 主版本；Manifest 的字符串版本由兼容性判断统一转换。
 */
export const WIDGET_RPC_API_VERSION: WidgetSdkApiVersion = 1

/**
 * 描述由宿主在握手后提供给单一组件实例的有效权限快照，不暴露权限存储、用户身份或 Store 引用。
 */
export interface WidgetPermissionSnapshot {
  readonly granted: readonly WidgetPermission[]
  readonly networkOrigins: readonly WidgetNetworkDeclaration['origin'][]
}

/**
 * 描述宿主提供给已握手 surface 的只读公开上下文，所有字段均为跨版本稳定 DTO 而非宿主内部对象。
 */
export interface WidgetContext {
  readonly componentId: string
  readonly instanceId: string
  readonly componentVersion: string
  readonly apiVersion: WidgetSdkApiVersion
  readonly surface: string
  readonly size: WidgetTileSize
  readonly variantId?: string
  readonly locale: 'zh-CN' | 'en-US'
  readonly theme: 'light' | 'dark'
  readonly reducedMotion: boolean
  readonly visible: boolean
  readonly permissions: WidgetPermissionSnapshot
}

/** 表示可跨 MessagePort 传递的纯 JSON 值，避免函数、循环对象或宿主对象穿透实例通道。 */
export type WidgetJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly WidgetJsonValue[]
  | { readonly [key: string]: WidgetJsonValue }

/** 描述 storage.get 的公开输入，只允许读取当前组件实例自己的单个键。 */
export interface WidgetStorageGetParams {
  readonly key: string
}

/** 描述 storage.get 的公开结果，found 避免把缺失值与 JSON null 混淆。 */
export interface WidgetStorageGetResult {
  readonly found: boolean
  readonly value?: WidgetJsonValue
}

/** 描述 storage.keys 的公开结果；键始终仅来自当前组件实例的私有命名空间。 */
export interface WidgetStorageKeysResult {
  readonly keys: readonly string[]
}

/** 描述 storage.set 的公开输入；实际 1 MiB 配额由宿主事务在提交前计算。 */
export interface WidgetStorageSetParams {
  readonly key: string
  readonly value: WidgetJsonValue
}

/** 描述 storage.remove 的公开输入，只允许操作当前实例的键。 */
export interface WidgetStorageRemoveParams {
  readonly key: string
}

/** 描述 storage.remove 的公开结果，removed 为 false 表示该键原本不存在。 */
export interface WidgetStorageRemoveResult {
  readonly removed: boolean
}

/** 描述宿主在存储事务提交后广播的最小变化事件，刻意不包含私有 value。 */
export interface WidgetStorageChangedEvent {
  readonly key: string
  readonly operation: 'set' | 'remove'
}

/** 描述 channel.publish 的公开输入，消息只会广播给同一 instanceId 的订阅 surface。 */
export interface WidgetChannelPublishParams {
  readonly message: WidgetJsonValue
}

/** 描述 channelMessage 的公开载荷，接收方获得结构化克隆副本而非发送方对象引用。 */
export interface WidgetChannelMessageEvent {
  readonly message: WidgetJsonValue
}

/** 描述 ui.toast 的公开输入，文本上限由宿主校验，来源标签始终由宿主额外渲染。 */
export interface WidgetToastParams {
  readonly message: string
}

/** 描述 ui.confirm 的公开输入；宿主负责明确标识第三方来源和关闭即取消的语义。 */
export interface WidgetConfirmParams {
  readonly title?: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

/** 描述 ui.confirm 的稳定结果，取消、ESC 和遮罩关闭均以 confirmed=false 返回。 */
export interface WidgetConfirmResult {
  readonly confirmed: boolean
}

/** 描述 ui.openExternal 的唯一公开输入；宿主仅接受 HTTPS URL。 */
export interface WidgetOpenExternalParams {
  readonly url: string
}

/** 描述外链确认后的稳定结果；浏览器拦截新标签页时不会泄露内部异常。 */
export interface WidgetOpenExternalResult {
  readonly opened: boolean
}

/**
 * 描述宿主暴露给 sandbox 文档的公开主题 token 名称。
 *
 * token 名称属于 API v1 契约；宿主内部色彩变量、CSS 框架类名和实现细节均不会出现在此联合中。
 */
export type WidgetThemeTokenName =
  | '--pt-accent'
  | '--pt-accent-contrast'
  | '--pt-accent-hover'
  | '--pt-border'
  | '--pt-color-scheme'
  | '--pt-danger'
  | '--pt-focus-ring'
  | '--pt-font-sans'
  | '--pt-input'
  | '--pt-motion-duration'
  | '--pt-motion-easing'
  | '--pt-radius-lg'
  | '--pt-radius-md'
  | '--pt-radius-sm'
  | '--pt-shadow'
  | '--pt-surface'
  | '--pt-surface-strong'
  | '--pt-text'
  | '--pt-text-muted'
  | '--pt-text-strong'

/** 描述可安全写入 sandbox 根节点的版本化公开主题 token 快照。 */
export interface WidgetThemeTokens {
  readonly version: 1
  readonly values: Readonly<Record<WidgetThemeTokenName, string>>
}

/** 描述 ui.openSurface 允许请求的固定第三方 modal surface，不允许 migration 等内部 surface 进入宿主 UI。 */
export interface WidgetOpenSurfaceParams {
  readonly surface: 'detail' | 'settings'
}

/** 描述 ui.openVariantPicker 的固定空参数，类型选择完全由宿主读取静态 Manifest 渲染。 */
export type WidgetOpenVariantPickerParams = Record<string, never>

/** 描述主题或减少动画偏好变化，事件值也是 surface 后续 context.get 的当前快照。 */
export interface WidgetThemeChangedEvent {
  readonly theme: 'light' | 'dark'
  readonly reducedMotion: boolean
  /** 宿主同步公开 token；缺失时第三方仍可继续使用启动时注入的 token。 */
  readonly tokens?: WidgetThemeTokens
}

/** 描述公开语言变化，只允许 PaTab v1 已支持的语言代码。 */
export interface WidgetLocaleChangedEvent {
  readonly locale: 'zh-CN' | 'en-US'
}

/** 描述图块尺寸变化，previousSize 由宿主当前公开快照推导，不能由第三方伪造。 */
export interface WidgetSizeChangedEvent {
  readonly previousSize: WidgetTileSize
  readonly size: WidgetTileSize
}

/** 描述 variant 变化，缺省 variantId 表示该实例目前不使用多类型配置。 */
export interface WidgetVariantChangedEvent {
  readonly previousVariantId?: string
  readonly variantId?: string
}

/** 描述 surface 可见性变化，隐藏并不销毁其独立实例存储或 MessagePort 会话。 */
export interface WidgetVisibilityChangedEvent {
  readonly visible: boolean
}

/**
 * 描述组件通过已授予 MessagePort 发起的 API 请求；该 DTO 不包含端口、iframe、DOM 或任何宿主服务实现。
 */
export interface WidgetRequest<TParams = unknown> {
  readonly protocol: typeof WIDGET_RPC_PROTOCOL
  readonly apiVersion: WidgetSdkApiVersion
  readonly sessionId: string
  readonly requestId: string
  readonly method: string
  readonly params: TParams
}

/**
 * 描述成功 API 调用的结构化响应，使空结果和有结果的方法都不会与错误载荷混淆。
 */
export interface WidgetSuccessResponse<TResult = unknown> {
  readonly requestId: string
  readonly ok: true
  readonly result?: TResult
}

/**
 * 描述失败 API 调用的结构化响应，只提供稳定错误码与安全消息，禁止传递宿主原始异常或堆栈。
 */
export interface WidgetFailureResponse {
  readonly requestId: string
  readonly ok: false
  readonly error: WidgetApiError
}

/**
 * 表示 API 调用的成功或失败响应，调用方可通过 ok 字段安全收窄结果与错误分支。
 */
export type WidgetResponse<TResult = unknown> = WidgetSuccessResponse<TResult> | WidgetFailureResponse

/**
 * 列出 API v1 生命周期与实例通道的公开事件名称，实际事件载荷在对应能力契约稳定后补充。
 */
export type WidgetEventName =
  | 'channelMessage'
  | 'localeChanged'
  | 'sizeChanged'
  | 'storageChanged'
  | 'themeChanged'
  | 'todoChanged'
  | 'variantChanged'
  | 'visibilityChanged'

/**
 * 描述宿主通过已验证会话投递给第三方 surface 的异步事件，保持组件实例边界且不含 MessagePort 或宿主实现引用。
 */
export interface WidgetEvent<TPayload = unknown, TName extends string = WidgetEventName> {
  readonly protocol: typeof WIDGET_RPC_PROTOCOL
  readonly apiVersion: WidgetSdkApiVersion
  readonly sessionId: string
  readonly event: TName
  readonly payload: TPayload
}

/**
 * 描述组件要求的 API 主版本与当前 SDK 支持版本是否兼容，供导入端与 CLI 在执行第三方代码前统一决策。
 */
export type WidgetApiCompatibility =
  | {
      readonly compatible: true
      readonly requestedApiVersion: number
      readonly supportedApiVersion: number
    }
  | {
      readonly compatible: false
      readonly requestedApiVersion: number | null
      readonly supportedApiVersion: number
      readonly error: WidgetApiError
    }

/**
 * 判断 Manifest 字符串版本或 RPC 数字版本是否与当前 API 主版本一致，并在不兼容时返回统一且可安全展示的错误 DTO。
 */
export function evaluateWidgetApiCompatibility(
  requestedApiVersion: number | string,
  supportedApiVersion: number = WIDGET_RPC_API_VERSION,
): WidgetApiCompatibility {
  const normalizedRequestedVersion = Number(requestedApiVersion)
  const isRequestedVersionValid = Number.isSafeInteger(normalizedRequestedVersion) && normalizedRequestedVersion > 0

  if (isRequestedVersionValid && normalizedRequestedVersion === supportedApiVersion) {
    return {
      compatible: true,
      requestedApiVersion: normalizedRequestedVersion,
      supportedApiVersion,
    }
  }

  return {
    compatible: false,
    requestedApiVersion: isRequestedVersionValid ? normalizedRequestedVersion : null,
    supportedApiVersion,
    error: {
      code: 'API_INCOMPATIBLE',
      message: '组件要求的 API 主版本与当前 PaTab 不兼容。',
    },
  }
}
