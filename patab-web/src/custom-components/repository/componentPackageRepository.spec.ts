import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CUSTOM_COMPONENT_DATABASE_NAME,
  CUSTOM_COMPONENT_DATABASE_VERSION,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  openCustomComponentDatabase,
} from './customComponentDatabase'
import {
  cleanupOrphanedStagedInstanceData,
  getActiveComponentVersion,
  getInstalledComponent,
  getRollbackComponentVersion,
  installComponentPackage,
  listInstalledComponents,
  readActiveComponentFile,
} from './componentPackageRepository'

/** 每个 Repository 测试使用独立内存工厂，确保组件 ID、版本和事务不会跨用例残留。 */
let databaseFactory: IDBFactory

/** 创建最小已验证安装输入，包含一个自包含 surface 与一个静态图标 Blob。 */
function createInstallInput(overrides: Partial<Parameters<typeof installComponentPackage>[0]> = {}) {
  return {
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.repository',
      version: '1.0.0',
      name: { default: 'Repository' },
      description: { default: '仓库测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      assets: { icon: 'assets/icon.png' },
    },
    integrity: {
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [],
    },
    grantedPermissions: ['todos.read'] as const,
    files: [
      { path: 'surfaces/widget.html', content: '<main>组件</main>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
    installedAt: 100,
    ...overrides,
  } as Parameters<typeof installComponentPackage>[0]
}

/** 用测试工厂替换默认打开入口，使 Repository 的公共函数仍按生产路径执行而不访问真实 IndexedDB。 */
beforeEach(() => {
  databaseFactory = new IDBFactory()
  vi.stubGlobal('indexedDB', databaseFactory)
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 覆盖首次安装原子写入、活动文件读取、约束失败回滚、回滚版本读取和孤立 staged 数据清理。 */
describe('组件包 Repository', () => {
  /** 验证一次安装会同时写入目录、活动版本与所有文件，且读取始终跟随 activeVersion。 */
  it('原子安装组件包并读取活动版本文件', async () => {
    await installComponentPackage(createInstallInput())

    await expect(getInstalledComponent('com.example.repository')).resolves.toMatchObject({
      activeVersion: '1.0.0',
      grantedPermissions: ['todos.read'],
    })
    await expect(getActiveComponentVersion('com.example.repository')).resolves.toMatchObject({
      version: '1.0.0',
      isActive: true,
    })
    await expect(readActiveComponentFile('com.example.repository', 'surfaces/widget.html')).resolves.toMatchObject({
      content: '<main>组件</main>',
    })
    await expect(listInstalledComponents()).resolves.toMatchObject([
      { componentId: 'com.example.repository', activeVersion: '1.0.0' },
    ])
  })

  /** 验证版本主键冲突会回滚此前排入的目录写入，不留下半安装记录。 */
  it('任一文件写入失败时回滚整个安装事务', async () => {
    const database = await openCustomComponentDatabase(databaseFactory as unknown as IDBFactory)
    try {
      const transaction = database.transaction('versions', 'readwrite')
      transaction.objectStore('versions').add({ componentId: 'com.example.repository', version: '1.0.0' })
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }

    await expect(installComponentPackage(createInstallInput())).rejects.toMatchObject({ code: 'COMPONENT_ALREADY_INSTALLED' })
    await expect(getInstalledComponent('com.example.repository')).resolves.toBeUndefined()
    await expect(getActiveComponentVersion('com.example.repository')).resolves.toBeUndefined()
  })

  /** 验证回滚查询只选择标记版本，孤立 staged 数据清理只删除未列入活动 updateId 集合的记录。 */
  it('读取回滚版本并清理孤立 staged 数据', async () => {
    const database = await openCustomComponentDatabase(databaseFactory as unknown as IDBFactory)
    try {
      const transaction = database.transaction(['versions', CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA], 'readwrite')
      transaction.objectStore('versions').put({
        componentId: 'com.example.repository',
        version: '0.9.0',
        isRollback: true,
        installedAt: 50,
      })
      transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).put({ updateId: 'keep', instanceId: 'one', key: 'value' })
      transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).put({ updateId: 'remove', instanceId: 'two', key: 'value' })
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }

    await expect(getRollbackComponentVersion('com.example.repository')).resolves.toMatchObject({ version: '0.9.0' })
    await expect(cleanupOrphanedStagedInstanceData(new Set(['keep']))).resolves.toBe(1)

    const verificationDatabase = await openCustomComponentDatabase(databaseFactory as unknown as IDBFactory)
    try {
      const transaction = verificationDatabase.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readonly')
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).getAllKeys()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      expect(keys).toEqual([['keep', 'one', 'value']])
    } finally {
      verificationDatabase.close()
    }
  })
})
