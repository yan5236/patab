import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { build } from 'vite'

import type { WidgetProject, WidgetProjectFile } from './project.js'
import { getWidgetSurfaceSourcePath } from './project.js'
import { WidgetCliError } from './report.js'

/** 生产 surface 内联的最大资源阈值与 ZIP 总体解压上限一致，避免 Vite 把任何运行资源留在外部目录。 */
const SURFACE_INLINE_LIMIT_BYTES = 30 * 1024 * 1024

/** 为常见运行素材生成 data URL MIME；未知二进制按 application/octet-stream 保守内联。 */
function getDataUrlMime(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.css') return 'text/css'
  if (extension === '.js' || extension === '.mjs') return 'text/javascript'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.woff2') return 'font/woff2'
  if (extension === '.woff') return 'font/woff'
  return 'application/octet-stream'
}

/** 解析 Vite 输出的资源引用；生产产物只能指向构建目录中的相对路径，不能读取项目源文件或网络地址。 */
function resolveBuildAsset(outputDirectory: string, reference: string): string {
  const normalizedReference = reference.split(/[?#]/, 1)[0] ?? ''
  if (!normalizedReference || /^[a-z][a-z0-9+.-]*:/i.test(normalizedReference) || normalizedReference.startsWith('//')) {
    throw new WidgetCliError('CHECK_FAILED', '生产 surface 包含外链运行资源。')
  }
  const assetPath = resolve(outputDirectory, normalizedReference.startsWith('/') ? `.${normalizedReference}` : normalizedReference)
  const pathInsideOutput = relative(outputDirectory, assetPath)
  if (pathInsideOutput.startsWith('..') || pathInsideOutput === '') throw new WidgetCliError('CHECK_FAILED', '生产 surface 包含越界运行资源。')
  return assetPath
}

/** 将 CSS 中的 Vite 资源引用逐一转成 data URL，避免字体或图片在 opaque sandbox 中继续请求 ZIP 外路径。 */
async function inlineCssAssets(css: string, outputDirectory: string): Promise<string> {
  const references = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)]
  let inlinedCss = css
  for (const match of references) {
    const reference = match[2]
    if (!reference || reference.startsWith('data:') || reference.startsWith('blob:') || reference.startsWith('#')) continue
    const assetPath = resolveBuildAsset(outputDirectory, reference)
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(assetPath))
    } catch {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 引用的构建资源缺失。')
    }
    const dataUrl = `data:${getDataUrlMime(assetPath)};base64,${Buffer.from(bytes).toString('base64')}`
    inlinedCss = inlinedCss.replace(match[0], `url("${dataUrl}")`)
  }
  return inlinedCss
}

/** 将 HTML script 的 src 引用替换为同目录的内联脚本；任何远程、开发客户端或缺失文件都立即失败。 */
async function inlineScripts(html: string, outputDirectory: string): Promise<string> {
  const scriptPattern = /<script\b([^>]*?)\bsrc\s*=\s*(['"])([^'"]+)\2([^>]*)>\s*<\/script>/gi
  let result = html
  for (const match of [...html.matchAll(scriptPattern)]) {
    const source = match[3]
    if (!source) continue
    const scriptPath = resolveBuildAsset(outputDirectory, source)
    let code: string
    try {
      code = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(scriptPath))
    } catch {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 脚本资源缺失或不是 UTF-8。')
    }
    if (/\bimport\s*\(|(?:@vite\/client|import\.meta\.hot|sourceMappingURL)/.test(code)) {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 包含动态导入、开发客户端或 source map。')
    }
    result = result.replace(match[0], `<script${match[1] ?? ''}${match[4] ?? ''}>${code}</script>`)
  }
  return result
}

/** 将 HTML stylesheet link 替换为内联 style，并递归内联其字体和图片资源。 */
async function inlineStylesheets(html: string, outputDirectory: string): Promise<string> {
  const linkPattern = /<link\b[^>]*>/gi
  let result = html
  for (const match of [...html.matchAll(linkPattern)]) {
    const tag = match[0]
    if (!/\brel\s*=\s*(['"])?stylesheet\1/i.test(tag)) continue
    const href = /\bhref\s*=\s*(['"])([^'"]+)\1/i.exec(tag)?.[2]
    if (!href) throw new WidgetCliError('CHECK_FAILED', '生产 surface 样式表缺少 href。')
    const stylesheetPath = resolveBuildAsset(outputDirectory, href)
    let css: string
    try {
      css = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(stylesheetPath))
    } catch {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 样式资源缺失或不是 UTF-8。')
    }
    result = result.replace(tag, `<style>${await inlineCssAssets(css, outputDirectory)}</style>`)
  }
  return result
}

/** 将 HTML 图片、媒体和 source 的构建资源转为 data URL；srcset 语义复杂且生产组件应在构建时自行内联，故明确拒绝。 */
async function inlineHtmlResources(html: string, outputDirectory: string): Promise<string> {
  if (/\bsrcset\s*=/i.test(html)) throw new WidgetCliError('CHECK_FAILED', '生产 surface 不能包含 srcset 运行资源。')
  const references = [...html.matchAll(/\bsrc\s*=\s*(['"])([^'"]+)\1/gi)]
  let result = html
  for (const match of references) {
    const reference = match[2]
    if (!reference || reference.startsWith('data:') || reference.startsWith('blob:')) continue
    const assetPath = resolveBuildAsset(outputDirectory, reference)
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(assetPath))
    } catch {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 引用的构建资源缺失。')
    }
    result = result.replace(match[0], `src="data:${getDataUrlMime(assetPath)};base64,${Buffer.from(bytes).toString('base64')}"`)
  }
  return result
}

/** 检查最终 HTML 是否已完全自包含并符合 Runtime 同样的外部资源与开发残留拒绝要求。 */
function assertProductionSurfaceHtml(html: string): void {
  if (/\bimport\s*\(/.test(html) || /(?:@vite\/client|import\.meta\.hot|sourceMappingURL)/.test(html)) {
    throw new WidgetCliError('CHECK_FAILED', '生产 surface 包含动态导入、开发客户端或 source map。')
  }
  const scriptReferences = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>/gi)]
  for (const script of scriptReferences) {
    const source = script[2] ?? ''
    if (!source.startsWith('data:text/javascript;base64,')) {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 仍包含外部脚本。')
    }
    const code = Buffer.from(source.slice('data:text/javascript;base64,'.length), 'base64').toString('utf8')
    if (/\bimport\s*\(|(?:@vite\/client|import\.meta\.hot|sourceMappingURL)/.test(code)) {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 包含动态导入、开发客户端或 source map。')
    }
  }
  const linkedResources = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1[^>]*>/gi)]
  for (const resource of linkedResources) {
    if (!(resource[2] ?? '').startsWith('data:text/css;base64,')) {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 仍包含外部样式。')
    }
  }
  const resourceReferences = [...html.matchAll(/\b(?:src|srcset)\s*=\s*(['"])([^'"]+)\1/gi)]
  for (const match of resourceReferences) {
    const resource = match[2] ?? ''
    if (!resource.startsWith('data:') && !resource.startsWith('blob:')) {
      throw new WidgetCliError('CHECK_FAILED', '生产 surface 仍包含外部运行资源。')
    }
  }
}

/** 在一个 Vite 临时输出目录中定位唯一 HTML entry，拒绝额外 HTML 或 source map 以确保每个 surface 独立。 */
async function findSurfaceOutput(outputDirectory: string): Promise<string> {
  const collected: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name.endsWith('.map')) throw new WidgetCliError('CHECK_FAILED', '生产构建生成了 source map。')
      else if (entry.name.endsWith('.html')) collected.push(path)
    }
  }
  await visit(outputDirectory)
  if (collected.length !== 1) throw new WidgetCliError('BUILD_FAILED', '单个 surface 构建未生成唯一 HTML 入口。')
  return collected[0]!
}

/**
 * 使用项目自己的 Vite 配置独立构建每个 Manifest surface，并将所有运行资源内联为可导入的 HTML。
 *
 * 命令不限制 Vue、React、Svelte 等源码框架或插件；它只检查最终 HTML 契约，因此不引入第二套框架白名单。
 */
export async function buildWidgetSurfaces(project: WidgetProject): Promise<readonly WidgetProjectFile[]> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'patab-widget-build-'))
  try {
    const surfaces: WidgetProjectFile[] = []
    for (const surface of Object.keys(project.manifest.surfaces).sort()) {
      const outputDirectory = join(temporaryRoot, surface)
      const sourcePath = getWidgetSurfaceSourcePath(project, surface)
      try {
        await build({
          root: project.root,
          logLevel: 'error',
          build: {
            outDir: outputDirectory,
            emptyOutDir: true,
            sourcemap: false,
            assetsInlineLimit: SURFACE_INLINE_LIMIT_BYTES,
            cssCodeSplit: false,
            rolldownOptions: { input: sourcePath },
          },
        })
      } catch {
        throw new WidgetCliError('BUILD_FAILED', 'Vite 无法构建组件 surface。')
      }
      const outputPath = await findSurfaceOutput(outputDirectory)
      let html: string
      try {
        html = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(outputPath))
      } catch {
        throw new WidgetCliError('BUILD_FAILED', 'Vite 生成的 surface HTML 无法读取。')
      }
      html = await inlineHtmlResources(await inlineStylesheets(await inlineScripts(html, outputDirectory), outputDirectory), outputDirectory)
      assertProductionSurfaceHtml(html)
      const archivePath = project.manifest.surfaces[surface]!.entry
      surfaces.push({ path: archivePath, bytes: new TextEncoder().encode(html) })
    }
    return surfaces
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

/** 生成对外稳定的 surface 构建文件名，仅用于 verbose 调试时识别声明 surface，不包含用户项目绝对路径。 */
export function getSurfaceBuildLabel(file: WidgetProjectFile): string {
  return basename(file.path)
}
