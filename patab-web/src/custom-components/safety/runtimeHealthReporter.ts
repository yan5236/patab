import {
  clearHandshakeFailureAfterHealthyStart,
  recordRuntimeFailure,
  type RuntimeFailureReason,
  type RuntimeHealthFailureResult,
} from '@/custom-components/repository/runtimeHealthRepository'

/** SandboxRuntime 需要的最小健康边界，保持 Runtime 不直接理解 IndexedDB 表结构。 */
export interface RuntimeHealthReporter {
  recordFailure(input: {
    readonly componentId: string
    readonly instanceId: string
    readonly reason: RuntimeFailureReason
  }): Promise<RuntimeHealthFailureResult>
  recordHealthy(input: {
    readonly componentId: string
    readonly instanceId: string
  }): Promise<void>
}

/** 创建生产健康报告器；只持久化失败类别与计数，绝不携带组件内容或私有数据。 */
export function createRuntimeHealthReporter(): RuntimeHealthReporter {
  return {
    recordFailure: ({ componentId, instanceId, reason }) => recordRuntimeFailure(componentId, instanceId, reason),
    recordHealthy: ({ componentId, instanceId }) => clearHandshakeFailureAfterHealthyStart(componentId, instanceId),
  }
}
