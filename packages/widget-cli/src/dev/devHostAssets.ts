import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WidgetCliError } from '../report.js'
import { WIDGET_DEV_HOST_VERSION } from './devSession.js'

/** 随 CLI 发布的开发宿主元数据固定文件名。 */
const DEV_HOST_METADATA_FILE = 'host.json'

/** 只为开发宿主实际静态类型提供固定响应类型，未知扩展名按二进制下载。 */
const DEV_HOST_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/** 单个已校验宿主静态资产。 */
export interface WidgetDevHostAsset {
  readonly content: Uint8Array
  readonly contentType: string
  readonly relativePath: string
}

/** CLI server 使用的只读宿主资产集合。 */
export interface WidgetDevHostAssets {
  readonly hostVersion: string
  readonly entry: string
  read(relativePath: string): Promise<WidgetDevHostAsset | undefined>
}

/** 宿主构建元数据只允许固定字段，避免发布目录中的任意 JSON 控制路径。 */
interface WidgetDevHostMetadata {
  readonly version: string
  readonly entry: string
}

/** 判断候选真实路径是否仍严格位于宿主资产根内。 */
function isInsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`)
}

/** 校验 HTTP 相对资产路径并映射到根目录，拒绝绝对、穿越、反斜杠和空段。 */
function resolveAssetPath(root: string, assetPath: string): string | undefined {
  if (!assetPath
    || assetPath.includes('\\')
    || assetPath.startsWith('/')
    || assetPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return undefined
  }
  const candidate = resolve(root, ...assetPath.split('/'))
  return isInsideRoot(root, candidate) ? candidate : undefined
}

/** 严格读取并校验宿主元数据，不把解析错误或实际根路径暴露给 CLI 报告。 */
async function readMetadata(root: string): Promise<WidgetDevHostMetadata> {
  try {
    const value = JSON.parse(await readFile(resolve(root, DEV_HOST_METADATA_FILE), 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const record = value as Record<string, unknown>
    if (Object.keys(record).sort().join(',') !== 'entry,version'
      || typeof record.version !== 'string'
      || typeof record.entry !== 'string'
      || !resolveAssetPath(root, record.entry)) {
      throw new Error('invalid')
    }
    return { version: record.version, entry: record.entry }
  } catch {
    throw new WidgetCliError('BUILD_FAILED', 'PaTab 开发宿主资产缺失或无效。')
  }
}

/**
 * 打开随 CLI 发布的真实 PaTab 开发宿主资产。
 *
 * 默认根相对当前编译模块定位而不是调用者 cwd；每次读取都会再次检查 realpath，防止符号链接
 * 或路径穿越越出发布目录。
 */
export async function openWidgetDevHostAssets(options: {
  readonly root?: string
  readonly expectedHostVersion?: string
} = {}): Promise<WidgetDevHostAssets> {
  const defaultRoot = fileURLToPath(new URL('../dev-host/', import.meta.url))
  let root: string
  try {
    root = await realpath(options.root ? resolve(options.root) : defaultRoot)
  } catch {
    throw new WidgetCliError('BUILD_FAILED', 'PaTab 开发宿主资产缺失或无效。')
  }
  const metadata = await readMetadata(root)
  if (metadata.version !== (options.expectedHostVersion ?? WIDGET_DEV_HOST_VERSION)) {
    throw new WidgetCliError('BUILD_FAILED', 'PaTab 开发宿主版本与 CLI 不匹配。')
  }

  return Object.freeze({
    hostVersion: metadata.version,
    entry: metadata.entry,
    async read(assetPath: string): Promise<WidgetDevHostAsset | undefined> {
      const candidate = resolveAssetPath(root, assetPath)
      if (!candidate) return undefined
      try {
        const resolvedCandidate = await realpath(candidate)
        if (!isInsideRoot(root, resolvedCandidate) || !(await stat(resolvedCandidate)).isFile()) return undefined
        return {
          content: new Uint8Array(await readFile(resolvedCandidate)),
          contentType: DEV_HOST_CONTENT_TYPES[extname(resolvedCandidate).toLowerCase()] ?? 'application/octet-stream',
          relativePath: assetPath,
        }
      } catch {
        return undefined
      }
    },
  })
}
