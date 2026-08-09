import { describe, expect, it } from 'vitest'

import { WIDGET_PERMISSIONS, validateWidgetPermissionDeclarations } from './permissions.js'

/**
 * 组织 Manifest 权限目录与 required/optional 组合规则的聚焦测试，不需要宿主授权存储或运行时 Broker。
 */
describe('权限公开契约', () => {
  /**
   * 验证 API v1 仅公开四项待办权限，且合法的必需与可选权限集合能通过纯校验。
   */
  it('公开允许权限并接受无冲突声明', () => {
    expect(WIDGET_PERMISSIONS).toEqual([
      'todos.read',
      'todos.create',
      'todos.update',
      'todos.delete',
    ])
    expect(validateWidgetPermissionDeclarations({
      required: ['todos.read'],
      optional: ['todos.create'],
    })).toEqual({ valid: true })
  })

  /**
   * 验证未知、重复或跨 required/optional 重叠的权限都会得到稳定且定位明确的失败结果。
   */
  it('拒绝未知、重复和角色冲突的权限', () => {
    expect(validateWidgetPermissionDeclarations({
      required: ['calendar.read' as never],
    })).toMatchObject({ valid: false, error: { path: 'permissions.required[0]' } })
    expect(validateWidgetPermissionDeclarations({
      required: ['todos.read', 'todos.read'],
    })).toMatchObject({ valid: false, error: { path: 'permissions.required[1]' } })
    expect(validateWidgetPermissionDeclarations({
      required: ['todos.read'],
      optional: ['todos.read'],
    })).toMatchObject({ valid: false, error: { path: 'permissions.optional[0]' } })
  })
})
