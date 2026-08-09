import { canonicalizeJson } from '@patab/widget-package'
import type { WidgetErrorCode } from '@patab/widget-sdk'

import {
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  openCustomComponentDatabase,
} from './customComponentDatabase'

/** 单个组件实例私有存储允许的规范 JSON UTF-8 总字节数。 */
export const INSTANCE_STORAGE_MAX_BYTES = 1024 * 1024

/** 单个 storage key 允许的最大字符数，防止以超长键绕过小值配额的可用性攻击。 */
export const INSTANCE_STORAGE_KEY_MAX_LENGTH = 256

/** 组件实例存储的唯一命名空间，widget 与 modal 使用相同 componentId/instanceId 即可共享数据。 */
export interface InstanceStorageScope {
  readonly componentId: string
  readonly instanceId: string
}

/** instanceData 表中持久化的单个结构化克隆 JSON 值与其规范序列化字节数。 */
export interface InstanceStorageRecord extends InstanceStorageScope {
  readonly key: string
  readonly value: unknown
  readonly serializedBytes: number
  readonly updatedAt: number
}

/** 提交成功后的最小变化事件，不携带 value，避免从无关订阅者向 surface 泄露私有数据。 */
export interface InstanceStorageChange extends InstanceStorageScope {
  readonly key: string
  readonly operation: 'remove' | 'set'
}

/** 组件实例私有存储订阅回调。 */
export type InstanceStorageChangeListener = (change: InstanceStorageChange) => void

/** 组件实例存储 Repository 的稳定错误码，前两项可直接映射到 SDK API 错误码。 */
export type InstanceStorageRepositoryErrorCode = Extract<WidgetErrorCode, 'INVALID_ARGUMENT' | 'QUOTA_EXCEEDED'> | 'STORAGE_WRITE_FAILED'

/**
 * 表示实例私有存储的安全失败；错误不包含具体 value、序列化文本或 IndexedDB 原始异常。
 */
export class InstanceStorageRepositoryError extends Error {
  /**
   * 创建带稳定错误码、可选安全 key 定位的实例存储错误。
   */
  constructor(
    readonly code: InstanceStorageRepositoryErrorCode,
    message: string,
    readonly key?: string,
  ) {
    super(message)
    this.name = 'InstanceStorageRepositoryError'
  }
}

/** 活跃订阅按组件实例命名空间保存，实际跨 iframe 投递仍由后续 Broker 使用这些变化事件完成。 */
const storageListeners = new Map<string, Set<InstanceStorageChangeListener>>()

/**
 * 校验 scope 与 key 的基础形状并构造不与正常组件 ID 混淆的内部订阅索引，不把未受控键传入 IndexedDB。
 */
function createScopeListenerKey(scope: InstanceStorageScope): string {
  if (!scope.componentId || !scope.instanceId || scope.componentId.includes('\0') || scope.instanceId.includes('\0')) {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件实例存储命名空间无效。')
  }
  return `${scope.componentId}\0${scope.instanceId}`
}

/**
 * 校验公开 storage key，拒绝空、超长或控制字符键以维持持久化复合键和 RPC DTO 的稳定边界。
 */
function assertStorageKey(key: string): void {
  if (!key || key.length > INSTANCE_STORAGE_KEY_MAX_LENGTH || /[\u0000-\u001f]/.test(key)) {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件实例存储键无效。', key)
  }
}

/**
 * 对写入值先执行结构化克隆，再按规范 JSON UTF-8 计算配额；不支持的值在事务开始前失败且不产生部分写入。
 */
function cloneAndMeasureStorageValue(value: unknown): { readonly clonedValue: unknown; readonly serializedBytes: number } {
  try {
    const clonedValue = structuredClone(value)
    const serializedBytes = new TextEncoder().encode(canonicalizeJson(clonedValue)).byteLength
    return { clonedValue, serializedBytes }
  } catch {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件实例存储值必须是可结构化克隆的纯 JSON 数据。')
  }
}

/**
 * 将 IndexedDB 只读 request 转换为 Promise；写入事务不使用此助手跨任务继续排队，避免事务失活。
 */
function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

/**
 * 构造当前组件实例的复合键范围，确保 get/keys/计量只能触及当前命名空间而不会扫描其他组件或实例。
 */
function createScopeRange(scope: InstanceStorageScope): IDBKeyRange {
  return IDBKeyRange.bound(
    [scope.componentId, scope.instanceId, ''],
    [scope.componentId, scope.instanceId, '\uffff'],
  )
}

/**
 * 将任意 IndexedDB 写事务失败压缩为稳定存储错误，禁止把底层异常名或私有内容跨越 Repository 边界。
 */
function toStorageWriteError(key?: string): InstanceStorageRepositoryError {
  return new InstanceStorageRepositoryError('STORAGE_WRITE_FAILED', '组件实例存储写入失败，未提交本次修改。', key)
}

/**
 * 在提交成功后同步通知当前命名空间订阅者；监听器异常被隔离，不能影响已完成的持久化事务或其他订阅者。
 */
function emitStorageChange(change: InstanceStorageChange): void {
  const listeners = storageListeners.get(createScopeListenerKey(change))
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener(change)
    } catch {
      // 订阅者属于上层运行时；其异常不能回滚已完成的 IndexedDB 事务。
    }
  }
}

/**
 * 读取当前命名空间的单个值并再次结构化克隆后返回，确保调用方无法持有 IndexedDB 缓存对象的可变引用。
 */
export async function getInstanceStorageValue(
  scope: InstanceStorageScope,
  key: string,
): Promise<unknown | undefined> {
  createScopeListenerKey(scope)
  assertStorageKey(key)
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_INSTANCE_DATA, 'readonly')
    const record = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).get([
      scope.componentId,
      scope.instanceId,
      key,
    ])) as InstanceStorageRecord | undefined
    return record ? structuredClone(record.value) : undefined
  } finally {
    database.close()
  }
}

/**
 * 列出当前组件实例命名空间内的全部 storage key，不读取其他实例值且按 IndexedDB 复合键顺序返回稳定副本。
 */
export async function listInstanceStorageKeys(scope: InstanceStorageScope): Promise<readonly string[]> {
  createScopeListenerKey(scope)
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_INSTANCE_DATA, 'readonly')
    const keys = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).getAllKeys(createScopeRange(scope)))
    return keys
      .map((key) => Array.isArray(key) ? key[2] : undefined)
      .filter((key): key is string => typeof key === 'string')
  } finally {
    database.close()
  }
}

/**
 * 原子设置当前实例 storage 值：事务内先计算已有总量，再排入单次 put；超过 1 MiB 时中止且保持原数据不变。
 */
export async function setInstanceStorageValue(
  scope: InstanceStorageScope,
  key: string,
  value: unknown,
  updatedAt: number = Date.now(),
): Promise<void> {
  createScopeListenerKey(scope)
  assertStorageKey(key)
  const measuredValue = cloneAndMeasureStorageValue(value)
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_INSTANCE_DATA, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA)
      let settled = false
      let failure: InstanceStorageRepositoryError | undefined

      /** 以唯一出口中止写事务，保证配额与写入错误均不会留下部分状态。 */
      const fail = (error: InstanceStorageRepositoryError): void => {
        if (settled) return
        failure ??= error
        try {
          transaction.abort()
        } catch {
          // 事务已完成时不会再触发写入；onabort/onerror 将统一结算。
        }
      }

      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve()
      }
      transaction.onabort = () => {
        if (settled) return
        settled = true
        reject(failure ?? toStorageWriteError(key))
      }
      transaction.onerror = () => {
        if (settled) return
        failure ??= toStorageWriteError(key)
      }

      const recordsRequest = store.getAll(createScopeRange(scope))
      recordsRequest.onerror = () => fail(toStorageWriteError(key))
      recordsRequest.onsuccess = () => {
        if (settled) return
        const records = recordsRequest.result as InstanceStorageRecord[]
        const currentRecord = records.find((record) => record.key === key)
        const currentTotal = records.reduce((total, record) => total + record.serializedBytes, 0)
        const nextTotal = currentTotal - (currentRecord?.serializedBytes ?? 0) + measuredValue.serializedBytes
        if (nextTotal > INSTANCE_STORAGE_MAX_BYTES) {
          fail(new InstanceStorageRepositoryError('QUOTA_EXCEEDED', '组件实例私有数据超过 1 MiB 配额。', key))
          return
        }

        const record: InstanceStorageRecord = {
          componentId: scope.componentId,
          instanceId: scope.instanceId,
          key,
          value: measuredValue.clonedValue,
          serializedBytes: measuredValue.serializedBytes,
          updatedAt,
        }
        try {
          const putRequest = store.put(record)
          putRequest.onerror = () => fail(toStorageWriteError(key))
        } catch {
          fail(toStorageWriteError(key))
        }
      }
    })
  } finally {
    database.close()
  }

  emitStorageChange({ ...scope, key, operation: 'set' })
}

/**
 * 原子移除当前实例 storage 键；仅在确有记录且事务成功提交后通知订阅者，避免无效删除制造伪变化事件。
 */
export async function removeInstanceStorageValue(scope: InstanceStorageScope, key: string): Promise<boolean> {
  createScopeListenerKey(scope)
  assertStorageKey(key)
  const database = await openCustomComponentDatabase()
  try {
    const removed = await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_INSTANCE_DATA, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA)
      let hasRecord = false
      let settled = false

      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve(hasRecord)
      }
      transaction.onabort = () => {
        if (settled) return
        settled = true
        reject(toStorageWriteError(key))
      }
      transaction.onerror = () => undefined

      const getRequest = store.get([scope.componentId, scope.instanceId, key])
      getRequest.onerror = () => {
        try {
          transaction.abort()
        } catch {
          // 统一由 onabort 结算失败。
        }
      }
      getRequest.onsuccess = () => {
        if (!getRequest.result) return
        hasRecord = true
        try {
          const deleteRequest = store.delete([scope.componentId, scope.instanceId, key])
          deleteRequest.onerror = () => {
            try {
              transaction.abort()
            } catch {
              // 统一由 onabort 结算失败。
            }
          }
        } catch {
          try {
            transaction.abort()
          } catch {
            // 统一由 onabort 结算失败。
          }
        }
      }
    })
    if (removed) {
      emitStorageChange({ ...scope, key, operation: 'remove' })
    }
    return removed
  } finally {
    database.close()
  }
}

/**
 * 订阅当前组件实例的成功存储变化；返回的取消函数会清理空集合，避免销毁 surface 后残留内存引用。
 */
export function subscribeInstanceStorage(
  scope: InstanceStorageScope,
  listener: InstanceStorageChangeListener,
): () => void {
  const scopeKey = createScopeListenerKey(scope)
  const listeners = storageListeners.get(scopeKey) ?? new Set<InstanceStorageChangeListener>()
  listeners.add(listener)
  storageListeners.set(scopeKey, listeners)

  /** 取消单个订阅并在没有监听器时回收命名空间集合。 */
  return () => {
    const activeListeners = storageListeners.get(scopeKey)
    if (!activeListeners) return
    activeListeners.delete(listener)
    if (activeListeners.size === 0) {
      storageListeners.delete(scopeKey)
    }
  }
}
