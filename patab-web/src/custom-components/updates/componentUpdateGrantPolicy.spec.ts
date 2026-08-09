import { describe, expect, it } from 'vitest'

import { createComponentUpdateGrantReview } from './componentUpdateGrantPolicy'

/** 创建更新授权规则所需的最小 Manifest，避免测试耦合 ZIP 或 UI。 */
function createManifest(input: {
  readonly permissions?: readonly ('todos.read' | 'todos.create')[]
  readonly origins?: readonly string[]
}) {
  return {
    schemaVersion: 1 as const,
    apiVersion: '1' as const,
    id: 'com.example.grants',
    version: '1.0.0',
    name: { default: 'Grant' },
    description: { default: 'Grant' },
    developer: { default: 'PaTab' },
    surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
    sizes: [{ w: 2 as const, h: 2 as const }],
    defaultSize: { w: 2 as const, h: 2 as const },
    ...(input.permissions ? { permissions: { optional: input.permissions } } : {}),
    ...(input.origins ? { network: input.origins.map((origin) => ({ origin: origin as `https://${string}`, required: false, reason: { default: '测试' } })) } : {}),
    assets: { icon: 'assets/icon.png' as const },
  }
}

/** 覆盖更新授权仅继承交集且新增项停止等待确认的安全边界。 */
describe('组件更新授权差异', () => {
  /** 相同声明应复用已授予项，而以前被拒绝的 optional 项不会在更新中被意外开启。 */
  it('复用仍在新版本声明中的原 grant', () => {
    const previous = createManifest({ permissions: ['todos.read', 'todos.create'], origins: ['https://old.example.test'] })
    const review = createComponentUpdateGrantReview(
      { grantedPermissions: ['todos.read'], grantedNetworkOrigins: ['https://old.example.test'] },
      previous,
      createManifest({ permissions: ['todos.read', 'todos.create'], origins: ['https://old.example.test'] }),
    )

    expect(review).toEqual({
      permissionGrants: { 'todos.read': true, 'todos.create': false },
      networkGrants: { 'https://old.example.test': true },
      newPermissions: [],
      newNetworkOrigins: [],
    })
  })

  /** 新能力必须以未授权状态进入审查，不能因为旧组件已有其他 grant 而自动扩大权限。 */
  it('将新增权限和 origin 标记为待确认', () => {
    const previous = createManifest({ permissions: ['todos.read'], origins: ['https://old.example.test'] })
    const review = createComponentUpdateGrantReview(
      { grantedPermissions: ['todos.read'], grantedNetworkOrigins: ['https://old.example.test'] },
      previous,
      createManifest({ permissions: ['todos.read', 'todos.create'], origins: ['https://old.example.test', 'https://new.example.test'] }),
    )

    expect(review.permissionGrants).toEqual({ 'todos.read': true, 'todos.create': false })
    expect(review.networkGrants).toEqual({ 'https://old.example.test': true, 'https://new.example.test': false })
    expect(review.newPermissions).toEqual(['todos.create'])
    expect(review.newNetworkOrigins).toEqual(['https://new.example.test'])
  })
})
