import type {
  WidgetApiError,
  WidgetJsonValue,
  WidgetStorageGetParams,
  WidgetStorageRemoveParams,
  WidgetStorageSetParams,
} from '@patab/widget-sdk'

import {
  getInstanceStorageValue,
  listInstanceStorageKeys,
  removeInstanceStorageValue,
  setInstanceStorageValue,
  type InstanceStorageRepositoryError,
} from '@/custom-components/repository/instanceStorageRepository'
import {
  WidgetBrokerMethodError,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
} from '@/custom-components/runtime/capabilityBroker'

/** 单个公开 storage key 的最大字符数，需与 Repository 边界一致而不暴露其实现。 */
const STORAGE_KEY_MAX_LENGTH = 256

/** 判断未知值是否是没有访问器或原型穿透风险的普通记录。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 判断字符串是否可作为公开 storage key，避免将控制字符传入 IndexedDB 复合键。 */
function isStorageKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= STORAGE_KEY_MAX_LENGTH
    && !/[\u0000-\u001f]/.test(value)
}

/**
 * 递归判断值是否属于纯 JSON，避免 JSON.stringify 悄悄丢弃函数或 undefined 后仍写入存储。
 *
 * 该校验只处理公开 DTO；Repository 仍会再执行 structuredClone 与规范 JSON 计量，形成双重边界。
 */
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

/** 创建统一的公开参数错误，禁止把 Repository 异常或实际值写入 RPC 响应。 */
function invalidParams(message: string, path?: string): WidgetApiError {
  return { code: 'INVALID_ARGUMENT', message, ...(path ? { path } : {}) }
}

/** 解析 storage.get/remove 的单键参数，并拒绝任意未声明顶层字段。 */
function parseKeyParams(value: unknown): WidgetStorageGetParams | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !isStorageKey(value.key)) return undefined
  return { key: value.key }
}

/** 解析 storage.set 参数，确保 value 是可复制的公开 JSON，并拒绝额外字段。 */
function parseSetParams(value: unknown): WidgetStorageSetParams | undefined {
  if (!isPlainRecord(value)
    || Object.keys(value).length !== 2
    || !isStorageKey(value.key)
    || !isWidgetJsonValue(value.value)) {
    return undefined
  }
  return { key: value.key, value: value.value }
}

/** 将 Repository 的三类稳定失败压缩为既有 SDK 错误码，绝不让 IndexedDB 原始异常离开能力边界。 */
function mapStorageFailure(error: unknown): WidgetBrokerMethodError {
  const repositoryError = error as Partial<InstanceStorageRepositoryError>
  if (repositoryError?.code === 'QUOTA_EXCEEDED') {
    return new WidgetBrokerMethodError({ code: 'QUOTA_EXCEEDED', message: '组件实例私有数据超过 1 MiB 配额。' })
  }
  if (repositoryError?.code === 'INVALID_ARGUMENT') {
    return new WidgetBrokerMethodError({ code: 'INVALID_ARGUMENT', message: '组件实例存储参数无效。' })
  }
  return new WidgetBrokerMethodError({ code: 'INVALID_ARGUMENT', message: '组件实例存储暂时不可用。' })
}

/** 从 Broker session 派生唯一实例 scope，调用方无法通过 RPC 自行选择 componentId 或 instanceId。 */
function getStorageScope(session: WidgetBrokerSession) {
  return { componentId: session.componentId, instanceId: session.instanceId }
}

/**
 * storage Capability 所需的最小 Repository 边界。
 *
 * 默认实现仍指向活动实例数据；受限 migration 只替换该接口的底层实现，RPC 参数和
 * session 派生 scope 保持完全一致，避免为更新另建一套存储协议。
 */
export interface WidgetStorageRepository {
  readonly get: (scope: ReturnType<typeof getStorageScope>, key: string) => Promise<unknown | undefined>
  readonly keys: (scope: ReturnType<typeof getStorageScope>) => Promise<readonly string[]>
  readonly set: (scope: ReturnType<typeof getStorageScope>, key: string, value: unknown) => Promise<void>
  readonly remove: (scope: ReturnType<typeof getStorageScope>, key: string) => Promise<boolean>
}

/** 活动实例 storage 的默认适配，保持既有 Runtime 的行为与订阅事件不变。 */
const activeStorageRepository: WidgetStorageRepository = {
  get: getInstanceStorageValue,
  keys: listInstanceStorageKeys,
  set: setInstanceStorageValue,
  remove: removeInstanceStorageValue,
}

/**
 * 创建映射到实例私有 Repository 的基础 storage 方法表。
 *
 * 所有方法从 Broker session 取得 scope，因而不同组件或实例不能通过参数跨域读取、计量或删除数据。
 */
export function createWidgetStorageBrokerMethods(
  repository: WidgetStorageRepository = activeStorageRepository,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'storage.get': {
      validateParams: (params) => parseKeyParams(params)
        ? undefined
        : invalidParams('组件实例存储读取参数无效。', 'params'),
      async invoke(params, session) {
        const input = parseKeyParams(params)!
        try {
          const value = await repository.get(getStorageScope(session), input.key)
          if (value === undefined) return { found: false }
          return { found: true, value: value as WidgetJsonValue }
        } catch (error) {
          throw mapStorageFailure(error)
        }
      },
    },
    'storage.keys': {
      validateParams: (params) => isPlainRecord(params) && Object.keys(params).length === 0
        ? undefined
        : invalidParams('组件实例存储键列表参数无效。', 'params'),
      async invoke(_params, session) {
        try {
          return { keys: await repository.keys(getStorageScope(session)) }
        } catch (error) {
          throw mapStorageFailure(error)
        }
      },
    },
    'storage.set': {
      validateParams: (params) => parseSetParams(params)
        ? undefined
        : invalidParams('组件实例存储写入参数无效。', 'params'),
      async invoke(params, session) {
        const input = parseSetParams(params)!
        try {
          await repository.set(getStorageScope(session), input.key, input.value)
          return undefined
        } catch (error) {
          throw mapStorageFailure(error)
        }
      },
    },
    'storage.remove': {
      validateParams: (params) => parseKeyParams(params)
        ? undefined
        : invalidParams('组件实例存储删除参数无效。', 'params'),
      async invoke(params, session) {
        const input = parseKeyParams(params) as WidgetStorageRemoveParams
        try {
          return { removed: await repository.remove(getStorageScope(session), input.key) }
        } catch (error) {
          throw mapStorageFailure(error)
        }
      },
    },
  }
}
