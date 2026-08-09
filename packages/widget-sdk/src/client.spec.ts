import { describe, expect, it, vi } from 'vitest'

import { createWidgetApi } from './api.js'
import { WidgetApiRequestError, WidgetClient, WidgetClientError } from './client.js'
import { createWidgetMockHost } from './testing.js'

/** 为客户端测试创建最小 Broker 响应端口，只验证公开 request/response DTO 而不依赖宿主实现。 */
function createClientFixture(): { readonly client: WidgetClient; readonly hostPort: MessagePort } {
  const channel = new MessageChannel()
  channel.port1.onmessage = (event) => {
    const request = event.data as { requestId: string; method: string }
    if (request.method === 'fails') {
      channel.port1.postMessage({ requestId: request.requestId, ok: false, error: { code: 'PERMISSION_DENIED', message: '权限不足。' } })
      return
    }
    channel.port1.postMessage({ requestId: request.requestId, ok: true, result: { method: request.method } })
  }
  channel.port1.start()
  return { client: new WidgetClient({ port: channel.port2, sessionId: 'session-a' }), hostPort: channel.port1 }
}

/** 覆盖 MessageChannel 客户端的关联、错误、事件和关闭清理行为。 */
describe('WidgetClient', () => {
  /** 验证 SDK 按 requestId 关联 Broker 成功响应，而不依赖请求顺序。 */
  it('关联成功响应', async () => {
    const { client } = createClientFixture()
    await expect(client.request<{ method: string }>('context.get', {})).resolves.toEqual({ method: 'context.get' })
    client.close()
  })

  /** 验证稳定 API 错误会保留公开错误码和消息，宿主异常不会越过 SDK。 */
  it('映射公开 API 错误', async () => {
    const { client } = createClientFixture()
    await expect(client.request('fails', {})).rejects.toMatchObject({
      name: WidgetApiRequestError.name,
      apiError: { code: 'PERMISSION_DENIED', message: '权限不足。' },
    })
    client.close()
  })

  /** 验证生命周期事件只在同会话投递，关闭后不会再保留监听器。 */
  it('订阅事件并在关闭时清理', async () => {
    const { client, hostPort } = createClientFixture()
    const listener = vi.fn()
    client.subscribe('themeChanged', listener)
    hostPort.postMessage({ protocol: 'patab-widget', apiVersion: 1, sessionId: 'session-a', event: 'themeChanged', payload: { theme: 'dark', reducedMotion: true } })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ theme: 'dark', reducedMotion: true }))
    client.close()
    await expect(client.request('context.get', {})).rejects.toMatchObject({ code: 'CLIENT_CLOSED' } satisfies Partial<WidgetClientError>)
    hostPort.close()
  })
})

/** 覆盖 testing Mock 的公开状态，确保官方示例和模拟器不会自建第二套 DTO 或错误码。 */
describe('Widget testing mocks', () => {
  /** 验证 Mock 可以驱动存储、主题、surface、待办和网络的正式 SDK 调用。 */
  it('提供可配置的 API v1 Mock', async () => {
    const host = createWidgetMockHost({
      permissions: ['todos.read', 'todos.create'],
      storage: { title: '初始值' },
      network: () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' }),
    })
    const api = createWidgetApi(host.client)
    await expect(api.storage.get('title')).resolves.toEqual({ found: true, value: '初始值' })
    await api.storage.set('title', '更新后')
    expect(host.getStorage()).toEqual({ title: '更新后' })
    await api.ui.openSurface({ surface: 'detail' })
    expect(host.getOpenedSurface()).toBe('detail')
    await expect(api.todos.create({ text: 'Mock 待办' })).resolves.toMatchObject({ text: 'Mock 待办' })
    await expect(api.network.fetch({ url: 'https://api.example.test/items', method: 'GET' })).resolves.toMatchObject({ status: 200 })
    const themed = vi.fn()
    api.on('themeChanged', themed)
    host.setTheme({ theme: 'dark', reducedMotion: true })
    await vi.waitFor(() => expect(themed).toHaveBeenCalledWith({ theme: 'dark', reducedMotion: true }))
    host.close()
  })
})
