import { canonicalizeJson } from '@patab/widget-package'

import {
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  openCustomComponentDatabase,
} from '@/custom-components/repository/customComponentDatabase'
import {
  INSTANCE_STORAGE_KEY_MAX_LENGTH,
  INSTANCE_STORAGE_MAX_BYTES,
  InstanceStorageRepositoryError,
} from '@/custom-components/repository/instanceStorageRepository'

import type { StagedInstanceStorageRecord } from './stagedComponentUpdateRepository'

/** staged storage 的唯一作用域；updateId 永远由更新服务注入，surface 不能从 RPC 参数指定。 */
export interface StagedInstanceStorageScope {
  readonly updateId: string
  readonly componentId: string
  readonly instanceId: string
}

/** 验证 staged scope，阻断控制字符或空 ID 进入复合 IndexedDB 键。 */
function assertScope(scope: StagedInstanceStorageScope): void {
  if (!scope.updateId || !scope.componentId || !scope.instanceId || [scope.updateId, scope.componentId, scope.instanceId].some((value) => /[\u0000-\u001f]/.test(value))) {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件更新暂存存储命名空间无效。')
  }
}

/** 验证公开 storage key，保持与活动实例存储完全一致的键边界。 */
function assertStorageKey(key: string): void {
  if (!key || key.length > INSTANCE_STORAGE_KEY_MAX_LENGTH || /[\u0000-\u001f]/.test(key)) {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件更新暂存存储键无效。', key)
  }
}

/** 对写入值复制并测量规范 JSON 字节，确保 migration 不能绕过活动存储的 1 MiB 配额。 */
function cloneAndMeasure(value: unknown): { readonly value: unknown; readonly serializedBytes: number } {
  try {
    const clonedValue = structuredClone(value)
    return {
      value: clonedValue,
      serializedBytes: new TextEncoder().encode(canonicalizeJson(clonedValue)).byteLength,
    }
  } catch {
    throw new InstanceStorageRepositoryError('INVALID_ARGUMENT', '组件更新暂存值必须是可结构化克隆的纯 JSON 数据。')
  }
}

/** 将只读 IndexedDB request 收敛为 Promise；写入事务仍在同一事件回调内排队请求。 */
function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

/** 构造单一 update/instance 的范围，避免 staged migration 扫描其他更新或组件实例。 */
function createScopeRange(scope: StagedInstanceStorageScope): IDBKeyRange {
  return IDBKeyRange.bound([scope.updateId, scope.instanceId, ''], [scope.updateId, scope.instanceId, '\uffff'])
}

/** 映射写事务失败，不携带浏览器异常、键值内容或暂存包正文。 */
function writeFailure(key?: string): InstanceStorageRepositoryError {
  return new InstanceStorageRepositoryError('STORAGE_WRITE_FAILED', '组件更新暂存存储写入失败，未提交本次修改。', key)
}

/** 读取 staged 实例的单个值并复制返回，迁移代码不能持有 IndexedDB 缓存对象引用。 */
export async function getStagedInstanceStorageValue(scope: StagedInstanceStorageScope, key: string): Promise<unknown | undefined> {
  assertScope(scope)
  assertStorageKey(key)
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readonly')
    const record = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).get([
      scope.updateId,
      scope.instanceId,
      key,
    ])) as StagedInstanceStorageRecord | undefined
    if (!record || record.componentId !== scope.componentId) return undefined
    return structuredClone(record.value)
  } finally {
    database.close()
  }
}

/** 列出当前 staged 实例的全部 key，只返回属于当前 componentId 的记录。 */
export async function listStagedInstanceStorageKeys(scope: StagedInstanceStorageScope): Promise<readonly string[]> {
  assertScope(scope)
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readonly')
    const records = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).getAll(createScopeRange(scope))) as StagedInstanceStorageRecord[]
    return records.filter((record) => record.componentId === scope.componentId).map((record) => record.key)
  } finally {
    database.close()
  }
}

/** 原子设置 staged 值并在本 update/instance 内执行配额校验；失败不影响活动实例数据。 */
export async function setStagedInstanceStorageValue(
  scope: StagedInstanceStorageScope,
  key: string,
  value: unknown,
  updatedAt: number = Date.now(),
): Promise<void> {
  assertScope(scope)
  assertStorageKey(key)
  const measured = cloneAndMeasure(value)
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      let failure: InstanceStorageRepositoryError | undefined
      let settled = false
      const fail = (error: InstanceStorageRepositoryError): void => {
        if (settled) return
        failure ??= error
        try { transaction.abort() } catch { /* 统一由 onabort 结算。 */ }
      }
      transaction.oncomplete = () => { if (!settled) { settled = true; resolve() } }
      transaction.onabort = () => { if (!settled) { settled = true; reject(failure ?? writeFailure(key)) } }
      transaction.onerror = () => undefined
      const recordsRequest = store.getAll(createScopeRange(scope))
      recordsRequest.onerror = () => fail(writeFailure(key))
      recordsRequest.onsuccess = () => {
        const records = (recordsRequest.result as StagedInstanceStorageRecord[]).filter((record) => record.componentId === scope.componentId)
        const current = records.find((record) => record.key === key)
        const total = records.reduce((sum, record) => sum + record.serializedBytes, 0)
        if (total - (current?.serializedBytes ?? 0) + measured.serializedBytes > INSTANCE_STORAGE_MAX_BYTES) {
          fail(new InstanceStorageRepositoryError('QUOTA_EXCEEDED', '组件更新暂存私有数据超过 1 MiB 配额。', key))
          return
        }
        try {
          const request = store.put({
            updateId: scope.updateId,
            componentId: scope.componentId,
            instanceId: scope.instanceId,
            key,
            value: measured.value,
            serializedBytes: measured.serializedBytes,
            updatedAt,
          } satisfies StagedInstanceStorageRecord)
          request.onerror = () => fail(writeFailure(key))
        } catch {
          fail(writeFailure(key))
        }
      }
    })
  } finally {
    database.close()
  }
}

/** 原子删除 staged key；未命中或不属于该组件的记录均返回 false。 */
export async function removeStagedInstanceStorageValue(scope: StagedInstanceStorageScope, key: string): Promise<boolean> {
  assertScope(scope)
  assertStorageKey(key)
  const database = await openCustomComponentDatabase()
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      let removed = false
      let settled = false
      const fail = (): void => { try { transaction.abort() } catch { /* onabort 统一结算。 */ } }
      transaction.oncomplete = () => { if (!settled) { settled = true; resolve(removed) } }
      transaction.onabort = () => { if (!settled) { settled = true; reject(writeFailure(key)) } }
      transaction.onerror = () => undefined
      const getRequest = store.get([scope.updateId, scope.instanceId, key])
      getRequest.onerror = fail
      getRequest.onsuccess = () => {
        const record = getRequest.result as StagedInstanceStorageRecord | undefined
        if (!record || record.componentId !== scope.componentId) return
        removed = true
        try {
          const deleteRequest = store.delete([scope.updateId, scope.instanceId, key])
          deleteRequest.onerror = fail
        } catch {
          fail()
        }
      }
    })
  } finally {
    database.close()
  }
}
