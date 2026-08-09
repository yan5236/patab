import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from '../repository/customComponentDatabase'
import {
  getActiveComponentVersion,
  installComponentPackage,
  readActiveComponentFile,
} from '../repository/componentPackageRepository'
import { setInstanceStorageValue } from '../repository/instanceStorageRepository'
import {
  cleanupInterruptedComponentUpdates,
  stageComponentUpdate,
} from './stagedComponentUpdateRepository'

/** 每个 staged 更新用例使用独立 IndexedDB，保证清理和快照断言不会互相污染。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 创建安装或 staged 更新共用的最小已审查包输入；HTML 内容故意随版本变化以验证旧包仍可读取。 */
function createPackageInput(version: string, publicKey?: string) {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.update',
      version,
      name: { default: '更新测试' },
      description: { default: '阶段 9 暂存测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      assets: { icon: 'assets/icon.png' as const },
      ...(publicKey ? { publisher: { publicKey } } : {}),
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    grantedPermissions: [] as const,
    files: [
      { path: 'surfaces/widget.html', content: `<main>${version}</main>` },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 读取指定 Object Store 的全部记录，用于验证 staged 事务真实保留了包文件和一致快照。 */
async function readAllRecords(storeName: string): Promise<unknown[]> {
  const database = await openCustomComponentDatabase()
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

/** 覆盖 staged 包、全量实例数据快照、旧包保留以及中断恢复清理的原子边界。 */
describe('组件更新暂存 Repository', () => {
  /** 验证一个事务同时保存新包和所有实例数据，活动版本及其文件在 staged 期间保持不变。 */
  it('暂存高版本包并复制全部实例数据，同时保留当前活动版本', async () => {
    const initialPackage = createPackageInput('1.0.0')
    await installComponentPackage(initialPackage)
    await setInstanceStorageValue({ componentId: 'com.example.update', instanceId: 'first' }, 'preferences', { theme: 'dark' }, 11)
    await setInstanceStorageValue({ componentId: 'com.example.update', instanceId: 'second' }, 'count', 2, 12)

    const incomingPackage = createPackageInput('1.1.0')
    await stageComponentUpdate({
      updateId: 'update-1',
      manifest: incomingPackage.manifest,
      integrity: incomingPackage.integrity,
      files: incomingPackage.files,
      stagedAt: 20,
    })

    await expect(getActiveComponentVersion('com.example.update')).resolves.toMatchObject({
      version: '1.0.0',
      isActive: true,
    })
    await expect(readActiveComponentFile('com.example.update', 'surfaces/widget.html')).resolves.toMatchObject({
      content: '<main>1.0.0</main>',
    })
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_VERSIONS)).toMatchObject([
      { version: '1.0.0', isActive: true, isRollback: false },
      {
        version: '1.1.0',
        isActive: false,
        isRollback: false,
        stagedUpdateId: 'update-1',
        replacesVersion: '1.0.0',
      },
    ])
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_FILES)).toHaveLength(4)
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)).toMatchObject([
      {
        updateId: 'update-1',
        componentId: 'com.example.update',
        instanceId: 'first',
        key: 'preferences',
        value: { theme: 'dark' },
        serializedBytes: 16,
        updatedAt: 11,
      },
      {
        updateId: 'update-1',
        componentId: 'com.example.update',
        instanceId: 'second',
        key: 'count',
        value: 2,
        serializedBytes: 1,
        updatedAt: 12,
      },
    ])
  })

  /** 验证中断清理只删除未完成更新的包、文件和快照，活动版本与活动实例数据不受影响。 */
  it('清理中断的 staged 更新而不触碰活动包', async () => {
    const initialPackage = createPackageInput('1.0.0')
    await installComponentPackage(initialPackage)
    await setInstanceStorageValue({ componentId: 'com.example.update', instanceId: 'first' }, 'saved', 'keep', 11)
    const incomingPackage = createPackageInput('1.1.0')
    await stageComponentUpdate({
      updateId: 'interrupted-update',
      manifest: incomingPackage.manifest,
      integrity: incomingPackage.integrity,
      files: incomingPackage.files,
    })

    await expect(cleanupInterruptedComponentUpdates()).resolves.toBe(1)
    await expect(getActiveComponentVersion('com.example.update')).resolves.toMatchObject({ version: '1.0.0' })
    await expect(readActiveComponentFile('com.example.update', 'surfaces/widget.html')).resolves.toMatchObject({
      content: '<main>1.0.0</main>',
    })
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_VERSIONS)).toHaveLength(1)
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_FILES)).toHaveLength(2)
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)).toEqual([])
  })

  /** 验证更换发布者密钥会在事务开始后被拒绝，不能写入新版本、文件或临时数据。 */
  it('拒绝密钥变化的高版本覆盖并保留已有包', async () => {
    const initialPackage = createPackageInput('1.0.0', 'old-public-key')
    await installComponentPackage(initialPackage)
    const incomingPackage = createPackageInput('1.1.0', 'new-public-key')

    await expect(stageComponentUpdate({
      updateId: 'changed-key',
      manifest: incomingPackage.manifest,
      integrity: incomingPackage.integrity,
      files: incomingPackage.files,
    })).rejects.toMatchObject({ code: 'PUBLISHER_KEY_CHANGED' })
    await expect(getActiveComponentVersion('com.example.update')).resolves.toMatchObject({ version: '1.0.0' })
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_VERSIONS)).toHaveLength(1)
    expect(await readAllRecords(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)).toEqual([])
  })
})
