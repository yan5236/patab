import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getActiveComponentVersion,
  getInstalledComponent,
  getRollbackComponentVersion,
  installComponentPackage,
} from '@/custom-components/repository/componentPackageRepository'
import { getInstanceStorageValue, setInstanceStorageValue } from '@/custom-components/repository/instanceStorageRepository'

import { commitStagedComponentUpdate } from './componentUpdateCommitRepository'
import { executeComponentUpdate, type ComponentUpdateRuntime } from './componentUpdateService'
import { cleanupInterruptedComponentUpdates, stageComponentUpdate } from './stagedComponentUpdateRepository'

/** 每个更新服务用例使用独立 IndexedDB，确保 staged/rollback 断言不会互相影响。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 创建活动或更新包的最小输入，surface 文本仅用于 Repository 保留版本断言。 */
function createPackage(version: string, options: { readonly migration?: boolean; readonly permissions?: boolean } = {}) {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.transaction',
      version,
      name: { default: 'Transaction' },
      description: { default: '阶段 9 事务测试' },
      developer: { default: 'PaTab' },
      surfaces: {
        widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } },
        ...(options.migration ? { migration: { entry: 'surfaces/migration.html' as const, title: { default: 'Migration' } } } : {}),
      },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      ...(options.permissions ? { permissions: { required: ['todos.read' as const] } } : {}),
      assets: { icon: 'assets/icon.png' as const },
    },
    integrity: { schemaVersion: 1 as const, algorithm: 'sha256' as const, files: [ ] },
    grantedPermissions: options.permissions ? ['todos.read' as const] : [],
    grantedNetworkOrigins: [],
    files: [
      { path: 'surfaces/widget.html', content: `<!doctype html><html><body>${version}</body></html>` },
      ...(options.migration ? [{ path: 'surfaces/migration.html', content: '<!doctype html><html><body>migration</body></html>' }] : []),
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  }
}

/** 创建只记录 staged surface 调用的 Runtime 替身，故障测试不依赖浏览器 iframe。 */
function createRuntime(failAt?: { readonly surface: 'migration' | 'widget'; readonly instanceId: string }) {
  const calls: Array<{ readonly surface: string; readonly instanceId: string }> = []
  const runtime: ComponentUpdateRuntime = {
    async startStagedUpdateSurface(request) {
      calls.push({ surface: request.surface, instanceId: request.instanceId })
      if (failAt?.surface === request.surface && failAt.instanceId === request.instanceId) throw new Error('injected')
      return { frameElement: document.createElement('iframe'), destroy: vi.fn() }
    },
  }
  return { runtime, calls }
}

/** 将安装包转换为更新服务输入，保持测试聚焦 staged 时序而不重复 ZIP 审查。 */
function createUpdateInput(updateId: string, incoming: ReturnType<typeof createPackage>, instanceIds: readonly string[]) {
  return {
    updateId,
    manifest: incoming.manifest,
    integrity: incoming.integrity,
    files: incoming.files,
    grantedPermissions: incoming.grantedPermissions,
    grantedNetworkOrigins: incoming.grantedNetworkOrigins,
    instanceIds,
  }
}

/** 创建无布局副作用的离屏容器工厂，便于验证每次更新必然回收临时节点。 */
function createContainerFactory() {
  const dispose = vi.fn()
  return { element: document.createElement('div'), dispose }
}

/** 覆盖完整 staged 更新时序、失败清理、提交异常和上一成功版本保留。 */
describe('组件更新服务', () => {
  /** 所有现有 launcher 实例都先迁移再健康握手，随后以单事务切换版本、数据和 grant。 */
  it('迁移和健康检查全部实例后原子提交并保留上一成功版本', async () => {
    const initial = createPackage('1.0.0', { permissions: true })
    await installComponentPackage(initial)
    await setInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'old', { keep: true })
    const incoming = createPackage('1.1.0', { migration: true, permissions: true })
    const runtime = createRuntime()
    const container = createContainerFactory()

    await executeComponentUpdate(createUpdateInput('success-update', incoming, ['first', 'empty']), {
      runtime: runtime.runtime,
      createOffscreenContainer: () => container,
    })

    expect(runtime.calls).toEqual([
      { surface: 'migration', instanceId: 'first' },
      { surface: 'migration', instanceId: 'empty' },
      { surface: 'widget', instanceId: 'first' },
      { surface: 'widget', instanceId: 'empty' },
    ])
    await expect(getActiveComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.1.0', isActive: true })
    await expect(getRollbackComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.0.0', isRollback: true })
    await expect(getInstalledComponent(initial.manifest.id)).resolves.toMatchObject({ grantedPermissions: ['todos.read'] })
    await expect(getInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'old')).resolves.toEqual({ keep: true })
    expect(container.dispose).toHaveBeenCalledOnce()

    const secondUpdate = createPackage('1.2.0', { permissions: true })
    await executeComponentUpdate(createUpdateInput('second-success', secondUpdate, ['first', 'empty']), {
      runtime: runtime.runtime,
      createOffscreenContainer: createContainerFactory,
    })
    await expect(getActiveComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.2.0', isActive: true })
    await expect(getRollbackComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.1.0', isRollback: true })
  })

  /** migration 超时/失败时 staged 包被清理，旧包、旧数据和旧 grant 绝不被提前替换。 */
  it('migration 失败后丢弃 staged 内容并保留旧状态', async () => {
    const initial = createPackage('1.0.0', { permissions: true })
    await installComponentPackage(initial)
    await setInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'keep', 'old')
    const incoming = createPackage('1.1.0', { migration: true, permissions: true })
    const runtime = createRuntime({ surface: 'migration', instanceId: 'first' })

    await expect(executeComponentUpdate(createUpdateInput('migration-fails', incoming, ['first']), {
      runtime: runtime.runtime,
      createOffscreenContainer: createContainerFactory,
    })).rejects.toMatchObject({ code: 'UPDATE_MIGRATION_FAILED' })

    await expect(getActiveComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.0.0' })
    await expect(getInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'keep')).resolves.toBe('old')
    await expect(getInstalledComponent(initial.manifest.id)).resolves.toMatchObject({ grantedPermissions: ['todos.read'] })
    await expect(cleanupInterruptedComponentUpdates()).resolves.toBe(0)
  })

  /** 任何一个实例未健康握手都阻断整次更新，前面已通过的实例不能促成半提交。 */
  it('部分实例健康失败后保留旧版本', async () => {
    const initial = createPackage('1.0.0')
    await installComponentPackage(initial)
    const incoming = createPackage('1.1.0')
    const runtime = createRuntime({ surface: 'widget', instanceId: 'second' })

    await expect(executeComponentUpdate(createUpdateInput('health-fails', incoming, ['first', 'second']), {
      runtime: runtime.runtime,
      createOffscreenContainer: createContainerFactory,
    })).rejects.toMatchObject({ code: 'UPDATE_HEALTH_FAILED' })
    await expect(getActiveComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.0.0' })
  })

  /** 注入提交事务异常后所有写入都会 abort，staged 恢复清理只删除临时内容而不回滚用户旧数据。 */
  it('提交事务异常时保持活动状态并可由恢复清理删除 staged 内容', async () => {
    const initial = createPackage('1.0.0')
    await installComponentPackage(initial)
    await setInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'keep', 'old')
    const incoming = createPackage('1.1.0')
    await stageComponentUpdate({ updateId: 'commit-throws', manifest: incoming.manifest, integrity: incoming.integrity, files: incoming.files })

    await expect(commitStagedComponentUpdate({
      updateId: 'commit-throws',
      componentId: initial.manifest.id,
      grantedPermissions: [],
      grantedNetworkOrigins: [],
    }, { beforeWrite: () => { throw new Error('injected transaction failure') } })).rejects.toMatchObject({ code: 'UPDATE_STAGE_WRITE_FAILED' })

    await expect(getActiveComponentVersion(initial.manifest.id)).resolves.toMatchObject({ version: '1.0.0' })
    await expect(getInstanceStorageValue({ componentId: initial.manifest.id, instanceId: 'first' }, 'keep')).resolves.toBe('old')
    await expect(cleanupInterruptedComponentUpdates()).resolves.toBe(1)
  })
})
