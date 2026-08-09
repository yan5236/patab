import { onBeforeUnmount } from 'vue'
import { ZIP_ARCHIVE_MAX_BYTES } from '@patab/widget-package'

import {
  startCustomComponentImport,
  type CustomComponentImportTask,
} from '@/custom-components/import/browserPackageImport'
import { useCustomComponentStore } from '@/stores/customComponents'

/** 允许导入的本地文件后缀；扩展名校验是文件选择器的第二道边界。 */
const CUSTOM_COMPONENT_PACKAGE_NAME = /\.patab\.zip$|\.zip$/i

/** 判断用户选择的文件是否是 PaTab 本地组件归档，拒绝仅靠 MIME 伪装的其他文件。 */
export function isCustomComponentPackageFile(file: File): boolean {
  return CUSTOM_COMPONENT_PACKAGE_NAME.test(file.name)
}

/**
 * 提供组件商店的文件选择、流式解析和取消编排；所有可观察状态统一交由自定义组件 Store 保存。
 */
export function useCustomComponentImport() {
  const customComponents = useCustomComponentStore()
  let activeTask: CustomComponentImportTask | undefined

  /**
   * 选择一个本地 ZIP 后启动静态审查；取消文件选择时不调用本函数，因此商店状态不会被改写。
   */
  async function importFile(file: File | undefined): Promise<boolean> {
    if (!file) return false
    if (!isCustomComponentPackageFile(file)) {
      customComponents.failPackageParsing('FILE_TYPE_INVALID')
      return false
    }
    if (file.size > ZIP_ARCHIVE_MAX_BYTES) {
      customComponents.failPackageParsing('ZIP_ARCHIVE_TOO_LARGE')
      return false
    }

    activeTask?.cancel()
    customComponents.startPackageParsing(file.name)
    const task = startCustomComponentImport(file)
    activeTask = task
    try {
      const review = await task.result
      if (activeTask !== task) return false
      customComponents.completePackageReview(review)
      return true
    } catch (error) {
      if (activeTask !== task) return false
      const safeError = error as { readonly code?: unknown; readonly path?: unknown }
      customComponents.failPackageParsing(
        typeof safeError.code === 'string' ? safeError.code : 'IMPORT_FAILED',
        typeof safeError.path === 'string' ? safeError.path : undefined,
      )
      return false
    } finally {
      if (activeTask === task) activeTask = undefined
    }
  }

  /** 终止当前 Worker、丢弃临时审查包并恢复空闲状态；已安装包和 launcher 引用不会受影响。 */
  function cancelImport(): void {
    activeTask?.cancel()
    activeTask = undefined
    customComponents.cancelPackageParsing()
  }

  onBeforeUnmount(cancelImport)

  return { importFile, cancelImport }
}
