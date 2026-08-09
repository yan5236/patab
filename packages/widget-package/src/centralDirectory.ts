/** ZIP 归档的最大压缩字节数。 */
export const ZIP_ARCHIVE_MAX_BYTES = 10 * 1024 * 1024

/** ZIP 中所有条目允许声明的最大解压总字节数。 */
export const ZIP_DECLARED_UNCOMPRESSED_MAX_BYTES = 30 * 1024 * 1024

/** 单个 ZIP 条目允许声明的最大解压字节数。 */
export const ZIP_ENTRY_UNCOMPRESSED_MAX_BYTES = 5 * 1024 * 1024

/** ZIP 归档允许的最大条目数。 */
export const ZIP_ENTRY_MAX_COUNT = 100

/** 单个 ZIP 条目允许的最大声明压缩比。 */
export const ZIP_COMPRESSION_RATIO_MAX = 100

/** ZIP 结构中用于定位归档尾部的签名。 */
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x0605_4b50

/** ZIP 结构中每个中央目录条目的固定签名。 */
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x0201_4b50

/** ZIP 结构中普通 EOCD 固定头部的字节长度。 */
const END_OF_CENTRAL_DIRECTORY_SIZE = 22

/** ZIP 中央目录条目固定头部的字节长度。 */
const CENTRAL_DIRECTORY_FILE_HEADER_SIZE = 46

/** ZIP 标记 UTF-8 文件名的通用位标志。 */
const UTF8_FILENAME_FLAG = 1 << 11

/** ZIP 标记加密条目的通用位标志。 */
const ENCRYPTED_ENTRY_FLAG = 1

/** ZIP version made by 字段中代表 Unix 属性的主机系统编号。 */
const UNIX_HOST_SYSTEM = 3

/** Unix 文件模式中的文件类型掩码。 */
const UNIX_FILE_TYPE_MASK = 0o170000

/** Unix 符号链接文件类型。 */
const UNIX_SYMBOLIC_LINK_TYPE = 0o120000

/** Unix 字符设备文件类型。 */
const UNIX_CHARACTER_DEVICE_TYPE = 0o020000

/** Unix 块设备文件类型。 */
const UNIX_BLOCK_DEVICE_TYPE = 0o060000

/** 共享 ZIP 检查器对不可信归档返回的稳定错误码。 */
export type ZipCentralDirectoryErrorCode =
  | 'ZIP_ARCHIVE_TOO_LARGE'
  | 'ZIP_CENTRAL_DIRECTORY_INVALID'
  | 'ZIP_COMPRESSION_RATIO_TOO_HIGH'
  | 'ZIP_DECLARED_SIZE_TOO_LARGE'
  | 'ZIP_DUPLICATE_PATH'
  | 'ZIP_ENCRYPTED_ENTRY'
  | 'ZIP_ENTRY_COUNT_TOO_LARGE'
  | 'ZIP_ENTRY_TOO_LARGE'
  | 'ZIP_PATH_INVALID'
  | 'ZIP_UNSUPPORTED_MULTIDISK'
  | 'ZIP_UNSUPPORTED_SPECIAL_FILE'
  | 'ZIP_UNSUPPORTED_ZIP64'
  | 'ZIP_UTF8_PATH_INVALID'

/**
 * 表示中央目录检查失败的安全错误，不携带归档正文、绝对路径或底层异常。
 */
export class ZipCentralDirectoryError extends Error {
  /**
   * 创建包含稳定错误码与可选 ZIP 内相对路径的检查错误。
   */
  constructor(
    readonly code: ZipCentralDirectoryErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'ZipCentralDirectoryError'
  }
}

/**
 * 描述经中央目录验证后的单个 ZIP 文件条目；此结构不包含也不读取正文。
 */
export interface ZipCentralDirectoryEntry {
  readonly path: string
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly compressionMethod: number
  readonly compressionRatio: number
  readonly externalAttributes: number
  readonly localHeaderOffset: number
  readonly isDirectory: boolean
}

/**
 * 描述 ZIP 归档检查所使用的配额，允许测试或将来更严格的调用场景缩小默认限制。
 */
export interface ZipCentralDirectoryLimits {
  readonly maxArchiveBytes: number
  readonly maxDeclaredUncompressedBytes: number
  readonly maxEntryCount: number
  readonly maxEntryUncompressedBytes: number
  readonly maxCompressionRatio: number
}

/** 归档检查的安全默认配额，对应 v1 组件 ZIP 约束。 */
export const DEFAULT_ZIP_CENTRAL_DIRECTORY_LIMITS: ZipCentralDirectoryLimits = {
  maxArchiveBytes: ZIP_ARCHIVE_MAX_BYTES,
  maxDeclaredUncompressedBytes: ZIP_DECLARED_UNCOMPRESSED_MAX_BYTES,
  maxEntryCount: ZIP_ENTRY_MAX_COUNT,
  maxEntryUncompressedBytes: ZIP_ENTRY_UNCOMPRESSED_MAX_BYTES,
  maxCompressionRatio: ZIP_COMPRESSION_RATIO_MAX,
}

/**
 * 描述只解析中央目录后的归档摘要，供后续 Worker 与文件集校验共享。
 */
export interface ZipCentralDirectoryInspection {
  readonly entries: readonly ZipCentralDirectoryEntry[]
  readonly archiveBytes: number
  readonly declaredUncompressedBytes: number
}

/**
 * 在读取 ZIP 固定字段前验证字节范围，防止截断归档触发越界读取或模糊错误。
 */
function assertRange(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 中央目录范围无效。')
  }
}

/**
 * 读取 ZIP 使用的小端无符号 16 位字段，并将截断错误统一映射为归档结构错误。
 */
function readUint16(view: DataView, bytes: Uint8Array, offset: number): number {
  assertRange(bytes, offset, 2)
  return view.getUint16(offset, true)
}

/**
 * 读取 ZIP 使用的小端无符号 32 位字段，并将截断错误统一映射为归档结构错误。
 */
function readUint32(view: DataView, bytes: Uint8Array, offset: number): number {
  assertRange(bytes, offset, 4)
  return view.getUint32(offset, true)
}

/**
 * 反向定位 EOCD，且确认其 comment 长度正好抵达输入末尾，拒绝拼接垃圾数据的伪造尾部。
 */
function findEndOfCentralDirectory(view: DataView, bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.byteLength - 0xffff - END_OF_CENTRAL_DIRECTORY_SIZE)
  for (let offset = bytes.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= minimumOffset; offset -= 1) {
    if (readUint32(view, bytes, offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue
    }

    const commentLength = readUint16(view, bytes, offset + 20)
    if (offset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength === bytes.byteLength) {
      return offset
    }
  }

  throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 缺少有效的中央目录尾记录。')
}

/**
 * 将中央目录中的 UTF-8 文件名统一规范为 NFC，并拒绝空、绝对、穿越或分隔符歧义路径。
 */
function normalizeZipPath(pathBytes: Uint8Array): string {
  let decodedPath: string
  try {
    decodedPath = new TextDecoder('utf-8', { fatal: true }).decode(pathBytes)
  } catch {
    throw new ZipCentralDirectoryError('ZIP_UTF8_PATH_INVALID', 'ZIP 条目路径不是有效 UTF-8。')
  }

  const normalizedPath = decodedPath.normalize('NFC')
  const isDirectory = normalizedPath.endsWith('/')
  const comparablePath = isDirectory ? normalizedPath.slice(0, -1) : normalizedPath
  if (
    !comparablePath
    || normalizedPath.includes('\\')
    || normalizedPath.includes('\0')
    || normalizedPath.startsWith('/')
    || /^[A-Za-z]:/.test(normalizedPath)
  ) {
    throw new ZipCentralDirectoryError('ZIP_PATH_INVALID', 'ZIP 条目路径包含绝对路径或分隔符歧义。')
  }

  const segments = comparablePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ZipCentralDirectoryError('ZIP_PATH_INVALID', 'ZIP 条目路径包含空、当前或父级目录段。')
  }

  return isDirectory ? `${comparablePath}/` : comparablePath
}

/**
 * 检查 Unix 外部属性中的符号链接、字符设备和块设备标记，拒绝不能安全提取的特殊文件。
 */
function assertSafeExternalAttributes(versionMadeBy: number, externalAttributes: number, path: string): void {
  const hostSystem = versionMadeBy >>> 8
  if (hostSystem !== UNIX_HOST_SYSTEM) {
    return
  }

  const fileType = (externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK
  if (
    fileType === UNIX_SYMBOLIC_LINK_TYPE
    || fileType === UNIX_CHARACTER_DEVICE_TYPE
    || fileType === UNIX_BLOCK_DEVICE_TYPE
  ) {
    throw new ZipCentralDirectoryError('ZIP_UNSUPPORTED_SPECIAL_FILE', 'ZIP 条目不能是符号链接或设备文件。', path)
  }
}

/**
 * 合并调用方覆盖的配额，同时保证每项均为可比较的非负有限整数或正压缩比。
 */
function resolveLimits(overrides: Partial<ZipCentralDirectoryLimits>): ZipCentralDirectoryLimits {
  const limits = { ...DEFAULT_ZIP_CENTRAL_DIRECTORY_LIMITS, ...overrides }
  if (
    !Number.isSafeInteger(limits.maxArchiveBytes)
    || !Number.isSafeInteger(limits.maxDeclaredUncompressedBytes)
    || !Number.isSafeInteger(limits.maxEntryCount)
    || !Number.isSafeInteger(limits.maxEntryUncompressedBytes)
    || limits.maxArchiveBytes < 0
    || limits.maxDeclaredUncompressedBytes < 0
    || limits.maxEntryCount < 0
    || limits.maxEntryUncompressedBytes < 0
    || !Number.isFinite(limits.maxCompressionRatio)
    || limits.maxCompressionRatio <= 0
  ) {
    throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 检查配额无效。')
  }
  return limits
}

/**
 * 只解析并检查 ZIP 中央目录，绝不读取、解压或执行任何条目正文。
 *
 * 检查器在浏览器 Worker 解压前拒绝 ZIP64、多磁盘、加密项、非 UTF-8 路径、
 * 路径穿越、大小写或 NFC 冲突、符号链接/设备文件以及声明的配额和压缩比异常。
 */
export function inspectZipCentralDirectory(
  bytes: Uint8Array,
  overrides: Partial<ZipCentralDirectoryLimits> = {},
): ZipCentralDirectoryInspection {
  const limits = resolveLimits(overrides)
  if (bytes.byteLength > limits.maxArchiveBytes) {
    throw new ZipCentralDirectoryError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP 压缩包超过大小上限。')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOffset = findEndOfCentralDirectory(view, bytes)
  const diskNumber = readUint16(view, bytes, endOffset + 4)
  const centralDirectoryDisk = readUint16(view, bytes, endOffset + 6)
  const entriesOnDisk = readUint16(view, bytes, endOffset + 8)
  const entryCount = readUint16(view, bytes, endOffset + 10)
  const centralDirectorySize = readUint32(view, bytes, endOffset + 12)
  const centralDirectoryOffset = readUint32(view, bytes, endOffset + 16)

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ZipCentralDirectoryError('ZIP_UNSUPPORTED_MULTIDISK', 'ZIP 不支持多磁盘归档。')
  }
  if (
    entryCount === 0xffff
    || centralDirectorySize === 0xffff_ffff
    || centralDirectoryOffset === 0xffff_ffff
  ) {
    throw new ZipCentralDirectoryError('ZIP_UNSUPPORTED_ZIP64', 'ZIP64 归档不受支持。')
  }
  if (entryCount > limits.maxEntryCount) {
    throw new ZipCentralDirectoryError('ZIP_ENTRY_COUNT_TOO_LARGE', 'ZIP 条目数量超过上限。')
  }
  if (centralDirectoryOffset + centralDirectorySize > endOffset) {
    throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 中央目录越出归档边界。')
  }

  const entries: ZipCentralDirectoryEntry[] = []
  const normalizedPaths = new Set<string>()
  const caseFoldedPaths = new Set<string>()
  let offset = centralDirectoryOffset
  let declaredUncompressedBytes = 0

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(bytes, offset, CENTRAL_DIRECTORY_FILE_HEADER_SIZE)
    if (readUint32(view, bytes, offset) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 中央目录条目签名无效。')
    }

    const versionMadeBy = readUint16(view, bytes, offset + 4)
    const flags = readUint16(view, bytes, offset + 8)
    const compressionMethod = readUint16(view, bytes, offset + 10)
    const compressedSize = readUint32(view, bytes, offset + 20)
    const uncompressedSize = readUint32(view, bytes, offset + 24)
    const fileNameLength = readUint16(view, bytes, offset + 28)
    const extraFieldLength = readUint16(view, bytes, offset + 30)
    const fileCommentLength = readUint16(view, bytes, offset + 32)
    const externalAttributes = readUint32(view, bytes, offset + 38)
    const localHeaderOffset = readUint32(view, bytes, offset + 42)
    const entryLength = CENTRAL_DIRECTORY_FILE_HEADER_SIZE + fileNameLength + extraFieldLength + fileCommentLength
    assertRange(bytes, offset, entryLength)

    const pathBytes = bytes.subarray(
      offset + CENTRAL_DIRECTORY_FILE_HEADER_SIZE,
      offset + CENTRAL_DIRECTORY_FILE_HEADER_SIZE + fileNameLength,
    )
    if (!(flags & UTF8_FILENAME_FLAG) && pathBytes.some((byte) => byte > 0x7f)) {
      throw new ZipCentralDirectoryError('ZIP_UTF8_PATH_INVALID', 'ZIP 条目未标记 UTF-8 文件名。')
    }
    if (flags & ENCRYPTED_ENTRY_FLAG) {
      throw new ZipCentralDirectoryError('ZIP_ENCRYPTED_ENTRY', 'ZIP 不支持加密条目。')
    }
    if (compressedSize === 0xffff_ffff || uncompressedSize === 0xffff_ffff || localHeaderOffset === 0xffff_ffff) {
      throw new ZipCentralDirectoryError('ZIP_UNSUPPORTED_ZIP64', 'ZIP 条目使用不受支持的 ZIP64 字段。')
    }

    const path = normalizeZipPath(pathBytes)
    const caseFoldedPath = path.toLocaleLowerCase('en-US')
    if (normalizedPaths.has(path) || caseFoldedPaths.has(caseFoldedPath)) {
      throw new ZipCentralDirectoryError('ZIP_DUPLICATE_PATH', 'ZIP 包含重复或大小写冲突路径。', path)
    }
    assertSafeExternalAttributes(versionMadeBy, externalAttributes, path)

    const isDirectory = path.endsWith('/')
    if (!isDirectory && uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new ZipCentralDirectoryError('ZIP_ENTRY_TOO_LARGE', 'ZIP 单个条目超过解压大小上限。', path)
    }
    const compressionRatio = uncompressedSize === 0
      ? 1
      : compressedSize === 0
        ? Number.POSITIVE_INFINITY
        : uncompressedSize / compressedSize
    if (!isDirectory && compressionRatio > limits.maxCompressionRatio) {
      throw new ZipCentralDirectoryError('ZIP_COMPRESSION_RATIO_TOO_HIGH', 'ZIP 条目声明压缩比异常。', path)
    }
    if (declaredUncompressedBytes + uncompressedSize > limits.maxDeclaredUncompressedBytes) {
      throw new ZipCentralDirectoryError('ZIP_DECLARED_SIZE_TOO_LARGE', 'ZIP 声明解压总大小超过上限。')
    }

    normalizedPaths.add(path)
    caseFoldedPaths.add(caseFoldedPath)
    declaredUncompressedBytes += uncompressedSize
    entries.push({
      path,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      compressionRatio,
      externalAttributes,
      localHeaderOffset,
      isDirectory,
    })
    offset += entryLength
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new ZipCentralDirectoryError('ZIP_CENTRAL_DIRECTORY_INVALID', 'ZIP 中央目录长度与条目声明不一致。')
  }

  return {
    entries,
    archiveBytes: bytes.byteLength,
    declaredUncompressedBytes,
  }
}
