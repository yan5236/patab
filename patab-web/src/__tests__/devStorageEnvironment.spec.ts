import { describe, expect, it } from 'vitest'

import { createCustomComponentDevDatabaseName } from '@/custom-components/repository/customComponentDatabase'
import {
  createCustomComponentSafetyDevStorageKey,
  createLauncherDevStorageKey,
} from '@/stores/launcherStorageEnvironment'

describe('开发宿主存储命名空间', () => {
  /** 验证同一会话派生稳定但与正式键和数据库名不同的开发命名空间。 */
  it('为合法会话创建隔离 launcher 与组件仓库名称', () => {
    const sessionId = 'session_1234567890'

    expect(createLauncherDevStorageKey(sessionId)).toBe(`patab-widget-dev:${sessionId}:launcher:v1`)
    expect(createCustomComponentSafetyDevStorageKey(sessionId)).toBe(`patab-widget-dev:${sessionId}:custom-components:safety:v1`)
    expect(createCustomComponentDevDatabaseName(sessionId)).toBe(`patab-widget-dev-components:${sessionId}`)
    expect(createLauncherDevStorageKey(sessionId)).not.toBe('patab:v1')
    expect(createCustomComponentDevDatabaseName(sessionId)).not.toBe('patab-custom-components')
  })

  /** 验证路径、控制字符和过短 ID 不能进入浏览器存储名称。 */
  it.each(['short', '../session_1234567890', 'session\\1234567890', 'session\n1234567890'])(
    '拒绝不安全会话 ID：%s',
    (sessionId) => {
      expect(() => createLauncherDevStorageKey(sessionId)).toThrow()
      expect(() => createCustomComponentSafetyDevStorageKey(sessionId)).toThrow()
      expect(() => createCustomComponentDevDatabaseName(sessionId)).toThrow()
    },
  )
})
