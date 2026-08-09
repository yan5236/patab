import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installComponentPackage,
  updateComponentGrants,
} from '@/custom-components/repository/componentPackageRepository'

import { createRepositoryPermissionSource, getRepositoryPermissionSnapshot } from './permissions'

/** 创建带 optional 待办权限与网络来源的已验证安装输入，用于检查 grant 的动态撤销。 */
function createInstallInput() {
  return {
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.permission-runtime',
      version: '1.0.0',
      name: { default: '权限测试组件' },
      description: { default: '权限测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      permissions: { optional: ['todos.read'] as const },
      network: [{
        origin: 'https://api.example.test',
        required: false,
        reason: { default: '测试来源' },
      }],
      assets: { icon: 'assets/icon.png' },
    },
    integrity: { schemaVersion: 1, algorithm: 'sha256', files: [] },
    grantedPermissions: ['todos.read'] as const,
    grantedNetworkOrigins: ['https://api.example.test'] as const,
    files: [
      { path: 'surfaces/widget.html', content: '<!doctype html><html><body>组件</body></html>' },
      { path: 'assets/icon.png', content: new Blob(['icon'], { type: 'image/png' }) },
    ],
  } as Parameters<typeof installComponentPackage>[0]
}

/** 每个权限测试使用独立内存 IndexedDB，避免动态 grant 读取受到其他仓库用例影响。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 覆盖活动版本范围、grant 撤销和新增权限不自动继承的 Repository 驱动权限边界。 */
describe('运行时权限快照', () => {
  /** 验证 Broker 动态权限源和公开 context 快照都会在授权撤销后的下一次读取立即变更。 */
  it('撤销 optional 权限和网络来源后立即拒绝并清空快照', async () => {
    await installComponentPackage(createInstallInput())
    const session = {
      componentId: 'com.example.permission-runtime',
      componentVersion: '1.0.0',
      instanceId: 'instance-1',
      sessionId: 'session-1',
    }
    const permissions = createRepositoryPermissionSource()

    await expect(permissions.hasPermission(session, 'todos.read')).resolves.toBe(true)
    await expect(getRepositoryPermissionSnapshot(session)).resolves.toEqual({
      granted: ['todos.read'],
      networkOrigins: ['https://api.example.test'],
    })

    await updateComponentGrants('com.example.permission-runtime', {
      grantedPermissions: [],
      grantedNetworkOrigins: [],
    })

    await expect(permissions.hasPermission(session, 'todos.read')).resolves.toBe(false)
    await expect(getRepositoryPermissionSnapshot(session)).resolves.toEqual({ granted: [], networkOrigins: [] })
  })

  /** 验证 Repository 拒绝缺失 required 授权，阻止调用方把“撤销”变成对安装必要能力的静默降级。 */
  it('不允许撤销 required 权限或授予未声明权限', async () => {
    const baseInput = createInstallInput()
    const input = {
      ...baseInput,
      manifest: {
        ...baseInput.manifest,
        permissions: { required: ['todos.read'] as const },
        network: undefined,
      },
      grantedNetworkOrigins: [],
    } as Parameters<typeof installComponentPackage>[0]
    await installComponentPackage(input)

    await expect(updateComponentGrants('com.example.permission-runtime', {
      grantedPermissions: [],
      grantedNetworkOrigins: [],
    })).rejects.toMatchObject({ code: 'COMPONENT_PACKAGE_INVALID' })
    await expect(updateComponentGrants('com.example.permission-runtime', {
      grantedPermissions: ['todos.create'],
      grantedNetworkOrigins: [],
    })).rejects.toMatchObject({ code: 'COMPONENT_PACKAGE_INVALID' })
  })
})
