/** 固定沙箱准备消息名；宿主只会发送给已创建的唯一 iframe。 */
export const SANDBOX_PREPARE_MESSAGE = 'patab:sandbox-prepare' as const

/** 固定 MV3 宿主向 Manifest sandbox page 挂载最终 HTML 的消息名。 */
export const SANDBOX_MOUNT_MESSAGE = 'patab:sandbox-mount' as const

/** 固定沙箱端口连接消息名；唯一 MessagePort 只在可信准备完成后转移。 */
export const SANDBOX_CONNECT_MESSAGE = 'patab:sandbox-connect' as const

/** 子 surface 向父页面声明可以接受端口的消息名。 */
export const SANDBOX_READY_MESSAGE = 'patab:sandbox-ready' as const

/** 子 surface 在端口收到后返回的最小确认消息名。 */
export const SANDBOX_CONNECTED_MESSAGE = 'patab:sandbox-connected' as const

/** 宿主完成 Broker 绑定后通过端口发送的激活消息，避免组件首个 RPC 抢在监听器之前。 */
export const SANDBOX_ACTIVATE_MESSAGE = 'patab:sandbox-activate' as const


/** SandboxAdapter 允许返回给 Runtime 的内部失败分类，不包含浏览器原始异常。 */
export type SandboxAdapterFailureCode =
  | 'adapter-unavailable'
  | 'frame-load-failed'
  | 'handshake-invalid'
  | 'handshake-timeout'

/**
 * 表示适配层的受控失败。
 *
 * 错误只保留固定分类，防止 HTML、扩展 URL、令牌、DOMException 或堆栈跨越 Runtime 边界。
 */
export class SandboxAdapterError extends Error {
  /** 创建可由 Runtime 映射为公开健康状态的适配层错误。 */
  constructor(readonly code: SandboxAdapterFailureCode) {
    super('自定义组件沙箱启动失败。')
    this.name = 'SandboxAdapterError'
  }
}
