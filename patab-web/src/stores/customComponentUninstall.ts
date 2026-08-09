import { ref } from 'vue'

import {
  getComponentUninstallPreview,
  uninstallComponentPackage,
  type ComponentUninstallPreview,
} from '@/custom-components/repository/componentUninstallRepository'
import { getCustomComponentRuntime } from '@/custom-components/runtime/runtimeHost'

/** 二次确认期间保留的只读卸载预览；取消时只丢弃该内存状态。 */
export type CustomComponentUninstallState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'awaiting-confirmation'
      readonly componentId: string
      readonly instanceCount: number
      readonly preview: ComponentUninstallPreview
    }

/** Store 传入的目录刷新依赖，避免卸载状态模块反向依赖完整导入/更新流程。 */
export interface CustomComponentUninstallActionsOptions {
  readonly refreshInstalledComponents: () => Promise<void>
}

/**
 * 创建组件卸载确认与提交动作。
 *
 * IndexedDB 删除由 Repository 的单事务保证原子性；仅在该事务提交后，才销毁存活 iframe 并调用
 * launcher 的无失败引用移除动作。因此确认写入失败时，包、私有数据与全部主屏引用均保持不变。
 */
export function createCustomComponentUninstallActions(options: CustomComponentUninstallActionsOptions) {
  const uninstallState = ref<CustomComponentUninstallState>({ status: 'idle' })

  /** 读取只读删除规模并进入二次确认，不执行任何 Repository 或 launcher 写操作。 */
  async function requestUninstall(componentId: string, instanceCount: number = 0): Promise<boolean> {
    if (!componentId || !Number.isInteger(instanceCount) || instanceCount < 0) return false
    try {
      const preview = await getComponentUninstallPreview(componentId)
      uninstallState.value = {
        status: 'awaiting-confirmation',
        componentId,
        instanceCount,
        preview,
      }
      return true
    } catch {
      return false
    }
  }

  /** 取消确认只清空内存预览，绝不调用删除或 Runtime 销毁路径。 */
  function cancelUninstall(): void {
    uninstallState.value = { status: 'idle' }
  }

  /**
   * 在确认状态匹配时提交完全删除。
   *
   * removeReferences 必须是 launcher 的同步、无失败轻量动作；Repository 抛错时它不会被调用，
   * 从而保证取消与失败路径保留原有主屏引用。成功后刷新目录并结束确认界面。
   */
  async function confirmUninstall(removeReferences: (componentId: string) => void): Promise<boolean> {
    const pending = uninstallState.value
    if (pending.status !== 'awaiting-confirmation') return false
    await uninstallComponentPackage(pending.componentId)
    getCustomComponentRuntime().destroyComponentSessions(pending.componentId)
    removeReferences(pending.componentId)
    await options.refreshInstalledComponents()
    uninstallState.value = { status: 'idle' }
    return true
  }

  return {
    uninstallState,
    requestUninstall,
    cancelUninstall,
    confirmUninstall,
  }
}
