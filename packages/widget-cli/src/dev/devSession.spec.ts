import { describe, expect, it } from 'vitest'

import type { WidgetProject } from '../project.js'
import {
  authenticateWidgetDevSession,
  createWidgetDevHostUrl,
  createWidgetDevSession,
} from './devSession.js'

/** 创建不读取文件系统的最小项目快照，聚焦测试会话身份与路径。 */
function createProject(): WidgetProject {
  return {
    root: 'C:\\not-exposed\\widget',
    manifestSource: '{"not":"exposed"}',
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.session',
      version: '1.0.0',
      name: { default: 'Session' },
      description: { default: 'Session test' },
      developer: { default: 'PaTab' },
      surfaces: {
        widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } },
        settings: { entry: 'surfaces/settings.html', title: { default: 'Settings' } },
      },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      assets: { icon: 'assets/icon.png' },
    },
  }
}

/** 生成按调用序号区分的固定字节，确保 session/token/instance 三个随机值不同且可断言。 */
function createDeterministicRandomSource(): (size: number) => Uint8Array {
  let sequence = 0
  return (size) => {
    sequence += 1
    return new Uint8Array(size).fill(sequence)
  }
}

describe('组件开发会话', () => {
  /** 验证 descriptor 不包含 token、本机路径或源码，并为每个 surface 生成会话路径。 */
  it('创建分离 token 的有效公开描述', () => {
    const session = createWidgetDevSession({
      project: createProject(),
      randomBytes: createDeterministicRandomSource(),
    })
    const serialized = JSON.stringify(session.descriptor)

    expect(session.token).not.toBe(session.descriptor.sessionId)
    expect(serialized).not.toContain(session.token)
    expect(serialized).not.toContain('not-exposed')
    expect(session.descriptor.component.surfacePaths).toEqual({
      settings: `${session.publicPathPrefix}/surfaces/settings`,
      widget: `${session.publicPathPrefix}/surfaces/widget`,
    })
    expect(session.descriptor.initialInstance.instanceId).not.toBe(session.descriptor.sessionId)
  })

  /** 验证随机源不足 128 bit 时创建立即失败。 */
  it('拒绝熵不足的随机源', () => {
    expect(() => createWidgetDevSession({
      project: createProject(),
      randomBytes: () => new Uint8Array(15),
    })).toThrowError(expect.objectContaining({ code: 'BUILD_FAILED' }))
  })

  /** 验证浏览器 URL 只在 fragment 中携带 token，公开 URL 可以安全输出。 */
  it('只通过 fragment 传递 token', () => {
    const session = createWidgetDevSession({
      project: createProject(),
      randomBytes: createDeterministicRandomSource(),
    })
    const url = createWidgetDevHostUrl('http://127.0.0.1:5174', session)

    expect(url.pathname).toBe('/__patab_dev__/')
    expect(url.search).toBe('')
    expect(url.hash).toContain(session.token)
    expect(`${url.origin}${url.pathname}`).not.toContain(session.token)
  })

  /** 验证只有精确 Bearer token 认证成功，错误长度和格式均安全失败。 */
  it('以定长比较认证 Bearer token', () => {
    const session = createWidgetDevSession({
      project: createProject(),
      randomBytes: createDeterministicRandomSource(),
    })

    expect(authenticateWidgetDevSession(`Bearer ${session.token}`, session)).toBe(true)
    expect(authenticateWidgetDevSession(`Bearer ${session.token}x`, session)).toBe(false)
    expect(authenticateWidgetDevSession(session.token, session)).toBe(false)
    expect(authenticateWidgetDevSession(undefined, session)).toBe(false)
  })
})
