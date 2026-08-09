/** 第三方组件请求的宿主 toast 数据；组件 ID 仅用于宿主来源标签，不作为可执行内容。 */
export interface WidgetHostToastRequest {
  readonly componentId: string
  readonly message: string
}

/** 第三方组件请求的宿主确认数据；external 类型由宿主固定展示目标 HTTPS origin。 */
export type WidgetHostConfirmRequest =
  | {
      readonly kind: 'component'
      readonly componentId: string
      readonly title?: string
      readonly message: string
      readonly confirmLabel?: string
      readonly cancelLabel?: string
    }
  | {
      readonly kind: 'external'
      readonly componentId: string
      readonly targetOrigin: string
    }

/** 宿主反馈渲染器的唯一公共接口，Capability 不得直接调用浏览器原生 alert/confirm。 */
export interface WidgetHostFeedback {
  readonly toast: (request: WidgetHostToastRequest) => void
  readonly confirm: (request: WidgetHostConfirmRequest) => Promise<boolean>
}

/** 当前 App 根层注册的唯一反馈渲染器；未挂载时不保留第三方请求或 DOM 引用。 */
let currentHostFeedback: WidgetHostFeedback | undefined

/**
 * 注册 App 根层的宿主反馈渲染器。
 *
 * 返回的注销函数使用身份比较，避免旧组件卸载时误清除后来重新挂载的渲染器。
 */
export function registerWidgetHostFeedback(feedback: WidgetHostFeedback): () => void {
  currentHostFeedback = feedback
  return () => {
    if (currentHostFeedback === feedback) currentHostFeedback = undefined
  }
}

/** 读取当前宿主反馈渲染器；没有 App 根层时调用方必须安全拒绝而不能降级为原生弹窗。 */
export function getWidgetHostFeedback(): WidgetHostFeedback | undefined {
  return currentHostFeedback
}
