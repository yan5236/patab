import { afterEach, describe, expect, it, vi } from 'vitest'

import { WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES, WIDGET_NETWORK_TIMEOUT_MS } from '@patab/widget-sdk'

import {
  containsMv3OriginPermission,
  createMv3OriginPattern,
  createMv3WidgetNetworkAdapter,
  createWebWidgetNetworkAdapter,
  removeMv3OriginPermission,
  requestMv3OriginPermission,
  type Mv3OptionalHostPermissionApi,
  type WidgetNetworkFetch,
} from './networkAdapters'
import type { NormalizedWidgetNetworkRequest } from './networkPolicy'

/** 构造已完成策略校验的请求，网络适配器测试不重复覆盖 DTO 解析规则。 */
function createRequest(overrides: Partial<NormalizedWidgetNetworkRequest> = {}): NormalizedWidgetNetworkRequest {
  return {
    url: 'https://api.example.test/v1/items',
    origin: 'https://api.example.test',
    method: 'GET',
    headers: { authorization: 'Bearer private-token' },
    ...overrides,
  }
}

/** 构造可观察精确 origin 调用的 MV3 权限 API 替身。 */
function createPermissionApi(overrides: Partial<Mv3OptionalHostPermissionApi> = {}): Mv3OptionalHostPermissionApi {
  return {
    contains: vi.fn(async () => true),
    request: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

/** 假时钟仅用于 10 秒请求中止验证，结束后始终恢复真实浏览器计时器。 */
afterEach(() => {
  vi.useRealTimers()
})

describe('Web 网络适配器', () => {
  /** 验证受限 fetch 初始化、白名单响应头和正文复制同时生效，Authorization 不进入输出。 */
  it('固定 CORS、omit 凭据、无 referrer 和拒绝重定向', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        etag: 'v1',
        'set-cookie': 'never-expose',
        'x-private': 'never-expose',
      },
    })) as unknown as WidgetNetworkFetch
    const adapter = createWebWidgetNetworkAdapter(fetchImpl)

    await expect(adapter.execute(createRequest())).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'text/plain', etag: 'v1' },
      body: 'ok',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/v1/items', expect.objectContaining({
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      headers: { authorization: 'Bearer private-token' },
    }))
  })

  /** 验证即使底层实现意外返回 3xx，适配器也不向组件交出重定向响应或跟随后的数据。 */
  it('拒绝任何重定向响应', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://other.example.test/next' },
    })) as unknown as WidgetNetworkFetch

    await expect(createWebWidgetNetworkAdapter(fetchImpl).execute(createRequest())).rejects.toMatchObject({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
    })
  })

  /** 验证 CORS/网络失败不会降级到任何代理，也不将内部异常或 Authorization 传回组件。 */
  it('把 CORS 失败映射为脱敏稳定错误', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('CORS blocked: Bearer private-token')
    }) as unknown as WidgetNetworkFetch

    await expect(createWebWidgetNetworkAdapter(fetchImpl).execute(createRequest())).rejects.toMatchObject({
      error: { code: 'INVALID_REQUEST', message: '网络请求因浏览器网络或跨域限制失败。' },
    })
  })

  /** 验证响应超过 2 MiB 会被中断并返回 RESPONSE_TOO_LARGE，而不是把全文读入 SDK DTO。 */
  it('中止超过响应正文上限的流', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES + 1))) as unknown as WidgetNetworkFetch

    await expect(createWebWidgetNetworkAdapter(fetchImpl).execute(createRequest())).rejects.toMatchObject({
      error: { code: 'RESPONSE_TOO_LARGE' },
    })
  })

  /** 验证十秒未完成的请求触发 AbortController 并映射 TIMEOUT，不让底层 AbortError 离开适配器。 */
  it('超过十秒时终止请求', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as WidgetNetworkFetch
    const pending = createWebWidgetNetworkAdapter(fetchImpl).execute(createRequest())
    const expectation = expect(pending).rejects.toMatchObject({ error: { code: 'TIMEOUT' } })

    await vi.advanceTimersByTimeAsync(WIDGET_NETWORK_TIMEOUT_MS)
    await expectation
  })
})

describe('MV3 精确 host permission 适配器', () => {
  /** 验证 request、contains 与 remove 永远只接收单一精确 origin 模式。 */
  it('只向 Chrome permissions API 传递精确 origin', async () => {
    const api = createPermissionApi()
    const origin = 'https://api.example.test' as const

    expect(createMv3OriginPattern(origin)).toBe('https://api.example.test/*')
    await expect(requestMv3OriginPermission(origin, api)).resolves.toBe(true)
    await expect(containsMv3OriginPermission(origin, api)).resolves.toBe(true)
    await expect(removeMv3OriginPermission(origin, api)).resolves.toBe(true)
    expect(api.request).toHaveBeenCalledWith({ origins: ['https://api.example.test/*'] })
    expect(api.contains).toHaveBeenCalledWith({ origins: ['https://api.example.test/*'] })
    expect(api.remove).toHaveBeenCalledWith({ origins: ['https://api.example.test/*'] })
  })

  /** 验证浏览器权限撤销后适配器在 fetch 前阻止请求，即使 Repository 授权尚未刷新。 */
  it('浏览器撤销 host permission 后拒绝发送 fetch', async () => {
    const api = createPermissionApi({ contains: vi.fn(async () => false) })
    const fetchImpl = vi.fn() as unknown as WidgetNetworkFetch
    const adapter = createMv3WidgetNetworkAdapter(fetchImpl, api)

    await expect(adapter.execute(createRequest())).rejects.toMatchObject({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
