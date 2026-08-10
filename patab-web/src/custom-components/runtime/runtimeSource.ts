import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

import {
  getActiveComponentVersion,
  getInstalledComponent,
  readActiveComponentFile,
} from '@/custom-components/repository/componentPackageRepository'

import type { PrepareSandboxSurfaceHtmlOptions } from './surfaceHtml'

/** Runtime 启动一个 surface 所需的最小组件版本快照。 */
export interface WidgetRuntimeComponent {
  readonly componentId: string
  readonly version: string
  readonly manifest: PatabWidgetManifestV1
}

/**
 * 为 Runtime 提供已选组件版本与声明 surface 文本的只读端口。
 *
 * Source 不负责权限、存储、Broker、iframe 或健康状态，使生产 Repository 与开发会话
 * 可以在不复制 Runtime 的前提下替换包来源。
 */
export interface WidgetRuntimeSource {
  loadComponent(componentId: string): Promise<WidgetRuntimeComponent | undefined>
  loadSurface(component: WidgetRuntimeComponent, surface: string): Promise<string | undefined>
}

/** Runtime 对 HTML 的准备端口；生产与开发策略只能在工厂组装时显式选择。 */
export type WidgetSurfacePreparer = (
  surfaceHtml: string,
  options?: PrepareSandboxSurfaceHtmlOptions,
) => string

/**
 * 创建读取正式组件 Repository 的生产 Source。
 *
 * 活动版本、staged 状态和文件类型检查保持在该适配器中，Runtime 只消费已收口的快照。
 */
export function createRepositoryWidgetRuntimeSource(): WidgetRuntimeSource {
  return {
    async loadComponent(componentId) {
      const [component, version] = await Promise.all([
        getInstalledComponent(componentId),
        getActiveComponentVersion(componentId),
      ])
      if (!component
        || !version
        || component.activeVersion !== version.version
        || !version.isActive
        || version.stagedUpdateId) {
        return undefined
      }
      return {
        componentId,
        version: version.version,
        manifest: version.manifest,
      }
    },

    async loadSurface(component, surface) {
      const declaration = component.manifest.surfaces[surface]
      if (!declaration) return undefined
      const file = await readActiveComponentFile(component.componentId, declaration.entry)
      return file && typeof file.content === 'string' ? file.content : undefined
    },
  }
}
