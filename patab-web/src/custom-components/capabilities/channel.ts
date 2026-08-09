import type { WidgetApiError, WidgetChannelMessageEvent, WidgetChannelPublishParams, WidgetJsonValue } from '@patab/widget-sdk'

import {
  WidgetBrokerMethodError,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
} from '@/custom-components/runtime/capabilityBroker'

/** 单个已订阅 surface 的最小投递器；不保存 iframe、端口或组件私有数据。 */
type InstanceChannelListener = (payload: WidgetChannelMessageEvent) => void

/** 由 Runtime 注入给 channel Capability 的事件投递与 64 KiB 检查边界。 */
export interface InstanceChannelSessionBridge {
  readonly emit: (payload: WidgetChannelMessageEvent) => boolean
  readonly canSend: (payload: WidgetChannelMessageEvent) => boolean
}

/** Channel Hub 的订阅条目按组件与实例双重隔离，sessionId 仅用于销毁时精确清理。 */
interface ChannelSubscription {
  readonly sessionId: string
  readonly listener: InstanceChannelListener
}

/** 将当前 componentId 与 instanceId 组合为不可与正常 ID 混淆的内部索引。 */
function createInstanceKey(session: WidgetBrokerSession): string {
  return `${session.componentId}\0${session.instanceId}`
}

/** 判断未知值是否是安全普通记录，避免 getter 或原型对象跨过 channel Schema。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 递归验证 channel 负载是有限、无循环的纯 JSON，并拒绝 undefined、BigInt、函数和宿主对象。 */
function isWidgetJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): value is WidgetJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) {
    if (seen.has(value)) return false
    seen.add(value)
    return value.every((item) => isWidgetJsonValue(item, seen))
  }
  if (!isPlainRecord(value) || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).every((item) => isWidgetJsonValue(item, seen))
}

/** 深复制有效 JSON 负载，确保发布方后续修改对象不会影响其它 surface 的事件值。 */
function cloneMessage(message: WidgetJsonValue): WidgetJsonValue {
  return structuredClone(message) as WidgetJsonValue
}

/** 构造不含消息正文的稳定 channel 参数错误。 */
function invalidChannelParams(): WidgetApiError {
  return { code: 'INVALID_ARGUMENT', message: '组件实例消息参数无效。', path: 'params' }
}

/** 解析 channel.publish 的唯一公开字段，拒绝额外键和不可复制负载。 */
function parsePublishParams(value: unknown): WidgetChannelPublishParams | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !isWidgetJsonValue(value.message)) return undefined
  return { message: value.message }
}

/** 验证 channel.subscribe/unsubscribe 使用无参数记录，防止实例范围由调用者操控。 */
function isEmptyRecord(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0
}

/**
 * 管理同一个 Runtime 进程中的实例消息订阅。
 *
 * Hub 不读取 Repository，也不接受由 RPC 传入的实例标识；只能使用 Runtime 已验证 session，
 * 因而 widget/detail/settings 可以通信，而任意其它 instanceId 永远不会成为投递目标。
 */
export class InstanceChannelHub {
  private readonly subscriptions = new Map<string, Map<string, ChannelSubscription>>()

  /** 为一个 surface 创建或替换同 session 的订阅，返回时不泄露其它订阅者。 */
  subscribe(session: WidgetBrokerSession, listener: InstanceChannelListener): void {
    const instanceKey = createInstanceKey(session)
    const listeners = this.subscriptions.get(instanceKey) ?? new Map<string, ChannelSubscription>()
    listeners.set(session.sessionId, { sessionId: session.sessionId, listener })
    this.subscriptions.set(instanceKey, listeners)
  }

  /** 移除一个 session 的订阅，并在该实例没有订阅者时回收集合。 */
  unsubscribe(session: WidgetBrokerSession): void {
    const instanceKey = createInstanceKey(session)
    const listeners = this.subscriptions.get(instanceKey)
    if (!listeners) return
    listeners.delete(session.sessionId)
    if (listeners.size === 0) this.subscriptions.delete(instanceKey)
  }

  /** 在 Runtime 销毁任何 surface 时清理其订阅，防止残留 listener 保留已关闭的 MessagePort。 */
  removeSession(session: WidgetBrokerSession): void {
    this.unsubscribe(session)
  }

  /** 向同一组件且同一实例的当前订阅者广播复制后的有效 JSON 消息。 */
  publish(session: WidgetBrokerSession, message: WidgetJsonValue): void {
    const listeners = this.subscriptions.get(createInstanceKey(session))
    if (!listeners) return
    for (const subscription of listeners.values()) {
      try {
        subscription.listener({ message: cloneMessage(message) })
      } catch {
        // 单个被销毁 surface 的投递异常不能影响其它订阅者或发布方的成功 RPC 结果。
      }
    }
  }
}

/** 默认 Hub 在浏览器页内共享，使同一实例的 widget 和 modal 即使由不同 Runtime 创建也可互通。 */
const defaultInstanceChannelHub = new InstanceChannelHub()

/** 返回页面级共享 Hub；测试或特殊宿主可显式注入独立 Hub 避免交叉状态。 */
export function getDefaultInstanceChannelHub(): InstanceChannelHub {
  return defaultInstanceChannelHub
}

/**
 * 为一个已验证 session 创建 channel RPC 方法。
 *
 * 订阅只在组件主动调用 channel.subscribe 后建立；Runtime destroy 必须调用 hub.removeSession，
 * 从而统一清理 widget/modal 关闭、握手失败恢复和页面卸载三条路径。
 */
export function createWidgetChannelBrokerMethods(
  session: WidgetBrokerSession,
  hub: InstanceChannelHub,
  bridge: InstanceChannelSessionBridge,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'channel.publish': {
      validateParams: (params) => parsePublishParams(params) ? undefined : invalidChannelParams(),
      invoke(params) {
        const input = parsePublishParams(params)!
        const payload = { message: input.message }
        if (!bridge.canSend(payload)) {
          throw new WidgetBrokerMethodError({ code: 'INVALID_ARGUMENT', message: '组件实例消息超过 64 KiB 限制。' })
        }
        hub.publish(session, input.message)
        return undefined
      },
    },
    'channel.subscribe': {
      validateParams: (params) => isEmptyRecord(params) ? undefined : invalidChannelParams(),
      invoke() {
        hub.subscribe(session, (payload) => {
          if (bridge.canSend(payload)) bridge.emit(payload)
        })
        return { subscribed: true }
      },
    },
    'channel.unsubscribe': {
      validateParams: (params) => isEmptyRecord(params) ? undefined : invalidChannelParams(),
      invoke() {
        hub.unsubscribe(session)
        return { subscribed: false }
      },
    },
  }
}
