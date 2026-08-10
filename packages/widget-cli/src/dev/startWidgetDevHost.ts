import { createServer, type ViteDevServer } from 'vite'

import { loadWidgetProject, readDeclaredWidgetAssets, readWidgetSurfaceEntryModulePaths } from '../project.js'
import { WidgetCliError } from '../report.js'
import { openWidgetDevHostAssets, type WidgetDevHostAssets } from './devHostAssets.js'
import { createWidgetDevServerPlugin, WIDGET_DEV_HOST_PATH } from './devServerPlugin.js'
import { createWidgetDevHmrPlugin } from './devHmrPlugin.js'
import { createWidgetDevHostUrl, createWidgetDevSession } from './devSession.js'

/** widget CLI 开发服务保留的默认端口；未显式指定时允许 Vite 自动顺延。 */
export const WIDGET_DEV_HOST_DEFAULT_PORT = 5174

/** 开发宿主启动选项；资产注入只供打包后集成测试使用。 */
export interface StartWidgetDevHostOptions {
  readonly root?: string
  readonly host?: string
  readonly port?: number
  readonly open?: boolean
  readonly assets?: WidgetDevHostAssets
}

/** 开发宿主对 CLI 生命周期暴露的最小幂等句柄。 */
export interface WidgetDevHostHandle {
  readonly publicUrl: string
  close(): Promise<void>
}

/** 把显式 host 限制为三个 loopback 表达，拒绝通配和局域网监听。 */
export function normalizeWidgetDevHost(host: string | undefined): '127.0.0.1' | '::1' | 'localhost' {
  const normalized = host?.trim().toLowerCase() || '127.0.0.1'
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return normalized
  throw new WidgetCliError('CHECK_FAILED', '组件开发服务只允许监听本机 loopback。')
}

/** 从 Vite 实际监听结果取得不含 token 的本地 origin。 */
function getResolvedLocalOrigin(server: ViteDevServer): string {
  const localUrl = server.resolvedUrls?.local[0]
  if (!localUrl) throw new WidgetCliError('BUILD_FAILED', '组件开发服务没有可用的本地地址。')
  return new URL(localUrl).origin
}

/**
 * 启动真实 PaTab 开发宿主。
 *
 * 编排层只按顺序组装项目、发布资产、随机会话与 Vite server；任一步失败都会关闭已创建
 * server，并统一映射为不含路径、token 或 Vite 原始异常的 CLI 错误。
 */
export async function startWidgetDevHost(options: StartWidgetDevHostOptions = {}): Promise<WidgetDevHostHandle> {
  const host = normalizeWidgetDevHost(options.host)
  const project = await loadWidgetProject(options.root)
  const assets = options.assets ?? await openWidgetDevHostAssets()
  const componentAssets = await readDeclaredWidgetAssets(project)
  const surfaceEntryModules = await readWidgetSurfaceEntryModulePaths(project)
  const session = createWidgetDevSession({ project, hostVersion: assets.hostVersion })
  const browserPath = `${WIDGET_DEV_HOST_PATH}${createWidgetDevHostUrl('http://127.0.0.1', session).hash}`
  let server: ViteDevServer | undefined
  try {
    server = await createServer({
      root: project.root,
      appType: 'custom',
      base: `${session.publicPathPrefix}/vite/`,
      plugins: [
        createWidgetDevHmrPlugin(surfaceEntryModules),
        createWidgetDevServerPlugin({ assets, componentAssets, project, session }),
      ],
      server: {
        host,
        port: options.port ?? WIDGET_DEV_HOST_DEFAULT_PORT,
        strictPort: options.port !== undefined,
        open: options.open === false ? false : browserPath,
        cors: { origin: 'null' },
        hmr: { path: `${session.publicPathPrefix}/hmr` },
      },
    })
    await server.listen()
    const origin = getResolvedLocalOrigin(server)
    let closed = false
    return Object.freeze({
      publicUrl: new URL(WIDGET_DEV_HOST_PATH, origin).toString(),
      async close(): Promise<void> {
        if (closed) return
        closed = true
        await server?.close()
      },
    }) as WidgetDevHostHandle
  } catch {
    await server?.close().catch(() => undefined)
    throw new WidgetCliError('BUILD_FAILED', '无法启动 PaTab 组件开发宿主。')
  }
}
