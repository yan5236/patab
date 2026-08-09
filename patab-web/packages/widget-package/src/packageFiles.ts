import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

/** 根目录 Manifest 文件的固定名称。 */
export const WIDGET_MANIFEST_FILE_PATH = 'patab.manifest.json'

/** Manifest 原始 UTF-8 文件允许的最大字节数。 */
export const WIDGET_MANIFEST_MAX_BYTES = 64 * 1024

/** 图标文件允许的最大字节数。 */
export const WIDGET_ICON_MAX_BYTES = 512 * 1024

/** 每张商店截图允许的最大字节数。 */
export const WIDGET_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024

/** 商店截图允许的最大像素宽度。 */
export const WIDGET_SCREENSHOT_MAX_WIDTH = 2560

/** 商店截图允许的最大像素高度。 */
export const WIDGET_SCREENSHOT_MAX_HEIGHT = 1440

/** 经过 Worker 实际解压后供包文件集检查使用的单个文件。 */
export interface WidgetPackageFile {
  readonly path: string
  readonly bytes: Uint8Array
}

/** 静态图片经文件头嗅探后允许的真实 MIME 类型。 */
export type WidgetStaticImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

/** 静态图片经真实解码后得到的像素尺寸。 */
export interface WidgetStaticImageDimensions {
  readonly width: number
  readonly height: number
}

/**
 * 抽象静态图片解码器，使共享文件集校验不依赖 DOM，而浏览器和未来 Node CLI 可注入各自真实解码实现。
 */
export interface WidgetStaticImageDecoder {
  decode(bytes: Uint8Array, mime: WidgetStaticImageMime): Promise<WidgetStaticImageDimensions>
}

/** 静态素材在 Manifest 中所承担的安装前展示角色。 */
export interface ValidatedWidgetStaticAsset extends WidgetPackageFile {
  readonly mime: WidgetStaticImageMime
  readonly dimensions: WidgetStaticImageDimensions
  readonly isIcon: boolean
  readonly isScreenshot: boolean
}

/** 通过包文件集、静态素材与引用检查后的安全文件视图。 */
export interface ValidatedWidgetPackageFiles {
  readonly manifestFile: WidgetPackageFile
  readonly integrityFile: WidgetPackageFile
  readonly signatureFile?: WidgetPackageFile
  readonly surfaceFiles: readonly WidgetPackageFile[]
  readonly staticAssets: readonly ValidatedWidgetStaticAsset[]
}

/** 包文件集与静态素材校验失败时的稳定错误码。 */
export type WidgetPackageFileErrorCode =
  | 'PACKAGE_FILE_DUPLICATE'
  | 'PACKAGE_FILE_EXTRA'
  | 'PACKAGE_FILE_MISSING'
  | 'PACKAGE_MANIFEST_TOO_LARGE'
  | 'PACKAGE_PATH_INVALID'
  | 'PACKAGE_STATIC_IMAGE_DECODE_FAILED'
  | 'PACKAGE_STATIC_IMAGE_DIMENSIONS_INVALID'
  | 'PACKAGE_STATIC_IMAGE_MIME_INVALID'
  | 'PACKAGE_STATIC_IMAGE_TOO_LARGE'
  | 'PACKAGE_SURFACE_UTF8_INVALID'

/**
 * 表示包文件集校验拒绝的安全错误，只公开稳定代码与 ZIP 内相对路径，不传文件正文或底层异常。
 */
export class WidgetPackageFileError extends Error {
  /**
   * 创建带稳定错误码和可选相对文件路径的包文件集错误。
   */
  constructor(
    readonly code: WidgetPackageFileErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'WidgetPackageFileError'
  }
}

/** 描述单个被 Manifest 允许出现的文件及其是否必须存在。 */
interface ExpectedWidgetPackageFile {
  readonly required: boolean
  readonly kind: 'integrity' | 'manifest' | 'signature' | 'static-asset' | 'surface'
  readonly isIcon?: boolean
  readonly isScreenshot?: boolean
}

/**
 * 校验路径为已规范化的 ZIP 内相对文件路径，防止绕过中央目录检查的调用方把歧义路径传入文件集层。
 */
function assertPackagePath(path: string): void {
  if (
    !path
    || path.normalize('NFC') !== path
    || path.includes('\\')
    || path.includes('\0')
    || path.startsWith('/')
    || /^[A-Za-z]:/.test(path)
    || path.endsWith('/')
  ) {
    throw new WidgetPackageFileError('PACKAGE_PATH_INVALID', '组件包包含无效文件路径。', path)
  }

  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new WidgetPackageFileError('PACKAGE_PATH_INVALID', '组件包包含无效文件路径。', path)
  }
}

/**
 * 将图标、截图与 variant 图标合并为唯一静态素材要求，避免相同路径在解码和配额检查时重复处理。
 */
function addStaticAssetRequirement(
  expectedFiles: Map<string, ExpectedWidgetPackageFile>,
  path: string,
  requirement: Pick<ExpectedWidgetPackageFile, 'isIcon' | 'isScreenshot'>,
): void {
  assertPackagePath(path)
  const existing = expectedFiles.get(path)
  if (existing && existing.kind !== 'static-asset') {
    throw new WidgetPackageFileError('PACKAGE_PATH_INVALID', 'Manifest 文件路径角色冲突。', path)
  }

  expectedFiles.set(path, {
    kind: 'static-asset',
    required: true,
    isIcon: Boolean(existing?.isIcon || requirement.isIcon),
    isScreenshot: Boolean(existing?.isScreenshot || requirement.isScreenshot),
  })
}

/**
 * 从通过 Schema 的 Manifest 推导唯一允许的 ZIP 文件集合，不把 Manifest 未声明的文件视为可执行或可展示资源。
 */
function collectExpectedFiles(manifest: PatabWidgetManifestV1): Map<string, ExpectedWidgetPackageFile> {
  const expectedFiles = new Map<string, ExpectedWidgetPackageFile>([
    [WIDGET_MANIFEST_FILE_PATH, { kind: 'manifest', required: true }],
    ['integrity.json', { kind: 'integrity', required: true }],
    ['signature.json', { kind: 'signature', required: false }],
  ])

  for (const surface of Object.values(manifest.surfaces)) {
    assertPackagePath(surface.entry)
    const existing = expectedFiles.get(surface.entry)
    if (existing && existing.kind !== 'surface') {
      throw new WidgetPackageFileError('PACKAGE_PATH_INVALID', 'Manifest surface 路径角色冲突。', surface.entry)
    }
    expectedFiles.set(surface.entry, { kind: 'surface', required: true })
  }

  addStaticAssetRequirement(expectedFiles, manifest.assets.icon, { isIcon: true })
  for (const screenshot of manifest.assets.screenshots ?? []) {
    addStaticAssetRequirement(expectedFiles, screenshot, { isScreenshot: true })
  }
  for (const variant of manifest.variants ?? []) {
    addStaticAssetRequirement(expectedFiles, variant.icon, { isIcon: true })
  }

  return expectedFiles
}

/**
 * 将实际文件转为路径索引并拒绝重复、无效或 Manifest 未声明的文件，防止后续校验读取歧义资源。
 */
function indexActualFiles(
  files: readonly WidgetPackageFile[],
  expectedFiles: ReadonlyMap<string, ExpectedWidgetPackageFile>,
): ReadonlyMap<string, WidgetPackageFile> {
  const filesByPath = new Map<string, WidgetPackageFile>()
  for (const file of files) {
    assertPackagePath(file.path)
    if (filesByPath.has(file.path)) {
      throw new WidgetPackageFileError('PACKAGE_FILE_DUPLICATE', '组件包包含重复文件路径。', file.path)
    }
    if (!expectedFiles.has(file.path)) {
      throw new WidgetPackageFileError('PACKAGE_FILE_EXTRA', '组件包包含未声明文件。', file.path)
    }
    filesByPath.set(file.path, file)
  }

  for (const [path, expected] of expectedFiles) {
    if (expected.required && !filesByPath.has(path)) {
      throw new WidgetPackageFileError('PACKAGE_FILE_MISSING', 'Manifest 引用的文件缺失。', path)
    }
  }
  return filesByPath
}

/**
 * 按文件头嗅探真实图片 MIME，绝不信任 ZIP 路径后缀或调用方传入的 MIME 字符串。
 */
function detectStaticImageMime(bytes: Uint8Array): WidgetStaticImageMime | undefined {
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  if (isPng) return 'image/png'

  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (isJpeg) return 'image/jpeg'

  const isWebp = bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (isWebp) return 'image/webp'

  return undefined
}

/**
 * 验证 surface 是有效 UTF-8 文本；此层只接受独立 HTML 文件，不创建 DOM、更不执行任何包内脚本。
 */
function assertSurfaceUtf8(file: WidgetPackageFile): void {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
  } catch {
    throw new WidgetPackageFileError('PACKAGE_SURFACE_UTF8_INVALID', '组件 surface 不是有效 UTF-8 HTML。', file.path)
  }
}

/**
 * 校验静态图片字节、真实 MIME 与解码尺寸，并根据其图标/截图角色应用不同的格式、体积和像素限制。
 */
async function validateStaticAsset(
  file: WidgetPackageFile,
  requirement: ExpectedWidgetPackageFile,
  imageDecoder: WidgetStaticImageDecoder,
): Promise<ValidatedWidgetStaticAsset> {
  const mime = detectStaticImageMime(file.bytes)
  if (!mime || (requirement.isIcon && mime === 'image/jpeg')) {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_MIME_INVALID', '静态素材 MIME 不符合图标或截图要求。', file.path)
  }
  if (requirement.isIcon && file.bytes.byteLength > WIDGET_ICON_MAX_BYTES) {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_TOO_LARGE', '组件图标超过大小上限。', file.path)
  }
  if (requirement.isScreenshot && file.bytes.byteLength > WIDGET_SCREENSHOT_MAX_BYTES) {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_TOO_LARGE', '组件截图超过大小上限。', file.path)
  }

  let dimensions: WidgetStaticImageDimensions
  try {
    dimensions = await imageDecoder.decode(file.bytes, mime)
  } catch {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_DECODE_FAILED', '静态图片无法实际解码。', file.path)
  }

  if (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_DIMENSIONS_INVALID', '静态图片尺寸无效。', file.path)
  }
  if (
    requirement.isScreenshot
    && (dimensions.width > WIDGET_SCREENSHOT_MAX_WIDTH || dimensions.height > WIDGET_SCREENSHOT_MAX_HEIGHT)
  ) {
    throw new WidgetPackageFileError('PACKAGE_STATIC_IMAGE_DIMENSIONS_INVALID', '组件截图像素尺寸超过上限。', file.path)
  }

  return {
    ...file,
    mime,
    dimensions,
    isIcon: Boolean(requirement.isIcon),
    isScreenshot: Boolean(requirement.isScreenshot),
  }
}

/**
 * 校验已解压 ZIP 的文件集合、Manifest 引用和安装前静态素材；此函数不执行 surface、不读 DOM，也不处理签名验证。
 */
export async function validateWidgetPackageFiles(
  manifest: PatabWidgetManifestV1,
  files: readonly WidgetPackageFile[],
  imageDecoder: WidgetStaticImageDecoder,
): Promise<ValidatedWidgetPackageFiles> {
  const expectedFiles = collectExpectedFiles(manifest)
  const filesByPath = indexActualFiles(files, expectedFiles)
  const manifestFile = filesByPath.get(WIDGET_MANIFEST_FILE_PATH)!
  const integrityFile = filesByPath.get('integrity.json')!
  if (manifestFile.bytes.byteLength > WIDGET_MANIFEST_MAX_BYTES) {
    throw new WidgetPackageFileError('PACKAGE_MANIFEST_TOO_LARGE', 'Manifest 超过大小上限。', WIDGET_MANIFEST_FILE_PATH)
  }

  const surfaceFiles: WidgetPackageFile[] = []
  const staticAssets: ValidatedWidgetStaticAsset[] = []
  for (const [path, requirement] of expectedFiles) {
    const file = filesByPath.get(path)
    if (!file) continue

    if (requirement.kind === 'surface') {
      assertSurfaceUtf8(file)
      surfaceFiles.push(file)
    }
    if (requirement.kind === 'static-asset') {
      staticAssets.push(await validateStaticAsset(file, requirement, imageDecoder))
    }
  }

  return {
    manifestFile,
    integrityFile,
    ...(filesByPath.has('signature.json') ? { signatureFile: filesByPath.get('signature.json')! } : {}),
    surfaceFiles,
    staticAssets,
  }
}
