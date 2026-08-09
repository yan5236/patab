import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getInstalledComponent, installComponentPackage } from './componentPackageRepository'
import {
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from './customComponentDatabase'
import { getComponentUninstallPreview, uninstallComponentPackage } from './componentUninstallRepository'

/** 创建带一个活动版本的最小已验证包，供卸载测试覆盖真实 Repository 数据结构。 */
function createInstallInput() {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.uninstall',
      version: '1.0.0',
      name: { default: 'Uninstall' },
      description: { default: '卸载测试' },
      developer: { default: 'PaTab test' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    grantedPermissions: [],
    files: [
      { path: 'surfaces/widget.html', content: '<main>卸载</main>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  } as Parameters<typeof installComponentPackage>[0]
}

/** 在活动包外写入回滚、私有数据、健康和 staged 快照，验证卸载不会遗漏非活动版本足迹。 */
async function seedRelatedRecords(): Promise<void> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction([
      CUSTOM_COMPONENT_STORE_VERSIONS,
      CUSTOM_COMPONENT_STORE_FILES,
      CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
      CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
      CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
    ], 'readwrite')
    transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).put({
      componentId: 'com.example.uninstall',
      version: '0.9.0',
      isActive: false,
      isRollback: true,
      stagedUpdateId: 'update-uninstall',
      installedAt: 1,
    })
    transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).put({
      componentId: 'com.example.uninstall',
      version: '0.9.0',
      path: 'surfaces/widget.html',
      content: '<main>rollback</main>',
    })
    transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).put({
      componentId: 'com.example.uninstall',
      instanceId: 'instance-1',
      key: 'private-key',
      value: { secret: 'not returned by preview' },
      serializedBytes: 42,
      updatedAt: 1,
    })
    transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).put({
      componentId: 'com.example.uninstall',
      instanceId: 'instance-1',
      consecutiveFailures: 3,
      firstFailedAt: 1,
      lastFailedAt: 3,
      lastErrorCode: 'protocol-flood',
      disabledReason: 'protocol-flood',
    })
    transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).put({
      updateId: 'update-uninstall',
      instanceId: 'instance-1',
      key: 'private-key',
      value: { secret: 'staged' },
      serializedBytes: 10,
      updatedAt: 1,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

/** 每个卸载用例使用独立数据库，避免组件目录或 staged updateId 跨测试遗留。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 覆盖二次确认前的只读预览与确认后的完整原子删除范围。 */
describe('组件完整卸载 Repository', () => {
  /** 预览只给出计数，确认删除会清理活动、回滚、授权目录、私有数据、健康和关联 staged 快照。 */
  it('预览删除范围并原子删除组件完整持久化足迹', async () => {
    await installComponentPackage(createInstallInput())
    await seedRelatedRecords()

    await expect(getComponentUninstallPreview('com.example.uninstall')).resolves.toEqual({
      componentId: 'com.example.uninstall',
      versionCount: 2,
      fileCount: 3,
      instanceDataEntryCount: 1,
      instanceDataBytes: 42,
      healthRecordCount: 1,
      stagedDataEntryCount: 1,
    })

    await uninstallComponentPackage('com.example.uninstall')
    await expect(getInstalledComponent('com.example.uninstall')).resolves.toBeUndefined()

    const database = await openCustomComponentDatabase()
    try {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_VERSIONS,
        CUSTOM_COMPONENT_STORE_FILES,
        CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
        CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
        CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
      ], 'readonly')
      const counts = await Promise.all([
        transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).count(),
        transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).count(),
        transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).count(),
        transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).count(),
        transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).count(),
      ].map((request) => new Promise<number>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })))
      expect(counts).toEqual([0, 0, 0, 0, 0])
    } finally {
      database.close()
    }
  })
})
