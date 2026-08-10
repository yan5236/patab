import type { PatabWidgetManifestV1, WidgetPermission } from '@patab/widget-sdk'
import type { WidgetDevSessionDescriptor } from '@patab/widget-sdk/dev-host'

import {
  getInstalledComponent,
  installComponentPackage,
  type InstallComponentPackageInput,
} from '@/custom-components/repository/componentPackageRepository'

/** 开发组件包准备失败的稳定错误，禁止携带 token、源码、URL 或底层网络异常。 */
export class WidgetDevPackageError extends Error {
  /** 创建仅供开发宿主错误页识别的固定错误。 */
  constructor() {
    super('开发组件无法载入。')
    this.name = 'WidgetDevPackageError'
  }
}

/** 收集 Manifest 声明的全部静态素材路径并去重，避免读取组件目录中的未声明文件。 */
function collectDeclaredAssetPaths(manifest: PatabWidgetManifestV1): readonly string[] {
  return [...new Set([
    manifest.assets.icon,
    ...(manifest.assets.screenshots ?? []),
    ...(manifest.variants ?? []).map((variant) => variant.icon),
  ])].sort()
}

/** 收集开发模式默认授予的全部已声明权限；授权范围仍不能超出 Manifest。 */
function collectDeclaredPermissions(manifest: PatabWidgetManifestV1): readonly WidgetPermission[] {
  return [...new Set([
    ...(manifest.permissions?.required ?? []),
    ...(manifest.permissions?.optional ?? []),
  ])]
}

/** 将组件素材路径逐段编码为当前会话下的受保护资源 URL。 */
function createAssetUrl(sessionId: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `/__patab_dev__/sessions/${sessionId}/assets/${encodedPath}`
}

/** 使用仅驻留内存的 Bearer token 获取一个开发资源，不把响应正文带入失败信息。 */
async function fetchProtectedResource(url: string, token: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw new WidgetDevPackageError()
  }
  if (!response.ok) throw new WidgetDevPackageError()
  return response
}

/** 从 CLI 会话读取所有声明 surface 与静态素材，构造隔离仓库的安装输入。 */
async function createInstallInput(
  descriptor: WidgetDevSessionDescriptor,
  token: string,
): Promise<InstallComponentPackageInput> {
  const surfaceFiles = await Promise.all(
    Object.entries(descriptor.component.surfacePaths).map(async ([surface, url]) => {
      const response = await fetchProtectedResource(url, token)
      const declaration = descriptor.component.manifest.surfaces[surface]
      if (!declaration) throw new WidgetDevPackageError()
      return { path: declaration.entry, content: await response.text() }
    }),
  )
  const assetFiles = await Promise.all(
    collectDeclaredAssetPaths(descriptor.component.manifest).map(async (path) => ({
      path,
      content: await (await fetchProtectedResource(createAssetUrl(descriptor.sessionId, path), token)).blob(),
    })),
  )
  return {
    manifest: descriptor.component.manifest,
    integrity: { schemaVersion: 1, algorithm: 'sha256', files: [] },
    grantedPermissions: collectDeclaredPermissions(descriptor.component.manifest),
    grantedNetworkOrigins: (descriptor.component.manifest.network ?? []).map((item) => item.origin),
    files: [...surfaceFiles, ...assetFiles],
  }
}

/**
 * 将当前开发组件自动安装到会话隔离仓库。
 *
 * 同一页面刷新时复用已有安装；CLI 每次重启会生成新 sessionId，因此不会把旧构建、权限
 * 或实例数据带入下一次开发会话，更不会访问正式 PaTab 的组件数据库。
 */
export async function ensureWidgetDevPackageInstalled(
  descriptor: WidgetDevSessionDescriptor,
  token: string,
): Promise<void> {
  const existing = await getInstalledComponent(descriptor.component.manifest.id)
  if (existing?.activeVersion === descriptor.component.manifest.version) return
  if (existing) throw new WidgetDevPackageError()
  try {
    await installComponentPackage(await createInstallInput(descriptor, token))
  } catch (error) {
    if (error instanceof WidgetDevPackageError) throw error
    throw new WidgetDevPackageError()
  }
}
