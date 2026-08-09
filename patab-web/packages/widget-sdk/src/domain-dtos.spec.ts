import { describe, expect, it } from 'vitest'

import {
  WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES,
  WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES,
  validateWidgetNetworkRequest,
  validateWidgetNetworkResponse,
} from './network.js'
import {
  WIDGET_TODO_PAGE_LIMIT_MAX,
  WIDGET_TODO_TEXT_MAX_LENGTH,
  validateWidgetTodoCreateInput,
  validateWidgetTodoListRequest,
  validateWidgetTodoUpdateInput,
} from './todos.js'

/**
 * 组织待办与网络公开 DTO 边界的聚焦测试，验证纯校验不会访问宿主状态或发送真实请求。
 */
describe('待办与网络公开 DTO', () => {
  /**
   * 验证待办创建、更新和分页接受合法最小载荷，并拒绝空文本、无效日期和超限分页。
   */
  it('约束待办写入字段和分页边界', () => {
    expect(validateWidgetTodoCreateInput({
      text: '完成 API 契约',
      dueDate: '2026-08-08',
    })).toEqual({ valid: true })
    expect(validateWidgetTodoUpdateInput({
      id: 'todo-1',
      dueDate: '2026-02-30',
    })).toMatchObject({ valid: false, error: { path: 'dueDate' } })
    expect(validateWidgetTodoCreateInput({ text: 'x'.repeat(WIDGET_TODO_TEXT_MAX_LENGTH + 1) }))
      .toMatchObject({ valid: false, error: { path: 'text' } })
    expect(validateWidgetTodoListRequest({ limit: WIDGET_TODO_PAGE_LIMIT_MAX + 1 }))
      .toMatchObject({ valid: false, error: { path: 'limit' } })
  })

  /**
   * 验证网络 DTO 仅接受无凭据 HTTPS 请求、受限头字段和限定大小正文，并以 RESPONSE_TOO_LARGE 标识超限响应。
   */
  it('约束网络请求与响应字段和大小', () => {
    expect(validateWidgetNetworkRequest({
      url: 'https://api.example.com/weather',
      method: 'GET',
      headers: { Accept: 'application/json' },
    })).toEqual({ valid: true })
    expect(validateWidgetNetworkRequest({
      url: 'https://api.example.com',
      method: 'GET',
      headers: { Cookie: 'session=secret' },
    })).toMatchObject({ valid: false, error: { path: 'headers.Cookie' } })
    expect(validateWidgetNetworkRequest({
      url: 'https://api.example.com',
      method: 'POST',
      body: 'x'.repeat(WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES + 1),
    })).toMatchObject({ valid: false, error: { path: 'body' } })
    expect(validateWidgetNetworkResponse({
      status: 200,
      headers: {},
      body: 'x'.repeat(WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES + 1),
    })).toMatchObject({ valid: false, error: { code: 'RESPONSE_TOO_LARGE' } })
    expect(validateWidgetNetworkResponse({
      status: 200,
      headers: { 'Set-Cookie': 'session=secret' },
      body: '',
    })).toMatchObject({ valid: false, error: { path: 'headers.Set-Cookie' } })
  })
})
