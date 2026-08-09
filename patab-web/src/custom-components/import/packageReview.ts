import {
  validateWidgetPermissionDeclarations,
  type PatabWidgetManifestV1,
  type WidgetNetworkDeclaration,
  type WidgetTileSize,
} from '@patab/widget-sdk'
import { validatePatabWidgetManifestV1 } from '@patab/widget-sdk'
import {
  parseIntegrityDocument,
  parseWidgetSignatureDocument,
  validateWidgetPackageFiles,
  verifyIntegrityDocument,
  verifyWidgetSignature,
  type BrowserUnzipWorkerFile,
  type WidgetStaticImageDecoder,
} from '@patab/widget-package'

import type { CustomComponentPackageReview } from '@/stores/customComponents'

/** 安装前审查公开的稳定错误码；不传递 ZIP 正文、绝对路径或底层库错误文本。 */
export type CustomComponentPackageReviewErrorCode =
  | 'INTEGRITY_DOCUMENT_INVALID'
  | 'MANIFEST_CROSS_FIELD_INVALID'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_SCHEMA_INVALID'
  | 'NETWORK_ORIGIN_INVALID'
  | 'PACKAGE_FILE_MISSING'
  | 'SIGNATURE_DOCUMENT_INVALID'

/**
 * 表示安装前静态审查失败，错误边界只保留稳定错误码与 ZIP 相对路径或 Manifest JSON Pointer。
 */
export class CustomComponentPackageReviewError extends Error {
  /** 创建不会将不可信包内容带到 UI 的审查错误。 */
  constructor(
    readonly code: CustomComponentPackageReviewErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'CustomComponentPackageReviewError'
  }
}

const MANIFEST_PATH = 'patab.manifest.json'
const INTEGRITY_PATH = 'integrity.json'
const SIGNATURE_PATH = 'signature.json'

/** 以严格 UTF-8 读取 JSON 或 HTML 文本，拒绝替换字符掩盖的损坏包内容。 */
function decodeUtf8(bytes: Uint8Array, path: string, code: CustomComponentPackageReviewErrorCode): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new CustomComponentPackageReviewError(code, '组件包文本编码无效。', path)
  }
}

/** 在已解压文件中查找固定路径；缺失时不泄露完整归档清单。 */
function getRequiredFile(files: readonly BrowserUnzipWorkerFile[], path: string): BrowserUnzipWorkerFile {
  const file = files.find((entry) => entry.path === path)
  if (!file) throw new CustomComponentPackageReviewError('PACKAGE_FILE_MISSING', '组件包缺少必需文件。', path)
  return file
}

/** 比较图块尺寸值，避免对象引用不同导致 Manifest 子集检查失效。 */
function isSameSize(left: WidgetTileSize, right: WidgetTileSize): boolean {
  return left.w === right.w && left.h === right.h
}

/** 验证 Manifest 网络来源是无用户信息、无路径查询和大小写规范化后的精确 HTTPS origin。 */
function assertExactNetworkOrigin(network: WidgetNetworkDeclaration, index: number): void {
  try {
    const parsed = new URL(network.origin)
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
      || parsed.origin !== network.origin
    ) {
      throw new Error('origin invalid')
    }
  } catch {
    throw new CustomComponentPackageReviewError('NETWORK_ORIGIN_INVALID', '网络来源必须是精确 HTTPS origin。', `/network/${index}/origin`)
  }
}

/** 验证 Schema 无法表达的跨字段约束，防止默认尺寸、类型或网络来源在安装后才暴露矛盾。 */
function assertManifestCrossFields(manifest: PatabWidgetManifestV1): void {
  if (!manifest.sizes.some((size) => isSameSize(size, manifest.defaultSize))) {
    throw new CustomComponentPackageReviewError('MANIFEST_CROSS_FIELD_INVALID', '默认尺寸必须在支持尺寸中声明。', '/defaultSize')
  }

  const variants = manifest.variants ?? []
  const variantIds = new Set<string>()
  for (const [index, variant] of variants.entries()) {
    if (variantIds.has(variant.id)) {
      throw new CustomComponentPackageReviewError('MANIFEST_CROSS_FIELD_INVALID', '组件类型标识不能重复。', `/variants/${index}/id`)
    }
    variantIds.add(variant.id)
    if (variant.supportedSizes.some((size) => !manifest.sizes.some((allowed) => isSameSize(size, allowed)))) {
      throw new CustomComponentPackageReviewError('MANIFEST_CROSS_FIELD_INVALID', '组件类型引用了未声明的支持尺寸。', `/variants/${index}/supportedSizes`)
    }
  }
  if (manifest.defaultVariant && !variantIds.has(manifest.defaultVariant)) {
    throw new CustomComponentPackageReviewError('MANIFEST_CROSS_FIELD_INVALID', '默认组件类型不存在。', '/defaultVariant')
  }
  if (manifest.defaultVariant) {
    const defaultVariant = variants.find((variant) => variant.id === manifest.defaultVariant)
    if (!defaultVariant?.supportedSizes.some((size) => isSameSize(size, manifest.defaultSize))) {
      throw new CustomComponentPackageReviewError('MANIFEST_CROSS_FIELD_INVALID', '默认组件类型必须支持默认尺寸。', '/defaultVariant')
    }
  }

  const origins = new Set<string>()
  for (const [index, network] of (manifest.network ?? []).entries()) {
    assertExactNetworkOrigin(network, index)
    if (origins.has(network.origin)) {
      throw new CustomComponentPackageReviewError('NETWORK_ORIGIN_INVALID', '网络来源不能重复声明。', `/network/${index}/origin`)
    }
    origins.add(network.origin)
  }
}

/** 将已验证的二进制文件转为安装仓库允许的安全静态 Blob 或 UTF-8 文本，不创建 DOM 或执行 surface。 */
function toReviewFiles(
  files: readonly BrowserUnzipWorkerFile[],
  manifest: PatabWidgetManifestV1,
  staticAssetMimeByPath: ReadonlyMap<string, string>,
): CustomComponentPackageReview['files'] {
  const textPaths = new Set([
    MANIFEST_PATH,
    INTEGRITY_PATH,
    SIGNATURE_PATH,
    ...Object.values(manifest.surfaces).map((surface) => surface.entry),
  ])
  return files.map((file) => ({
    path: file.path,
    content: textPaths.has(file.path)
      ? decodeUtf8(file.bytes, file.path, 'MANIFEST_INVALID')
      : createStaticBlob(file.bytes, staticAssetMimeByPath.get(file.path)),
  }))
}

/** 复制 Worker 转移出的字节到独立 ArrayBuffer，再构造仅供静态图片展示和安装保存的 Blob。 */
function createStaticBlob(bytes: Uint8Array, mime: string | undefined): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: mime ?? 'application/octet-stream' })
}

/**
 * 在不创建 iframe、不解析 HTML DOM 和不执行任何第三方代码的前提下，完成解压结果的 Manifest、素材、完整性与签名审查。
 */
export async function reviewCustomComponentPackage(
  files: readonly BrowserUnzipWorkerFile[],
  imageDecoder: WidgetStaticImageDecoder,
  knownPublisherPublicKey?: string,
): Promise<CustomComponentPackageReview> {
  const manifestFile = getRequiredFile(files, MANIFEST_PATH)
  let manifestSource: string
  try {
    manifestSource = decodeUtf8(manifestFile.bytes, MANIFEST_PATH, 'MANIFEST_INVALID')
    const candidate = JSON.parse(manifestSource) as unknown
    const manifestValidation = validatePatabWidgetManifestV1(candidate)
    if (!manifestValidation.valid) {
      throw new CustomComponentPackageReviewError('MANIFEST_SCHEMA_INVALID', 'Manifest 不符合 API v1 规范。', manifestValidation.path)
    }
    const manifest = candidate as PatabWidgetManifestV1
    const permissionValidation = validateWidgetPermissionDeclarations(manifest.permissions)
    if (!permissionValidation.valid) {
      const path = permissionValidation.error.path?.replace(/\./g, '/') ?? 'permissions'
      throw new CustomComponentPackageReviewError('MANIFEST_SCHEMA_INVALID', 'Manifest 权限声明无效。', `/${path}`)
    }
    assertManifestCrossFields(manifest)

    const validatedFiles = await validateWidgetPackageFiles(manifest, files, imageDecoder)
    const integrity = parseIntegrityDocument(decodeUtf8(validatedFiles.integrityFile.bytes, INTEGRITY_PATH, 'INTEGRITY_DOCUMENT_INVALID'))
    await verifyIntegrityDocument(
      integrity,
      files
        .filter((file) => file.path !== INTEGRITY_PATH && file.path !== SIGNATURE_PATH)
        .map((file) => ({ path: file.path, bytes: file.bytes })),
    )
    const signature = validatedFiles.signatureFile
      ? parseWidgetSignatureDocument(decodeUtf8(validatedFiles.signatureFile.bytes, SIGNATURE_PATH, 'SIGNATURE_DOCUMENT_INVALID'))
      : undefined
    const signatureVerification = await verifyWidgetSignature({
      manifest,
      integrity,
      ...(signature ? { signatureDocument: signature } : {}),
      ...(knownPublisherPublicKey ? { knownPublisherPublicKey } : {}),
    })
    const staticAssetMimeByPath = new Map(validatedFiles.staticAssets.map((asset) => [asset.path, asset.mime]))

    return {
      manifest,
      integrity,
      ...(signature ? { signature } : {}),
      signatureVerification,
      files: toReviewFiles(files, manifest, staticAssetMimeByPath),
    }
  } catch (error) {
    if (error instanceof CustomComponentPackageReviewError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      const safeError = error as { readonly code?: unknown; readonly path?: unknown }
      if (typeof safeError.code === 'string') {
        throw new CustomComponentPackageReviewError(
          safeError.code as CustomComponentPackageReviewErrorCode,
          '组件包静态校验失败。',
          typeof safeError.path === 'string' ? safeError.path : undefined,
        )
      }
    }
    throw new CustomComponentPackageReviewError('MANIFEST_INVALID', '组件包静态审查失败。', MANIFEST_PATH)
  }
}
