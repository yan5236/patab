import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INSTANCE_STORAGE_MAX_BYTES,
  InstanceStorageRepositoryError,
  getInstanceStorageValue,
  listInstanceStorageKeys,
  removeInstanceStorageValue,
  setInstanceStorageValue,
  subscribeInstanceStorage,
} from './instanceStorageRepository'

/** 每个存储用例注入隔离的 IndexedDB 工厂，防止组件实例命名空间相互污染。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 覆盖实例命名空间隔离、成功变化订阅、原子配额拒绝与不支持值拒绝。 */
describe('实例私有存储 Repository', () => {
  /** 验证同一组件的 widget/modal 共享同一 instanceId，而不同实例绝不会读到彼此的键和值。 */
  it('只在当前组件实例命名空间读写并通知订阅者', async () => {
    const firstScope = { componentId: 'com.example.storage', instanceId: 'first' }
    const secondScope = { componentId: 'com.example.storage', instanceId: 'second' }
    const changes: unknown[] = []
    const unsubscribe = subscribeInstanceStorage(firstScope, (change) => changes.push(change))

    await setInstanceStorageValue(firstScope, 'preferences', { dark: true }, 10)
    await setInstanceStorageValue(secondScope, 'preferences', { dark: false }, 11)

    await expect(getInstanceStorageValue(firstScope, 'preferences')).resolves.toEqual({ dark: true })
    await expect(getInstanceStorageValue(secondScope, 'preferences')).resolves.toEqual({ dark: false })
    await expect(listInstanceStorageKeys(firstScope)).resolves.toEqual(['preferences'])
    expect(changes).toEqual([{ ...firstScope, key: 'preferences', operation: 'set' }])

    await expect(removeInstanceStorageValue(firstScope, 'preferences')).resolves.toBe(true)
    expect(changes).toEqual([
      { ...firstScope, key: 'preferences', operation: 'set' },
      { ...firstScope, key: 'preferences', operation: 'remove' },
    ])
    unsubscribe()
  })

  /** 验证超出 1 MiB 的后续写入原子失败，已有数据保持不变且不触发变化订阅。 */
  it('拒绝配额超限并保留原数据', async () => {
    const scope = { componentId: 'com.example.storage', instanceId: 'quota' }
    await setInstanceStorageValue(scope, 'saved', { value: 'kept' })

    await expect(setInstanceStorageValue(scope, 'too-large', 'x'.repeat(INSTANCE_STORAGE_MAX_BYTES))).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    } satisfies Partial<InstanceStorageRepositoryError>)
    await expect(getInstanceStorageValue(scope, 'saved')).resolves.toEqual({ value: 'kept' })
    await expect(getInstanceStorageValue(scope, 'too-large')).resolves.toBeUndefined()
  })

  /** 验证 undefined、函数等非纯 JSON 值即使部分可结构化克隆，也会在事务开始前稳定拒绝。 */
  it('拒绝不可持久化值且不创建任何记录', async () => {
    const scope = { componentId: 'com.example.storage', instanceId: 'invalid' }

    await expect(setInstanceStorageValue(scope, 'undefined', undefined)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(setInstanceStorageValue(scope, 'function', () => undefined)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(listInstanceStorageKeys(scope)).resolves.toEqual([])
  })
})
