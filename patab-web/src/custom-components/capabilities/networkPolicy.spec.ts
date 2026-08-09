import { describe, expect, it } from 'vitest'

import { normalizeWidgetNetworkRequest } from './networkPolicy'

/** 覆盖网络 RPC 输入在 fetch 前的公开 DTO、地址、端口和头字段安全边界。 */
describe('网络请求策略', () => {
  /** 验证 HTTPS 公网地址、显式 Authorization 与安全字段会被复制、规范化，且 hash 不参与网络请求。 */
  it('规范化安全 HTTPS 请求而不保留调用方对象', () => {
    const result = normalizeWidgetNetworkRequest({
      url: 'https://Api.Example.test:8443/v1/items?q=1#never-send',
      method: 'POST',
      headers: { Authorization: 'Bearer private-token', 'Content-Type': 'application/json' },
      body: '{"safe":true}',
    })

    expect(result).toEqual({
      valid: true,
      request: {
        url: 'https://api.example.test:8443/v1/items?q=1',
        origin: 'https://api.example.test:8443',
        method: 'POST',
        headers: { authorization: 'Bearer private-token', 'content-type': 'application/json' },
        body: '{"safe":true}',
      },
    })
  })

  /** 验证本机、裸 IP、凭据和 Fetch 危险端口不会得到可授权的网络来源。 */
  it.each([
    'https://localhost/private',
    'https://127.0.0.1/private',
    'https://[::1]/private',
    'https://user:password@api.example.test/private',
    'https://api.example.test:6000/private',
  ])('拒绝危险地址 %s', (url) => {
    expect(normalizeWidgetNetworkRequest({ url, method: 'GET' })).toMatchObject({
      valid: false,
      error: { code: 'INVALID_ARGUMENT', path: 'url' },
    })
  })

  /** 验证危险头、同名大小写覆盖和宿主内部字段不会绕过 SDK 的公开网络 DTO。 */
  it.each([
    { url: 'https://api.example.test', method: 'GET', headers: { Cookie: 'session=private' } },
    { url: 'https://api.example.test', method: 'GET', headers: { Host: 'internal.example.test' } },
    { url: 'https://api.example.test', method: 'GET', headers: { Authorization: 'one', authorization: 'two' } },
    { url: 'https://api.example.test', method: 'GET', credentials: 'include' },
  ])('拒绝危险或未声明网络字段', (input) => {
    expect(normalizeWidgetNetworkRequest(input)).toMatchObject({
      valid: false,
      error: { code: 'INVALID_ARGUMENT' },
    })
  })

  /** 验证错误 DTO 绝不回显敏感 Authorization 值或原始请求正文。 */
  it('参数失败不泄露 Authorization 或正文', () => {
    const secret = 'Bearer do-not-disclose'
    const body = 'private-body-do-not-disclose'
    const result = normalizeWidgetNetworkRequest({
      url: 'https://127.0.0.1/private',
      method: 'POST',
      headers: { Authorization: secret },
      body,
    })

    expect(result).toMatchObject({ valid: false, error: { code: 'INVALID_ARGUMENT' } })
    if (result.valid) return
    expect(JSON.stringify(result.error)).not.toContain(secret)
    expect(JSON.stringify(result.error)).not.toContain(body)
  })
})
