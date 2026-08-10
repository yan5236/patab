import { describe, expect, it, vi } from 'vitest'

import type { WidgetDevSessionDescriptor } from '@patab/widget-sdk/dev-host'

import {
  consumeWidgetDevSessionToken,
  fetchWidgetDevSessionDescriptor,
} from './sessionClient'

/** 创建合法会话响应，避免客户端测试依赖 CLI 文件系统。 */
function createDescriptor(): WidgetDevSessionDescriptor {
  return {
    protocolVersion: 1,
    sessionId: 'session_1234567890',
    hostVersion: '1.0.0',
    revision: 1,
    component: {
      manifest: {
        schemaVersion: 1,
        apiVersion: '1',
        id: 'com.example.client',
        version: '1.0.0',
        name: { default: 'Client' },
        description: { default: 'Client test' },
        developer: { default: 'PaTab' },
        surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
        sizes: [{ w: 2, h: 2 }],
        defaultSize: { w: 2, h: 2 },
        assets: { icon: 'assets/icon.png' },
      },
      surfacePaths: {
        widget: '/__patab_dev__/sessions/session_1234567890/surfaces/widget',
      },
    },
    initialInstance: { instanceId: 'instance_12345678', size: { w: 2, h: 2 } },
    seedVersion: 1,
  }
}

describe('开发会话客户端', () => {
  /** 验证 token 只读取一次并立刻从地址栏移除。 */
  it('消费 fragment token 后清理地址栏', () => {
    const replaceState = vi.fn()
    const token = consumeWidgetDevSessionToken({
      hash: '#session=AAAAAAAAAAAAAAAAAAAAAAAA',
      href: 'http://127.0.0.1/__patab_dev__/#session=AAAAAAAAAAAAAAAAAAAAAAAA',
      pathname: '/__patab_dev__/',
      search: '?view=host',
    }, { replaceState })

    expect(token).toBe('AAAAAAAAAAAAAAAAAAAAAAAA')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/__patab_dev__/?view=host')
  })

  /** 验证缺失或不安全 token 在网络请求前失败。 */
  it.each(['', '#session=short', '#session=token/with/path'])(
    '拒绝无效 fragment：%s',
    (hash) => {
      expect(() => consumeWidgetDevSessionToken({ hash, href: '', pathname: '/', search: '' }, {
        replaceState: vi.fn(),
      })).toThrowError(expect.objectContaining({ code: 'AUTH_REQUIRED' }))
    },
  )

  /** 验证请求使用 Bearer、禁缓存、无凭据和 no-referrer，并返回校验后的副本。 */
  it('安全拉取合法会话描述', async () => {
    const descriptor = createDescriptor()
    const fetch = vi.fn(async () => new Response(JSON.stringify(descriptor), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await fetchWidgetDevSessionDescriptor({ token: 'AAAAAAAAAAAAAAAAAAAAAAAA', fetch })

    expect(result).toEqual(descriptor)
    expect(result).not.toBe(descriptor)
    expect(fetch).toHaveBeenCalledWith('/__patab_dev__/session', expect.objectContaining({
      headers: { Authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAAAAA' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }))
  })

  /** 验证认证、JSON 与契约错误只返回稳定分类。 */
  it('压缩服务端和描述错误', async () => {
    await expect(fetchWidgetDevSessionDescriptor({
      token: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      fetch: vi.fn(async () => new Response('', { status: 401 })),
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fetchWidgetDevSessionDescriptor({
      token: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      fetch: vi.fn(async () => new Response('{', { status: 200 })),
    })).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await expect(fetchWidgetDevSessionDescriptor({
      token: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      fetch: vi.fn(async () => new Response(JSON.stringify({ ...createDescriptor(), revision: 0 }), { status: 200 })),
    })).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })
})
