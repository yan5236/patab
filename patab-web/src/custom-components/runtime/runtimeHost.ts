import { Mv3SandboxAdapter, WebSandboxAdapter } from './sandboxAdapter'
import { SandboxRuntime } from './sandboxRuntime'
import { createRuntimeHealthReporter } from '@/custom-components/safety/runtimeHealthReporter'
import { resolveAssetPath } from '@/utils/assetPath'
import { detectRuntimeEnvironment } from '@/utils/runtimeEnvironment'

/** 页面共享的唯一 Runtime；widget 与 modal 必须通过它共享同实例 lifecycle、storage 与 channel。 */
let runtime: SandboxRuntime | undefined

/** Runtime 自动停用事件的最小宿主通知，组件只能据此更新轻量 launcher 引用。 */
export interface RuntimeAutoDisabledEvent {
  readonly componentId: string
  readonly instanceId: string
  readonly reason: 'handshake-failed' | 'handshake-timeout' | 'protocol-flood' | 'startup-incomplete'
}

const autoDisabledListeners = new Set<(event: RuntimeAutoDisabledEvent) => void>()

/** 订阅当前页面 Runtime 的自动停用结果；注销后不保留图块组件的闭包引用。 */
export function subscribeRuntimeAutoDisabled(listener: (event: RuntimeAutoDisabledEvent) => void): () => void {
  autoDisabledListeners.add(listener)
  return () => autoDisabledListeners.delete(listener)
}

/** 只向宿主图块广播稳定自动停用信号，监听器异常不能影响 Runtime 已完成的安全清理。 */
function notifyRuntimeAutoDisabled(event: RuntimeAutoDisabledEvent): void {
  for (const listener of autoDisabledListeners) {
    try {
      listener(event)
    } catch {
      // UI 观察失败不能反向破坏 sandbox 安全恢复。
    }
  }
}

/**
 * 返回当前页面的唯一自定义组件 Runtime。
 *
 * 环境差异只在适配器构造处选择，后续 Host、Broker 和 Capability 都共享这一实例，
 * 因而不会为 modal 再创建第二套会话或主题同步系统。
 */
export function getCustomComponentRuntime(): SandboxRuntime {
  if (runtime) return runtime
  runtime = detectRuntimeEnvironment() === 'extension'
    ? new SandboxRuntime({
      adapter: new Mv3SandboxAdapter({
        document,
        mv3SandboxPageUrl: resolveAssetPath('/custom-component-sandbox.html'),
      }),
      health: createRuntimeHealthReporter(),
      onInstanceAutoDisabled: notifyRuntimeAutoDisabled,
    })
    : new SandboxRuntime({
      adapter: new WebSandboxAdapter({ document }),
      health: createRuntimeHealthReporter(),
      onInstanceAutoDisabled: notifyRuntimeAutoDisabled,
    })
  return runtime
}

/** 仅供应用卸载和测试回收全部 session，正常图块/弹窗关闭仍应销毁各自的句柄。 */
export function destroyCustomComponentRuntime(): void {
  runtime?.destroyAll()
  runtime = undefined
}
