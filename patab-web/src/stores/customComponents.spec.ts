import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { getInstalledComponent } from '@/custom-components/repository/componentPackageRepository'
import { cleanupInterruptedComponentUpdates } from '@/custom-components/updates/stagedComponentUpdateRepository'
import { useCustomComponentStore } from './customComponents'

/** 每个 Store 用例使用独立 Pinia 与内存 IndexedDB，避免目录与审查状态跨测试污染。 */
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 创建已通过 Worker 静态校验的最小审查包，Store 测试不重复 ZIP、Schema 或图片解码测试。 */
function createReview(version = '1.0.0') {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.store',
      version,
      name: { default: 'Store' },
      description: { default: 'Store 审查测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      permissions: { required: ['todos.read'] as const, optional: ['todos.create'] as const },
      network: [{
        origin: 'https://api.example.test' as const,
        required: true,
        reason: { default: '读取组件所需数据' },
      }],
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [] },
    signatureVerification: { status: 'unsigned' as const },
    files: [
      { path: 'surfaces/widget.html', content: '<main>组件</main>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 覆盖解析审查状态、required 授权门槛、Repository 安装目录刷新及更新/卸载确认的无副作用状态机。 */
describe('自定义组件 Store 门面', () => {
  /** 验证 Store 不会在 required 权限未批准时写 IndexedDB，确认后才委托 Repository 原子安装。 */
  it('编排审查、权限确认与已安装目录而不让组件直读 IndexedDB', async () => {
    const store = useCustomComponentStore()
    store.startPackageParsing('example.patab.zip')
    expect(store.parsingStatus).toBe('parsing')

    store.completePackageReview(createReview())
    expect(store.parsingStatus).toBe('review')
    expect(store.canInstallReview).toBe(false)
    await expect(store.installReviewedPackage()).rejects.toMatchObject({ code: 'REQUIRED_PERMISSION_NOT_GRANTED' })

    expect(store.setPermissionGrant('todos.read', true)).toBe(true)
    expect(store.setPermissionGrant('todos.create', false)).toBe(true)
    expect(store.setPermissionGrant('todos.delete', true)).toBe(false)
    expect(store.setNetworkGrant({
      origin: 'https://api.example.test',
      required: true,
      reason: { default: '读取组件所需数据' },
    }, false)).toBe(true)
    expect(store.canInstallReview).toBe(false)
    expect(store.setNetworkGrant({
      origin: 'https://api.example.test',
      required: true,
      reason: { default: '读取组件所需数据' },
    }, true)).toBe(true)
    expect(store.canInstallReview).toBe(true)
    await store.installReviewedPackage()

    expect(store.parsingStatus).toBe('idle')
    expect(store.installedComponents).toMatchObject([{ componentId: 'com.example.store', activeVersion: '1.0.0' }])
  })

  /** 验证更新与卸载仅在 Store 中保存确认状态，取消时不触碰当前活动包、授权或私有数据。 */
  it('管理更新和卸载确认状态而不执行提前删除', async () => {
    const store = useCustomComponentStore()

    store.beginUpdateConfirmation('com.example.store', '1.1.0')
    expect(store.updateState).toMatchObject({ status: 'awaiting-confirmation', componentId: 'com.example.store', incomingVersion: '1.1.0' })
    store.cancelUpdateConfirmation()
    expect(store.updateState).toEqual({ status: 'idle' })

    store.completePackageReview(createReview())
    store.setPermissionGrant('todos.read', true)
    store.setNetworkGrant({
      origin: 'https://api.example.test',
      required: true,
      reason: { default: '读取组件所需数据' },
    }, true)
    await store.installReviewedPackage()
    await store.requestUninstall('com.example.store')
    expect(store.uninstallState).toMatchObject({ status: 'awaiting-confirmation', componentId: 'com.example.store' })
    store.cancelUninstall()
    expect(store.uninstallState).toEqual({ status: 'idle' })
    await expect(getInstalledComponent('com.example.store')).resolves.toBeDefined()
  })

  /** 验证同 ID 高版本不会触发第二次安装，而是保留当前包并进入后续阶段负责的更新确认状态。 */
  it('将同组件高版本分流到更新确认而不覆盖当前活动包', async () => {
    const store = useCustomComponentStore()
    store.completePackageReview(createReview('1.0.0'))
    store.setPermissionGrant('todos.read', true)
    store.setNetworkGrant({
      origin: 'https://api.example.test',
      required: true,
      reason: { default: '读取组件所需数据' },
    }, true)
    await store.installReviewedPackage()

    store.completePackageReview(createReview('1.1.0'))
    await store.installReviewedPackage()

    expect(store.updateState).toMatchObject({
      status: 'awaiting-confirmation',
      componentId: 'com.example.store',
      incomingVersion: '1.1.0',
      diff: { newPermissions: [], newNetworkOrigins: [] },
    })
    expect(store.installedComponents).toMatchObject([{ componentId: 'com.example.store', activeVersion: '1.0.0' }])
  })

  /** 更新审查先继承仍声明的旧 grant，取消确认不会创建 staged 内容或改写当前版本。 */
  it('更新审查复用旧 grant，取消时保留旧版本', async () => {
    const store = useCustomComponentStore()
    store.completePackageReview(createReview('1.0.0'))
    store.setPermissionGrant('todos.read', true)
    store.setNetworkGrant({
      origin: 'https://api.example.test',
      required: true,
      reason: { default: '读取组件所需数据' },
    }, true)
    await store.installReviewedPackage()

    store.completePackageReview(createReview('1.1.0'))
    expect(store.permissionGrants).toMatchObject({ 'todos.read': true, 'todos.create': false })
    expect(store.networkGrants).toEqual({ 'https://api.example.test': true })
    expect(store.updateDiff).toMatchObject({ newPermissions: [], newNetworkOrigins: [] })
    await store.installReviewedPackage()
    store.cancelUpdateConfirmation()

    await expect(store.installReviewedPackage()).resolves.toBe('awaiting-update')
    await expect(store.installedComponents).toMatchObject([{ componentId: 'com.example.store', activeVersion: '1.0.0' }])
    await expect(cleanupInterruptedComponentUpdates()).resolves.toBe(0)
  })
})
