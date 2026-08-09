import { describe, expect, it } from 'vitest'
import type { BrowserUnzipWorkerHandle, BrowserUnzipWorkerRequest, BrowserUnzipWorkerResponse } from '@patab/widget-package/browser'

import { startCustomComponentImport } from './browserPackageImport'

/** 创建不会自行返回消息的 Worker 替身，用于验证取消路径会终止实际解析任务。 */
function createPendingWorker(): BrowserUnzipWorkerHandle & { readonly terminated: boolean } {
  let terminated = false
  return {
    get terminated() {
      return terminated
    },
    postMessage(_message: BrowserUnzipWorkerRequest, _transfer?: readonly ArrayBuffer[]): void {},
    addEventListener(_type: 'message', _listener: (event: { readonly data: BrowserUnzipWorkerResponse }) => void): void {},
    terminate(): void {
      terminated = true
    },
  }
}

/** 覆盖文件选择后的可取消 Worker 路径，确保取消不会留下可继续解析或安装的后台任务。 */
describe('浏览器组件包导入任务', () => {
  /** 验证取消会立即终止 Worker 并拒绝结果，调用方因而可以丢弃临时审查状态。 */
  it('取消时终止流式解析 Worker', async () => {
    const worker = createPendingWorker()
    const task = startCustomComponentImport(new File(['archive'], 'component.patab.zip'), () => worker)

    task.cancel()

    await expect(task.result).rejects.toMatchObject({ code: 'MANIFEST_INVALID' })
    expect(worker.terminated).toBe(true)
  })
})
