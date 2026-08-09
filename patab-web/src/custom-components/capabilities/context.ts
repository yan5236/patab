import type {
  WidgetContext,
  WidgetEventName,
  WidgetLocaleChangedEvent,
  WidgetSizeChangedEvent,
  WidgetThemeChangedEvent,
  WidgetTileSize,
  WidgetVariantChangedEvent,
  WidgetVisibilityChangedEvent,
} from '@patab/widget-sdk'

import type { WidgetBrokerMethod } from '@/custom-components/runtime/capabilityBroker'

/** 描述宿主主动广播给某个实例的生命周期更新，所有载荷均使用 SDK 公共 DTO。 */
export type WidgetLifecycleUpdate =
  | { readonly event: 'themeChanged'; readonly payload: WidgetThemeChangedEvent }
  | { readonly event: 'localeChanged'; readonly payload: WidgetLocaleChangedEvent }
  | { readonly event: 'sizeChanged'; readonly payload: WidgetSizeChangedEvent }
  | { readonly event: 'variantChanged'; readonly payload: WidgetVariantChangedEvent }
  | { readonly event: 'visibilityChanged'; readonly payload: WidgetVisibilityChangedEvent }

/** context/lifecycle Capability 暴露给 Runtime 的最小接口，不持有端口、DOM 或 Repository。 */
export interface WidgetContextCapability {
  readonly methods: Readonly<Record<string, WidgetBrokerMethod>>
  getSnapshot(): WidgetContext
  applyLifecycleUpdate(update: WidgetLifecycleUpdate): WidgetLifecycleUpdate | undefined
}

/** 判断对象是否只含 context.get 允许的空参数，避免基础 API 接收未声明载荷。 */
function isEmptyRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Object.keys(value).length === 0
}

/** 复制尺寸 DTO，避免宿主的响应式对象或调用方后续修改泄露到公开上下文。 */
function cloneSize(size: WidgetTileSize): WidgetTileSize {
  return { w: size.w, h: size.h } as WidgetTileSize
}

/** 复制 context DTO，保证每次 context.get 都返回独立普通对象。 */
function cloneContext(context: WidgetContext): WidgetContext {
  return {
    ...context,
    size: cloneSize(context.size),
    permissions: {
      granted: [...context.permissions.granted],
      networkOrigins: [...context.permissions.networkOrigins],
    },
  }
}

/** 判断两个尺寸是否相同，防止宿主无变化时制造无意义的 sizeChanged 广播。 */
function isSameSize(left: WidgetTileSize, right: WidgetTileSize): boolean {
  return left.w === right.w && left.h === right.h
}

/**
 * 创建单个 surface 的 context/lifecycle Capability。
 *
 * Context 快照只保存公开字段；Runtime 在宿主状态变化时调用 applyLifecycleUpdate，
 * 再由唯一 Broker 把返回的事件写入可信 MessagePort。
 */
export function createWidgetContextCapability(initialContext: WidgetContext): WidgetContextCapability {
  let snapshot = cloneContext(initialContext)

  /** 返回当前公开 context；不会暴露可变的内部 snapshot 引用。 */
  function getSnapshot(): WidgetContext {
    return cloneContext(snapshot)
  }

  /**
   * 按事件类型更新对应公开 context 字段，并只在实际变化后返回可投递 DTO。
   *
   * size/variant 的旧值永远由当前快照推导，不能信任调用方传入的 previous 值，
   * 从而确保 widget 与 modal 会看到同一条状态演进。
   */
  function applyLifecycleUpdate(update: WidgetLifecycleUpdate): WidgetLifecycleUpdate | undefined {
    if (update.event === 'themeChanged') {
      const { theme, reducedMotion, tokens } = update.payload
      if (snapshot.theme === theme && snapshot.reducedMotion === reducedMotion) return undefined
      snapshot = { ...snapshot, theme, reducedMotion }
      return {
        event: 'themeChanged',
        payload: {
          theme,
          reducedMotion,
          ...(tokens ? { tokens: { version: tokens.version, values: { ...tokens.values } } } : {}),
        },
      }
    }

    if (update.event === 'localeChanged') {
      if (snapshot.locale === update.payload.locale) return undefined
      snapshot = { ...snapshot, locale: update.payload.locale }
      return { event: 'localeChanged', payload: { locale: update.payload.locale } }
    }

    if (update.event === 'sizeChanged') {
      if (isSameSize(snapshot.size, update.payload.size)) return undefined
      const previousSize = cloneSize(snapshot.size)
      const size = cloneSize(update.payload.size)
      snapshot = { ...snapshot, size }
      return { event: 'sizeChanged', payload: { previousSize, size } }
    }

    if (update.event === 'variantChanged') {
      if (snapshot.variantId === update.payload.variantId) return undefined
      const previousVariantId = snapshot.variantId
      const variantId = update.payload.variantId
      snapshot = { ...snapshot, ...(variantId ? { variantId } : {}) }
      if (!variantId) {
        const { variantId: _unusedVariantId, ...contextWithoutVariant } = snapshot
        snapshot = contextWithoutVariant
      }
      return {
        event: 'variantChanged',
        payload: {
          ...(previousVariantId ? { previousVariantId } : {}),
          ...(variantId ? { variantId } : {}),
        },
      }
    }

    if (snapshot.visible === update.payload.visible) return undefined
    snapshot = { ...snapshot, visible: update.payload.visible }
    return { event: 'visibilityChanged', payload: { visible: update.payload.visible } }
  }

  return {
    methods: {
      'context.get': {
        validateParams: (params) => isEmptyRecord(params)
          ? undefined
          : { code: 'INVALID_ARGUMENT', message: '上下文请求参数无效。', path: 'params' },
        invoke: () => getSnapshot(),
      },
    },
    getSnapshot,
    applyLifecycleUpdate,
  }
}

/** 确保生命周期事件名称保持在 SDK 的公开目录内，供 Runtime 的类型边界做最小收窄。 */
export function isWidgetLifecycleEventName(event: string): event is Extract<WidgetEventName, WidgetLifecycleUpdate['event']> {
  return event === 'themeChanged'
    || event === 'localeChanged'
    || event === 'sizeChanged'
    || event === 'variantChanged'
    || event === 'visibilityChanged'
}
