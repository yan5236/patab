/**
 * 表示当前 SDK 所支持的 PaTab Widget API 主版本；具体 RPC DTO 由后续公共契约任务定义。
 */
export type WidgetSdkApiVersion = 1

/**
 * 描述 SDK 的公开发布元数据，避免第三方组件通过宿主 Store、Router 或 UI 读取版本信息。
 */
export interface WidgetSdkMetadata {
  readonly packageName: '@patab/widget-sdk'
  readonly sdkVersion: string
  readonly supportedApiMajor: WidgetSdkApiVersion
}
