import {
  createBrowserStaticImageDecoder,
  createBrowserUnzipWorker,
  type BrowserUnzipWorkerHandle,
  type BrowserUnzipWorkerResponse,
} from '@patab/widget-package/browser'

import {
  CustomComponentPackageReviewError,
  reviewCustomComponentPackage,
} from './packageReview'

/** 浏览器导入过程中可取消的单个异步任务。 */
export interface CustomComponentImportTask {
  readonly result: Promise<Awaited<ReturnType<typeof reviewCustomComponentPackage>>>
  cancel(): void
}

/** 导入器向 Worker 发送请求的唯一标识，避免多个文件选择事件交叉处理结果。 */
function createImportRequestId(): string {
  return `custom-component-${crypto.randomUUID()}`
}

/** 将 Worker 的安全错误响应转为 UI 可消费的审查错误，不传播其实现异常或文件正文。 */
function toWorkerError(response: Extract<BrowserUnzipWorkerResponse, { readonly type: 'unzip-error' }>): CustomComponentPackageReviewError {
  return new CustomComponentPackageReviewError(response.error.code as 'MANIFEST_INVALID', '组件压缩包解析失败。', response.error.path)
}

/**
 * 创建一个浏览器端 ZIP 导入任务：文件内容只进入流式 Worker，审查阶段只读取静态 Manifest 与已验证素材。
 */
export function startCustomComponentImport(
  file: File,
  workerFactory: () => BrowserUnzipWorkerHandle = createBrowserUnzipWorker,
): CustomComponentImportTask {
  const worker = workerFactory()
  const requestId = createImportRequestId()
  let settled = false
  let rejectResult: (reason?: unknown) => void = () => undefined

  /** 终止 Worker 并统一拒绝未完成任务，确保取消后不会产生审查结果或安装副作用。 */
  function cancel(): void {
    if (settled) return
    settled = true
    worker.terminate()
    rejectResult(new CustomComponentPackageReviewError('MANIFEST_INVALID', '组件导入已取消。'))
  }

  const result = new Promise<Awaited<ReturnType<typeof reviewCustomComponentPackage>>>((resolve, reject) => {
    rejectResult = reject
    worker.addEventListener('message', (event) => {
      const response = event.data
      if (settled || response.requestId !== requestId) return
      settled = true
      worker.terminate()
      if (response.type === 'unzip-error') {
        reject(toWorkerError(response))
        return
      }
      void reviewCustomComponentPackage(response.result.files, createBrowserStaticImageDecoder())
        .then(resolve)
        .catch(reject)
    })

    void file.arrayBuffer()
      .then((archive) => {
        if (settled) return
        worker.postMessage({ type: 'unzip', requestId, archive }, [archive])
      })
      .catch(() => {
        if (settled) return
        settled = true
        worker.terminate()
        reject(new CustomComponentPackageReviewError('MANIFEST_INVALID', '组件压缩包无法读取。'))
      })
  })

  return { result, cancel }
}
