import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const browserPermissions = vi.hoisted(() => ({
  contains: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  request: vi.fn(async () => true),
}))

vi.mock('@/utils/runtimeEnvironment', () => ({
  detectRuntimeEnvironment: () => 'extension',
}))

vi.mock('@/custom-components/capabilities/networkAdapters', () => ({
  containsMv3OriginPermission: browserPermissions.contains,
  removeMv3OriginPermission: browserPermissions.remove,
  requestMv3OriginPermission: browserPermissions.request,
}))

import { useCustomComponentStore } from './customComponents'

/** 每个 MV3 Store 用例重置独立 Pinia、内存目录和模拟浏览器权限，避免手势确认状态穿透。 */
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  browserPermissions.contains.mockReset()
  browserPermissions.contains.mockResolvedValue(true)
  browserPermissions.remove.mockReset()
  browserPermissions.remove.mockResolvedValue(true)
  browserPermissions.request.mockReset()
  browserPermissions.request.mockResolvedValue(true)
})

/** 创建含必需精确网络来源的最小已审查包，避免重复 ZIP、签名与素材校验范围。 */
function createReview() {
  return {
    manifest: {
      schemaVersion: 1 as const,
      apiVersion: '1' as const,
      id: 'com.example.mv3-network',
      version: '1.0.0',
      name: { default: 'MV3 Network' },
      description: { default: 'MV3 host permission 测试' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
      sizes: [{ w: 2 as const, h: 2 as const }],
      defaultSize: { w: 2 as const, h: 2 as const },
      network: [{
        origin: 'https://api.example.test' as const,
        required: true,
        reason: { default: '读取组件网络数据' },
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

/** 覆盖 MV3 安装确认期间的精确 host permission 交互，确保 Pinia grant 不会替代浏览器真实授权。 */
describe('MV3 网络来源安装确认', () => {
  /** 验证安装审查勾选会在用户手势路径先请求精确 origin，浏览器拒绝时不写入 Store grant。 */
  it('浏览器确认成功后才记录网络来源授权', async () => {
    const store = useCustomComponentStore()
    const review = createReview()
    const network = review.manifest.network[0]!
    store.completePackageReview(review)

    await expect(store.confirmNetworkGrant(network, true)).resolves.toBe(true)
    expect(browserPermissions.request).toHaveBeenCalledWith('https://api.example.test')
    expect(store.networkGrants).toEqual({ 'https://api.example.test': true })

    browserPermissions.remove.mockResolvedValueOnce(false)
    await expect(store.confirmNetworkGrant(network, false)).resolves.toBe(false)
    expect(store.networkGrants).toEqual({ 'https://api.example.test': true })
  })

  /** 验证安装提交前再次查询 Chrome 来源权限，已经撤销时拒绝写入 Repository。 */
  it('安装前发现浏览器来源授权已撤销时阻止安装', async () => {
    const store = useCustomComponentStore()
    const review = createReview()
    const network = review.manifest.network[0]!
    store.completePackageReview(review)
    await store.confirmNetworkGrant(network, true)
    browserPermissions.contains.mockResolvedValueOnce(false)

    await expect(store.installReviewedPackage()).rejects.toMatchObject({
      code: 'REQUIRED_PERMISSION_NOT_GRANTED',
    })
    expect(store.installedComponents).toEqual([])
  })
})
