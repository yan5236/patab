/**
 * 表示 Manifest 中有默认回退文本、且可选择性提供中文和英文翻译的公开元数据。
 */
export interface LocalizedText {
  readonly default: string
  readonly 'zh-CN'?: string
  readonly 'en-US'?: string
}

/**
 * 表示 v1 允许的图块尺寸，并与 PaTab 主屏网格使用的宽高字段保持同构而不依赖宿主类型。
 */
export type WidgetTileSize =
  | { readonly w: 1; readonly h: 1 }
  | { readonly w: 2; readonly h: 2 }
  | { readonly w: 3; readonly h: 2 }
  | { readonly w: 4; readonly h: 2 }

/**
 * 表示 ZIP 内供宿主静态展示的素材路径；具体路径规范化与文件存在性由归档校验层负责。
 */
export type WidgetAssetPath = `assets/${string}`

/**
 * 表示 ZIP 内已构建的独立 surface HTML 路径，禁止将宿主源码或任意外部地址作为入口。
 */
export type SurfaceEntryPath = `surfaces/${string}.html`

/**
 * 表示由宿主 BaseModal 解释的固定尺寸档位，第三方组件不能在 Manifest 中声明任意弹窗尺寸。
 */
export type WidgetModalSize = 'small' | 'medium' | 'large'

/**
 * 描述单个独立 surface 的静态入口和标题；运行时沙箱、握手及访问控制不属于 Manifest 类型职责。
 */
export interface WidgetSurfaceDeclaration {
  readonly entry: SurfaceEntryPath
  readonly title: LocalizedText
  readonly modalSize?: WidgetModalSize
}

/**
 * 描述 Manifest 的 surface 集合，并在类型层保证 widget surface 始终存在。
 */
export type WidgetSurfaceDeclarations = Record<string, WidgetSurfaceDeclaration> & {
  readonly widget: WidgetSurfaceDeclaration
}

/**
 * 描述需要用户逐项确认的精确 HTTPS origin；实际请求限制与凭据隔离由受控网络能力实现。
 */
export interface WidgetNetworkDeclaration {
  readonly origin: `https://${string}`
  readonly required: boolean
  readonly reason: LocalizedText
}

/**
 * 描述供宿主安装前静态展示的图标与截图路径，运行时 surface 不得依赖这些资源承载可执行代码。
 */
export interface WidgetAssets {
  readonly icon: WidgetAssetPath
  readonly screenshots?: readonly WidgetAssetPath[]
}

/**
 * 描述 variant 的静态元数据，使宿主可在执行第三方代码前渲染类型选择器。
 */
export interface WidgetVariantDeclaration {
  readonly id: string
  readonly name: LocalizedText
  readonly description: LocalizedText
  readonly icon: WidgetAssetPath
  readonly supportedSizes: readonly WidgetTileSize[]
}

/**
 * 描述可选发布者公钥；签名格式、身份比对与信任状态由完整性和签名模块负责。
 */
export interface WidgetPublisher {
  readonly publicKey: string
}

/**
 * 定义 PaTab Widget Manifest API v1 的公开静态形状，刻意不暴露任何宿主 Store、Router、UI 或 Capability Broker 内部句柄。
 */
export interface PatabWidgetManifestV1 {
  readonly schemaVersion: 1
  readonly apiVersion: '1'
  readonly id: string
  readonly version: string
  readonly name: LocalizedText
  readonly description: LocalizedText
  readonly developer: LocalizedText
  readonly surfaces: WidgetSurfaceDeclarations
  readonly sizes: readonly WidgetTileSize[]
  readonly defaultSize: WidgetTileSize
  readonly variants?: readonly WidgetVariantDeclaration[]
  readonly defaultVariant?: string
  readonly permissions?: WidgetPermissionDeclarations
  readonly network?: readonly WidgetNetworkDeclaration[]
  readonly assets: WidgetAssets
  readonly publisher?: WidgetPublisher
}
import type { WidgetPermission, WidgetPermissionDeclarations } from './permissions.js'

export type { WidgetPermission, WidgetPermissionDeclarations } from './permissions.js'
