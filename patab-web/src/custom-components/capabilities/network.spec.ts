import { describe, expect, it, vi } from 'vitest'

import type { WidgetPermissionSource } from '@/custom-components/runtime/capabilityBroker'

import { createWidgetNetworkBrokerMethods } from './network'
import type { WidgetNetworkAdapter } from './networkAdapters'

/** 构造固定会话，确保所有网络授权与调用都只能从 Broker 已验证的身份派生。 */
const session = {
  componentId: 'com.example.network',
  componentVersion: '1.0.0',
  instanceId: 'instance-1',
  sessionId: 'session-1',
} as const

/** 验证网络 Capability 对精确 Repository grant、DTO 和适配器错误的编排，不直接触达 fetch。 */
describe('network.fetch Capability', () => {
  /** 验证未授权 origin 在调用浏览器适配器前返回 ORIGIN_NOT_ALLOWED。 */
  it('拒绝不属于动态授权快照的来源', async () => {
    const adapter: WidgetNetworkAdapter = { execute: vi.fn() }
    const permissions: WidgetPermissionSource = {
      hasPermission: async () => false,
      hasNetworkOrigin: async () => false,
    }
    const method = createWidgetNetworkBrokerMethods(permissions, adapter)['network.fetch']!

    await expect(method.invoke({ url: 'https://api.example.test/items', method: 'GET' }, session)).rejects.toMatchObject({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  /** 验证已授权来源只把规范化 DTO 传给适配器，Authorization 保持在请求头而不会进入异常。 */
  it('调用已授权精确来源并保留明确 Authorization', async () => {
    const adapter: WidgetNetworkAdapter = {
      execute: vi.fn(async () => ({ status: 200, headers: {}, body: 'ok' })),
    }
    const permissions: WidgetPermissionSource = {
      hasPermission: async () => false,
      hasNetworkOrigin: async (_session, origin) => origin === 'https://api.example.test',
    }
    const method = createWidgetNetworkBrokerMethods(permissions, adapter)['network.fetch']!

    await expect(method.invoke({
      url: 'https://API.example.test/items#never-send',
      method: 'GET',
      headers: { Authorization: 'Bearer private-token' },
    }, session)).resolves.toEqual({ status: 200, headers: {}, body: 'ok' })
    expect(adapter.execute).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'https://api.example.test',
      headers: { authorization: 'Bearer private-token' },
    }))
  })

  /** 验证策略失败在 fetch 前返回稳定错误，且错误载荷不含敏感头或请求正文。 */
  it('拒绝非法 DTO 且不泄露敏感载荷', async () => {
    const adapter: WidgetNetworkAdapter = { execute: vi.fn() }
    const method = createWidgetNetworkBrokerMethods({
      hasPermission: async () => false,
      hasNetworkOrigin: async () => true,
    }, adapter)['network.fetch']!
    const secret = 'Bearer private-token'

    await expect(method.invoke({
      url: 'https://api.example.test/items',
      method: 'GET',
      headers: { Cookie: secret },
      body: 'private-body',
    }, session)).rejects.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } })
    expect(adapter.execute).not.toHaveBeenCalled()
  })
})
