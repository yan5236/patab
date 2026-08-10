import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, relative, sep } from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import { getWidgetSurfaceSourcePath, type WidgetProject, type WidgetProjectFile } from '../project.js'
import type { WidgetDevHostAssets } from './devHostAssets.js'
import { authenticateWidgetDevSession, type WidgetDevSession } from './devSession.js'

/** PaTab 开发宿主在组件 Vite server 中的固定入口。 */
export const WIDGET_DEV_HOST_PATH = '/__patab_dev__/'

/** 组件静态素材的固定安全 MIME，只覆盖 Manifest v1 允许的图片格式。 */
const COMPONENT_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** 真实 PaTab 仍以根路径引用的内置 public 素材；开发 server 只代理这份固定清单。 */
const DEV_HOST_ROOT_ASSETS = new Set([
  'custom-component-sandbox-bootstrap.js',
  'custom-component-sandbox.html',
  'favicon.ico',
  'logo-128x128.ico',
  'logo-16x16.ico',
  'logo-32x32.ico',
  'logo-48x48.ico',
  'logo.png',
  'scenery1.jpg',
  'wallpaper-aurora.jpg',
  'wallpaper-paper-lake.jpg',
  'wallpaper-snow-mountain-aurora.jpg',
  'wallpaper-sunrise-grid.jpg',
])

/** 开发 server 纯路由结果，HTTP 层只按此结果读取既有安全资源。 */
export type WidgetDevRequestRoute =
  | { readonly kind: 'component-asset'; readonly path: string }
  | { readonly kind: 'host-asset'; readonly path: string }
  | { readonly kind: 'protected-not-found' }
  | { readonly kind: 'session' }
  | { readonly kind: 'surface'; readonly surface: string }
  | { readonly kind: 'unhandled' }

/** 解析 URL pathname，并把随机会话命名空间之外的请求留给 Vite。 */
export function resolveWidgetDevRequest(
  requestUrl: string | undefined,
  session: WidgetDevSession,
  project: WidgetProject,
): WidgetDevRequestRoute {
  if (!requestUrl) return { kind: 'unhandled' }
  if (/%(?:2e|2f|5c)/i.test(requestUrl)) return { kind: 'protected-not-found' }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname)
  } catch {
    return { kind: 'protected-not-found' }
  }
  if (pathname === '/__patab_dev__/session') return { kind: 'session' }
  if (pathname.startsWith(`${session.publicPathPrefix}/vite/`)
    || pathname === `${session.publicPathPrefix}/hmr`) {
    return { kind: 'unhandled' }
  }
  const surfacePrefix = `${session.publicPathPrefix}/surfaces/`
  if (pathname.startsWith(surfacePrefix)) {
    const surface = pathname.slice(surfacePrefix.length)
    return surface && !surface.includes('/') && project.manifest.surfaces[surface]
      ? { kind: 'surface', surface }
      : { kind: 'protected-not-found' }
  }
  const assetPrefix = `${session.publicPathPrefix}/assets/`
  if (pathname.startsWith(assetPrefix)) {
    const path = pathname.slice(assetPrefix.length)
    const declaredAssets = new Set<string>([
      project.manifest.assets.icon,
      ...(project.manifest.assets.screenshots ?? []),
      ...(project.manifest.variants ?? []).map((variant) => variant.icon),
    ])
    return declaredAssets.has(path) ? { kind: 'component-asset', path } : { kind: 'protected-not-found' }
  }
  if (pathname.startsWith('/__patab_dev__/sessions/')) return { kind: 'protected-not-found' }
  const rootAsset = pathname.startsWith('/') ? pathname.slice(1) : pathname
  if (DEV_HOST_ROOT_ASSETS.has(rootAsset)) return { kind: 'host-asset', path: rootAsset }
  if (pathname === WIDGET_DEV_HOST_PATH || pathname === '/__patab_dev__') {
    return { kind: 'host-asset', path: 'index.html' }
  }
  if (pathname.startsWith(WIDGET_DEV_HOST_PATH)) {
    const path = pathname.slice(WIDGET_DEV_HOST_PATH.length)
    return path ? { kind: 'host-asset', path } : { kind: 'host-asset', path: 'index.html' }
  }
  return { kind: 'unhandled' }
}

/** 设置所有开发宿主响应共用的禁缓存与 MIME 防护。 */
function setResponseSecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

/** 返回不区分资源存在性的固定保护失败，避免探测会话目录。 */
function sendProtectedFailure(response: ServerResponse, statusCode = 404): void {
  response.statusCode = statusCode
  setResponseSecurityHeaders(response)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end('{"ok":false,"code":"DEV_SESSION_UNAVAILABLE"}')
}

/** 把宿主或组件二进制写入固定 HTTP 响应，不输出路径或底层读取异常。 */
function sendBytes(response: ServerResponse, content: Uint8Array, contentType: string): void {
  response.statusCode = 200
  setResponseSecurityHeaders(response)
  response.setHeader('Content-Type', contentType)
  response.end(Buffer.from(content))
}

/** 仅允许 GET 开发资源；其它方法不会进入 Vite 文件系统处理中间件。 */
function assertGetRequest(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method === 'GET') return true
  sendProtectedFailure(response, 405)
  return false
}

/** 将声明素材按 Manifest path 建立不可变读取表，路由层不能访问其他项目文件。 */
function createComponentAssetMap(files: readonly WidgetProjectFile[]): ReadonlyMap<string, WidgetProjectFile> {
  return new Map(files.map((file) => [file.path, file]))
}

/** 把 Windows 项目路径转为 Vite transformIndexHtml 使用的根相对 URL。 */
function getSurfaceViteUrl(project: WidgetProject, surface: string): string {
  return `/${relative(project.root, getWidgetSurfaceSourcePath(project, surface)).split(sep).join('/')}`
}

/** 为 srcdoc 中的相对模块路径注入当前随机 Vite 命名空间，避免它退回宿主页面目录。 */
function injectSurfaceViteBase(html: string, project: WidgetProject, surface: string, session: WidgetDevSession): string {
  const surfaceUrl = getSurfaceViteUrl(project, surface)
  const directory = surfaceUrl.slice(0, surfaceUrl.lastIndexOf('/') + 1)
  const baseHref = `${session.publicPathPrefix}/vite${directory}`
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}<base href="${baseHref}">`)
}

/** 处理单个已识别开发路由；未知路径必须由调用方继续交给 Vite。 */
async function handleWidgetDevRequest(input: {
  readonly request: IncomingMessage
  readonly response: ServerResponse
  readonly route: Exclude<WidgetDevRequestRoute, { readonly kind: 'unhandled' }>
  readonly server: ViteDevServer
  readonly assets: WidgetDevHostAssets
  readonly componentAssets: ReadonlyMap<string, WidgetProjectFile>
  readonly project: WidgetProject
  readonly session: WidgetDevSession
}): Promise<void> {
  const { request, response, route } = input
  if (!assertGetRequest(request, response)) return
  if (route.kind === 'protected-not-found') {
    sendProtectedFailure(response)
    return
  }
  if (route.kind === 'host-asset') {
    const asset = await input.assets.read(route.path === 'index.html' ? input.assets.entry : route.path)
    if (!asset) sendProtectedFailure(response)
    else sendBytes(response, asset.content, asset.contentType)
    return
  }
  if (!authenticateWidgetDevSession(request.headers.authorization, input.session)) {
    sendProtectedFailure(response, 401)
    return
  }
  if (route.kind === 'session') {
    response.statusCode = 200
    setResponseSecurityHeaders(response)
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(input.session.descriptor))
    return
  }
  if (route.kind === 'component-asset') {
    const asset = input.componentAssets.get(route.path)
    if (!asset) sendProtectedFailure(response)
    else sendBytes(
      response,
      asset.bytes,
      COMPONENT_ASSET_CONTENT_TYPES[extname(asset.path).toLowerCase()] ?? 'application/octet-stream',
    )
    return
  }
  try {
    const sourcePath = getWidgetSurfaceSourcePath(input.project, route.surface)
    const source = await readFile(sourcePath, 'utf8')
    const transformedHtml = await input.server.transformIndexHtml(getSurfaceViteUrl(input.project, route.surface), source)
    const html = injectSurfaceViteBase(transformedHtml, input.project, route.surface, input.session)
    response.statusCode = 200
    setResponseSecurityHeaders(response)
    response.setHeader('Access-Control-Allow-Origin', 'null')
    response.setHeader('Vary', 'Origin')
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(html)
  } catch {
    sendProtectedFailure(response, 500)
  }
}

/**
 * 创建只负责真实 PaTab 宿主、会话描述与声明开发资源的 Vite 插件。
 *
 * 插件不创建 token、不打开浏览器、不遍历项目目录；不属于开发宿主的请求原样交还 Vite HMR。
 */
export function createWidgetDevServerPlugin(input: {
  readonly assets: WidgetDevHostAssets
  readonly componentAssets: readonly WidgetProjectFile[]
  readonly project: WidgetProject
  readonly session: WidgetDevSession
}): Plugin {
  const componentAssets = createComponentAssetMap(input.componentAssets)
  return {
    name: 'patab-widget-dev-host',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const route = resolveWidgetDevRequest(request.url, input.session, input.project)
        if (route.kind === 'unhandled') return next()
        void handleWidgetDevRequest({
          request,
          response,
          route,
          server,
          assets: input.assets,
          componentAssets,
          project: input.project,
          session: input.session,
        }).catch(() => sendProtectedFailure(response, 500))
      })
    },
  }
}
