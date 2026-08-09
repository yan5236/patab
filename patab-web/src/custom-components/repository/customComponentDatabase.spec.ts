import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import {
  CUSTOM_COMPONENT_DATABASE_NAME,
  CUSTOM_COMPONENT_DATABASE_VERSION,
  CUSTOM_COMPONENT_STORE_DEFINITIONS,
  CUSTOM_COMPONENT_STORE_KEY_PATHS,
  openCustomComponentDatabase,
} from './customComponentDatabase'

/**
 * 创建相互隔离的内存 IndexedDB 工厂，避免每个测试的数据库版本与连接状态相互影响。
 */
function createDatabaseFactory(): IDBFactory {
  return new IDBFactory()
}

/**
 * 通过指定版本打开测试数据库，并允许调用方在升级事务中追加仅用于测试的 Schema。
 */
function openDatabaseAtVersion(
  databaseFactory: IDBFactory,
  version: number,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(CUSTOM_COMPONENT_DATABASE_NAME, version)

    request.onupgradeneeded = () => {
      upgrade?.(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('测试数据库打开失败'))
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

/**
 * 将原生 DOMStringList 转成普通数组，便于断言实际创建的 Object Store 集合。
 */
function readStoreNames(database: IDBDatabase): string[] {
  return Array.from(database.objectStoreNames)
}

/**
 * 读取 Object Store 的主键路径；该元数据在事务创建后同步可用，不涉及业务数据读写。
 */
function readStoreKeyPath(database: IDBDatabase, storeName: string): string | string[] | null {
  return database.transaction(storeName, 'readonly').objectStore(storeName).keyPath
}

describe('customComponentDatabase', () => {
  it('首次打开时创建 v1 的全部 Object Store 与指定复合主键', async () => {
    const database = await openCustomComponentDatabase(createDatabaseFactory())

    try {
      expect(database.version).toBe(CUSTOM_COMPONENT_DATABASE_VERSION)
      expect(readStoreNames(database)).toEqual(
        expect.arrayContaining(CUSTOM_COMPONENT_STORE_DEFINITIONS.map(({ name }) => name)),
      )
      expect(readStoreNames(database)).toHaveLength(CUSTOM_COMPONENT_STORE_DEFINITIONS.length)

      for (const definition of CUSTOM_COMPONENT_STORE_DEFINITIONS) {
        expect(readStoreKeyPath(database, definition.name)).toEqual(
          Array.isArray(definition.keyPath) ? [...definition.keyPath] : definition.keyPath,
        )
      }
    } finally {
      database.close()
    }
  })

  it('连接收到更高版本升级请求时自动关闭，并拒绝重新以 v1 打开未来 Schema', async () => {
    const databaseFactory = createDatabaseFactory()
    const firstConnection = await openCustomComponentDatabase(databaseFactory)
    const futureDatabase = await openDatabaseAtVersion(
      databaseFactory,
      CUSTOM_COMPONENT_DATABASE_VERSION + 1,
      (database) => {
        database.createObjectStore('v2-test-store', { keyPath: 'id' })
      },
    )

    try {
      await expect(openCustomComponentDatabase(databaseFactory)).rejects.toMatchObject({ name: 'VersionError' })
      expect(futureDatabase.version).toBe(CUSTOM_COMPONENT_DATABASE_VERSION + 1)
      expect(futureDatabase.objectStoreNames.contains('v2-test-store')).toBe(true)
    } finally {
      firstConnection.close()
      futureDatabase.close()
    }
  })

  it('对每个建表定义公开固定的 v1 主键契约', () => {
    expect(CUSTOM_COMPONENT_STORE_KEY_PATHS).toEqual({
      components: 'componentId',
      versions: ['componentId', 'version'],
      files: ['componentId', 'version', 'path'],
      instanceData: ['componentId', 'instanceId', 'key'],
      stagedInstanceData: ['updateId', 'instanceId', 'key'],
      runtimeHealth: ['componentId', 'instanceId'],
    })
  })
})
