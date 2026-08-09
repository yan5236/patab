import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RUNTIME_HEALTH_FAILURE_WINDOW_MS,
  clearHandshakeFailureAfterHealthyStart,
  clearRuntimeHealth,
  getRuntimeHealth,
  recordRuntimeFailure,
} from './runtimeHealthRepository'

/** 每个用例使用独立 IndexedDB，避免连续失败计数跨测试污染。 */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

/** 覆盖 24 小时连续计数、自动停用阈值与用户手动恢复清零策略。 */
describe('组件运行健康 Repository', () => {
  /** 验证第三次握手失败持久化稳定原因，并在用户重新启用前保持停用状态。 */
  it('24 小时内第三次失败自动停用并保存原因', async () => {
    await expect(recordRuntimeFailure('com.example.health', 'instance-1', 'handshake-timeout', 100)).resolves.toMatchObject({
      autoDisabled: false,
      record: { consecutiveFailures: 1 },
    })
    await recordRuntimeFailure('com.example.health', 'instance-1', 'handshake-failed', 200)
    await expect(recordRuntimeFailure('com.example.health', 'instance-1', 'protocol-flood', 300)).resolves.toMatchObject({
      autoDisabled: true,
      record: {
        consecutiveFailures: 3,
        disabledReason: 'protocol-flood',
      },
    })
    await expect(getRuntimeHealth('com.example.health', 'instance-1')).resolves.toMatchObject({
      lastErrorCode: 'protocol-flood',
      disabledReason: 'protocol-flood',
    })
  })

  /** 验证窗口外失败重新从一次开始，显式重新启用也会删除旧失败摘要。 */
  it('窗口过期或手动恢复后清除连续失败累计', async () => {
    await recordRuntimeFailure('com.example.health', 'instance-2', 'handshake-failed', 100)
    await recordRuntimeFailure('com.example.health', 'instance-2', 'handshake-failed', 200)
    await expect(recordRuntimeFailure(
      'com.example.health',
      'instance-2',
      'handshake-timeout',
      200 + RUNTIME_HEALTH_FAILURE_WINDOW_MS + 1,
    )).resolves.toMatchObject({ autoDisabled: false, record: { consecutiveFailures: 1 } })

    await clearRuntimeHealth('com.example.health', 'instance-2')
    await expect(getRuntimeHealth('com.example.health', 'instance-2')).resolves.toBeUndefined()
  })

  /** 验证成功握手只恢复未执行的握手失败，不会掩盖已经发生的协议洪泛。 */
  it('成功握手保留协议洪泛的连续失败累计', async () => {
    await recordRuntimeFailure('com.example.health', 'instance-3', 'handshake-timeout', 100)
    await clearHandshakeFailureAfterHealthyStart('com.example.health', 'instance-3')
    await expect(getRuntimeHealth('com.example.health', 'instance-3')).resolves.toBeUndefined()

    await recordRuntimeFailure('com.example.health', 'instance-3', 'protocol-flood', 200)
    await clearHandshakeFailureAfterHealthyStart('com.example.health', 'instance-3')
    await expect(getRuntimeHealth('com.example.health', 'instance-3')).resolves.toMatchObject({
      consecutiveFailures: 1,
      lastErrorCode: 'protocol-flood',
    })
  })
})
