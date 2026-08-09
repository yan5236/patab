import { readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import {
  evaluateWidgetApiCompatibility,
  validatePatabWidgetManifestV1,
  type PatabWidgetManifestV1,
} from '@patab/widget-sdk'

import { WidgetCliError } from './report.js'

/** CLI 约定的项目根 Manifest 文件名；输出 ZIP 中也始终使用该固定路径。 */
export const WIDGET_MANIFEST_FILE_NAME = 'patab.manifest.json'

/** 已成功读取并 Schema 校验的本地组件项目。 */
export interface WidgetProject {
  readonly root: string
  readonly manifest: PatabWidgetManifestV1
  readonly manifestSource: string
}

/** 表示一个从项目根安全读取的 ZIP 产物文件，路径始终使用 Unix 分隔符。 */
export interface WidgetProjectFile {
  readonly path: string
  readonly bytes: Uint8Array
}

/** 判断候选路径是否仍位于项目根，防止 Manifest 或 CLI 参数以穿越路径读取宿主文件。 */
function isInsideProject(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath !== '' && !relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !relativePath.includes(`${sep}..${sep}`)
}

/** 将 ZIP 使用的相对路径安全映射到项目根绝对路径，拒绝反斜杠、空段和穿越段。 */
function resolveProjectPath(root: string, archivePath: string): string {
  if (!archivePath || archivePath.includes('\\') || archivePath.startsWith('/') || archivePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new WidgetCliError('INVALID_PACKAGE', '组件路径不符合安全格式。')
  }
  const resolvedPath = resolve(root, ...archivePath.split('/'))
  if (!isInsideProject(root, resolvedPath)) throw new WidgetCliError('INVALID_PACKAGE', '组件路径越出项目目录。')
  return resolvedPath
}

/** 使用严格 UTF-8 解码读取文本，避免替换字符掩盖 Manifest 或 HTML 损坏。 */
async function readUtf8File(path: string): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
  } catch {
    throw new WidgetCliError('CHECK_FAILED', '组件必需文本文件缺失或不是有效 UTF-8。')
  }
}

/**
 * 读取并校验项目根 Manifest。
 *
 * 该函数复用 SDK Schema 和 API 兼容性判断，保证 CLI 与导入端在执行任何 surface 前得出同一结论。
 */
export async function loadWidgetProject(rootInput: string = process.cwd()): Promise<WidgetProject> {
  const root = resolve(rootInput)
  const manifestSource = await readUtf8File(join(root, WIDGET_MANIFEST_FILE_NAME))
  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(manifestSource)
  } catch {
    throw new WidgetCliError('MANIFEST_INVALID', '组件 Manifest 不是有效 JSON。')
  }
  const validation = validatePatabWidgetManifestV1(rawManifest)
  if (!validation.valid) throw new WidgetCliError('MANIFEST_INVALID', `组件 Manifest Schema 校验失败：${validation.path}`)
  const manifest = rawManifest as PatabWidgetManifestV1
  const compatibility = evaluateWidgetApiCompatibility(manifest.apiVersion)
  if (!compatibility.compatible) throw new WidgetCliError('API_INCOMPATIBLE', compatibility.error.message)
  return { root, manifest, manifestSource }
}

/** 根据声明 surface 的 ZIP 入口生成官方脚手架和 CLI 共用的源码 HTML 路径。 */
export function getWidgetSurfaceSourcePath(project: WidgetProject, surface: string): string {
  const declaration = project.manifest.surfaces[surface]
  if (!declaration) throw new WidgetCliError('MANIFEST_INVALID', '组件 Manifest 声明了无效 surface。')
  const fileName = declaration.entry.slice('surfaces/'.length)
  return resolveProjectPath(project.root, `src/surfaces/${fileName}`)
}

/** 读取 Manifest 声明的图标、截图和 variant 图标，按路径去重并保留包校验需要的精确集合。 */
export async function readDeclaredWidgetAssets(project: WidgetProject): Promise<readonly WidgetProjectFile[]> {
  const assetPaths = new Set<string>([project.manifest.assets.icon, ...(project.manifest.assets.screenshots ?? [])])
  for (const variant of project.manifest.variants ?? []) assetPaths.add(variant.icon)
  const files: WidgetProjectFile[] = []
  for (const path of [...assetPaths].sort()) {
    try {
      files.push({ path, bytes: new Uint8Array(await readFile(resolveProjectPath(project.root, path))) })
    } catch {
      throw new WidgetCliError('CHECK_FAILED', '组件 Manifest 引用的静态素材缺失。')
    }
  }
  return files
}

/** 读取所有声明 surface 的源码 HTML，供本地模拟器使用；生产包必须通过独立 Vite 构建而不能直接使用此结果。 */
export async function readWidgetSurfaceSources(project: WidgetProject): Promise<Readonly<Record<string, string>>> {
  const sources: Record<string, string> = {}
  for (const surface of Object.keys(project.manifest.surfaces).sort()) {
    sources[surface] = await readUtf8File(getWidgetSurfaceSourcePath(project, surface))
  }
  return sources
}
