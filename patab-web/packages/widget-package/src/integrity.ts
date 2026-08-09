import {
  canonicalizeJson,
  canonicalizeJsonToBytes,
} from './canonicalJson.js'

/** 完整性清单当前固定使用的 SHA-256 算法标识。 */
export const INTEGRITY_HASH_ALGORITHM = 'sha256'

/** 完整性清单格式的初始版本号。 */
export const INTEGRITY_SCHEMA_VERSION = 1

/** 完整性清单自身不应出现在被校验文件集合中的路径。 */
export const INTEGRITY_DOCUMENT_PATH = 'integrity.json'

/** 可选签名文件不应出现在被校验文件集合中的路径。 */
export const SIGNATURE_DOCUMENT_PATH = 'signature.json'

/** 构建或验证完整性清单时使用的未哈希文件输入。 */
export interface IntegrityFileContent {
  readonly path: string
  readonly bytes: Uint8Array
}

/** 完整性清单中单个按路径排序的 SHA-256 摘要。 */
export interface IntegrityFileDigest {
  readonly path: string
  readonly sha256: string
}

/** 可序列化、可签名的 PaTab 完整性清单格式。 */
export interface WidgetIntegrityDocument {
  readonly schemaVersion: typeof INTEGRITY_SCHEMA_VERSION
  readonly algorithm: typeof INTEGRITY_HASH_ALGORITHM
  readonly files: readonly IntegrityFileDigest[]
}

/** 完整性校验失败时的稳定错误码。 */
export type IntegrityErrorCode =
  | 'HASH_UNAVAILABLE'
  | 'INTEGRITY_DOCUMENT_INVALID'
  | 'INTEGRITY_EXTRA_FILE'
  | 'INTEGRITY_FILE_MISSING'
  | 'INTEGRITY_HASH_MISMATCH'
  | 'INTEGRITY_PATH_INVALID'

/**
 * 表示完整性输入或结果不安全的稳定错误，不暴露文件内容、哈希前正文或底层异常。
 */
export class IntegrityError extends Error {
  /**
   * 创建带可选相对文件路径的完整性错误，供导入端和 CLI 复用同一安全诊断。
   */
  constructor(
    readonly code: IntegrityErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'IntegrityError'
  }
}

/**
 * 将字节摘要转为固定小写十六进制，避免浏览器与 Node 对 Buffer 表示的依赖。
 */
function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 校验完整性路径为统一 NFC、Unix 分隔且无绝对、穿越或保留文件歧义的相对文件路径。
 */
function assertIntegrityPath(path: string): void {
  if (
    !path
    || path.normalize('NFC') !== path
    || path.includes('\\')
    || path.includes('\0')
    || path.startsWith('/')
    || /^[A-Za-z]:/.test(path)
  ) {
    throw new IntegrityError('INTEGRITY_PATH_INVALID', '完整性清单包含无效文件路径。', path)
  }

  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') || path.endsWith('/')) {
    throw new IntegrityError('INTEGRITY_PATH_INVALID', '完整性清单包含无效文件路径。', path)
  }
  if (path === INTEGRITY_DOCUMENT_PATH || path === SIGNATURE_DOCUMENT_PATH) {
    throw new IntegrityError('INTEGRITY_PATH_INVALID', '完整性清单不能包含自身或签名文件。', path)
  }
}

/**
 * 用 UTF-16 代码单元执行纯字典序比较，避免 localeCompare 随浏览器或 Node 的区域实现变化。
 */
function compareIntegrityPaths(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * 校验文件输入中路径唯一且按 UTF-16 字典序递增，确保任意首个错误和签名输入在两端稳定。
 */
function assertSortedUniqueDigests(files: readonly IntegrityFileDigest[]): void {
  let previousPath: string | undefined
  for (const file of files) {
    assertIntegrityPath(file.path)
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单包含无效 SHA-256 摘要。', file.path)
    }
    if (previousPath !== undefined && previousPath >= file.path) {
      throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单路径必须唯一且按字典序排列。', file.path)
    }
    previousPath = file.path
  }
}

/**
 * 将未知 JSON 值收窄为只包含指定字段的完整性清单，拒绝额外字段和原型污染输入。
 */
function normalizeIntegrityDocument(value: unknown): WidgetIntegrityDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单不是普通对象。')
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'algorithm,files,schemaVersion') {
    throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单字段无效。')
  }
  if (record.schemaVersion !== INTEGRITY_SCHEMA_VERSION || record.algorithm !== INTEGRITY_HASH_ALGORITHM || !Array.isArray(record.files)) {
    throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单版本或算法无效。')
  }

  const files = record.files.map((entry): IntegrityFileDigest => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.getPrototypeOf(entry) !== Object.prototype) {
      throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单条目无效。')
    }
    const file = entry as Record<string, unknown>
    if (Object.keys(file).sort().join(',') !== 'path,sha256' || typeof file.path !== 'string' || typeof file.sha256 !== 'string') {
      throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单条目字段无效。')
    }
    return { path: file.path, sha256: file.sha256 }
  })
  assertSortedUniqueDigests(files)

  return {
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    algorithm: INTEGRITY_HASH_ALGORITHM,
    files,
  }
}

/**
 * 从 UTF-8 JSON 文本解析并严格校验完整性清单，避免导入端把未知字段带入签名或比较流程。
 */
export function parseIntegrityDocument(source: string): WidgetIntegrityDocument {
  try {
    return normalizeIntegrityDocument(JSON.parse(source))
  } catch (error) {
    if (error instanceof IntegrityError) throw error
    throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性清单不是有效 JSON。')
  }
}

/**
 * 使用浏览器与 Node 22 均支持的 Web Crypto SHA-256 生成小写十六进制摘要。
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new IntegrityError('HASH_UNAVAILABLE', '当前环境不支持 SHA-256 校验。')
  }

  try {
    const digestInput = new Uint8Array(bytes.byteLength)
    digestInput.set(bytes)
    const digest = await subtle.digest('SHA-256', digestInput)
    return encodeHex(new Uint8Array(digest))
  } catch (error) {
    if (error instanceof IntegrityError) throw error
    throw new IntegrityError('HASH_UNAVAILABLE', '当前环境无法执行 SHA-256 校验。')
  }
}

/**
 * 基于未哈希文件内容创建按路径字典序排列的完整性清单，排除清单自身和可选签名文件。
 */
export async function createIntegrityDocument(files: readonly IntegrityFileContent[]): Promise<WidgetIntegrityDocument> {
  const sortedFiles = [...files].sort((left, right) => compareIntegrityPaths(left.path, right.path))
  const digests: IntegrityFileDigest[] = []
  let previousPath: string | undefined

  for (const file of sortedFiles) {
    assertIntegrityPath(file.path)
    if (previousPath === file.path) {
      throw new IntegrityError('INTEGRITY_DOCUMENT_INVALID', '完整性输入包含重复文件路径。', file.path)
    }
    digests.push({ path: file.path, sha256: await sha256Hex(file.bytes) })
    previousPath = file.path
  }

  assertSortedUniqueDigests(digests)
  return {
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    algorithm: INTEGRITY_HASH_ALGORITHM,
    files: digests,
  }
}

/**
 * 将已经校验的完整性清单输出为规范 JSON，供 CLI 写入 ZIP 与后续 Ed25519 签名使用。
 */
export function serializeIntegrityDocument(document: WidgetIntegrityDocument): string {
  const normalized = normalizeIntegrityDocument(document)
  return canonicalizeJson(normalized)
}

/**
 * 将已经校验的完整性清单输出为规范 UTF-8 字节，确保浏览器和 Node 的签名输入一致。
 */
export function serializeIntegrityDocumentToBytes(document: WidgetIntegrityDocument): Uint8Array {
  const normalized = normalizeIntegrityDocument(document)
  return canonicalizeJsonToBytes(normalized)
}

/**
 * 逐个重新计算实际文件的 SHA-256，并拒绝缺失、额外或内容变化，保持首个失败路径稳定。
 */
export async function verifyIntegrityDocument(
  document: WidgetIntegrityDocument,
  files: readonly IntegrityFileContent[],
): Promise<void> {
  const normalized = normalizeIntegrityDocument(document)
  const actualFiles = [...files].sort((left, right) => compareIntegrityPaths(left.path, right.path))
  let previousPath: string | undefined

  for (const file of actualFiles) {
    assertIntegrityPath(file.path)
    if (previousPath === file.path) {
      throw new IntegrityError('INTEGRITY_EXTRA_FILE', '归档包含重复文件路径。', file.path)
    }
    previousPath = file.path
  }

  let expectedIndex = 0
  let actualIndex = 0
  while (expectedIndex < normalized.files.length || actualIndex < actualFiles.length) {
    const expected = normalized.files[expectedIndex]
    const actual = actualFiles[actualIndex]
    if (!actual || (expected && expected.path < actual.path)) {
      throw new IntegrityError('INTEGRITY_FILE_MISSING', '完整性清单引用的文件缺失。', expected?.path)
    }
    if (!expected || actual.path < expected.path) {
      throw new IntegrityError('INTEGRITY_EXTRA_FILE', '归档包含未列入完整性清单的文件。', actual.path)
    }

    const actualHash = await sha256Hex(actual.bytes)
    if (actualHash !== expected.sha256) {
      throw new IntegrityError('INTEGRITY_HASH_MISMATCH', '文件 SHA-256 与完整性清单不匹配。', actual.path)
    }
    expectedIndex += 1
    actualIndex += 1
  }
}
