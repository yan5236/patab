import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

import { canonicalizeJsonToBytes } from './canonicalJson.js'
import {
  serializeIntegrityDocument,
  type WidgetIntegrityDocument,
} from './integrity.js'

/** 签名文件格式的初始版本号。 */
export const WIDGET_SIGNATURE_SCHEMA_VERSION = 1

/** 签名文件唯一允许的算法名称。 */
export const WIDGET_SIGNATURE_ALGORITHM = 'ed25519'

/** Ed25519 固定签名字节长度。 */
export const WIDGET_ED25519_SIGNATURE_BYTES = 64

/** 签名文件中可序列化的固定公开字段。 */
export interface WidgetSignatureDocument {
  readonly schemaVersion: typeof WIDGET_SIGNATURE_SCHEMA_VERSION
  readonly algorithm: typeof WIDGET_SIGNATURE_ALGORITHM
  readonly signature: string
}

/** 签名验证的可观察状态，明确区分未签名、无效和发布者换钥。 */
export type WidgetSignatureVerificationStatus = 'invalid' | 'publisher-key-changed' | 'unsigned' | 'valid'

/** 签名验证完成后给导入详情和更新流程使用的最小结果。 */
export interface WidgetSignatureVerification {
  readonly status: WidgetSignatureVerificationStatus
}

/** 签名文档、编码或加密环境异常时使用的稳定错误码。 */
export type WidgetSignatureErrorCode =
  | 'SIGNATURE_CRYPTO_UNAVAILABLE'
  | 'SIGNATURE_DOCUMENT_INVALID'
  | 'SIGNATURE_PAYLOAD_INVALID'

/**
 * 表示签名处理不能继续的安全错误，不包含公钥、签名、包正文或 Web Crypto 底层异常。
 */
export class WidgetSignatureError extends Error {
  /**
   * 创建只含稳定错误码的签名错误，供宿主和 CLI 输出一致的安全诊断。
   */
  constructor(
    readonly code: WidgetSignatureErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WidgetSignatureError'
  }
}

/**
 * 以严格标准 Base64 格式解码不可信字段，拒绝空白、URL-safe 变体和隐式填充以保证跨端字节一致。
 */
function decodeBase64(value: string, errorCode: WidgetSignatureErrorCode): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new WidgetSignatureError(errorCode, '签名字段不是规范 Base64。')
  }

  try {
    const binary = globalThis.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    throw new WidgetSignatureError(errorCode, '签名字段不是规范 Base64。')
  }
}

/**
 * 以固定标准 Base64 格式输出字节，供测试和 CLI 使用时与浏览器 atob 输入严格对应。
 */
export function encodeWidgetSignatureBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

/**
 * 将未知 JSON 值收窄为固定签名文档，拒绝额外字段、原型污染和非 Ed25519 算法声明。
 */
function normalizeSignatureDocument(value: unknown): WidgetSignatureDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new WidgetSignatureError('SIGNATURE_DOCUMENT_INVALID', '签名文件不是普通对象。')
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'algorithm,schemaVersion,signature') {
    throw new WidgetSignatureError('SIGNATURE_DOCUMENT_INVALID', '签名文件字段无效。')
  }
  if (
    record.schemaVersion !== WIDGET_SIGNATURE_SCHEMA_VERSION
    || record.algorithm !== WIDGET_SIGNATURE_ALGORITHM
    || typeof record.signature !== 'string'
  ) {
    throw new WidgetSignatureError('SIGNATURE_DOCUMENT_INVALID', '签名文件版本或算法无效。')
  }

  const signatureBytes = decodeBase64(record.signature, 'SIGNATURE_DOCUMENT_INVALID')
  if (signatureBytes.byteLength !== WIDGET_ED25519_SIGNATURE_BYTES) {
    throw new WidgetSignatureError('SIGNATURE_DOCUMENT_INVALID', 'Ed25519 签名字节长度无效。')
  }
  return {
    schemaVersion: WIDGET_SIGNATURE_SCHEMA_VERSION,
    algorithm: WIDGET_SIGNATURE_ALGORITHM,
    signature: record.signature,
  }
}

/**
 * 从 UTF-8 `signature.json` 文本解析严格签名文档，任何 JSON 语法或字段异常均映射为稳定错误码。
 */
export function parseWidgetSignatureDocument(source: string): WidgetSignatureDocument {
  try {
    return normalizeSignatureDocument(JSON.parse(source))
  } catch (error) {
    if (error instanceof WidgetSignatureError) throw error
    throw new WidgetSignatureError('SIGNATURE_DOCUMENT_INVALID', '签名文件不是有效 JSON。')
  }
}

/**
 * 比较两个公钥的原始字节，避免仅因 Base64 表示差异造成发布者换钥判断不稳定。
 */
function areEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!
  }
  return difference === 0
}

/**
 * 从 Manifest 与完整性清单构造唯一的规范签名输入，固定外层字段避免拼接歧义。
 */
export function createWidgetSignaturePayload(
  manifest: PatabWidgetManifestV1,
  integrity: WidgetIntegrityDocument,
): Uint8Array {
  try {
    const normalizedIntegrity = JSON.parse(serializeIntegrityDocument(integrity)) as WidgetIntegrityDocument
    return canonicalizeJsonToBytes({ integrity: normalizedIntegrity, manifest })
  } catch (error) {
    if (error instanceof WidgetSignatureError) throw error
    throw new WidgetSignatureError('SIGNATURE_PAYLOAD_INVALID', '签名输入不是可规范化的 Manifest 与完整性清单。')
  }
}

/**
 * 取得当前环境的 Web Crypto 验签能力；浏览器和 Node 22+ 都必须使用同一 SubtleCrypto 路径。
 */
function getSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new WidgetSignatureError('SIGNATURE_CRYPTO_UNAVAILABLE', '当前环境不支持 Ed25519 签名验证。')
  }
  return subtle
}

/**
 * 验证可选签名，并在不泄露密钥或签名内容的前提下区分未签名、无效签名和已安装发布者换钥。
 */
export async function verifyWidgetSignature(input: {
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signatureDocument?: WidgetSignatureDocument
  readonly knownPublisherPublicKey?: string
}): Promise<WidgetSignatureVerification> {
  if (!input.signatureDocument) {
    return { status: 'unsigned' }
  }

  const signatureDocument = normalizeSignatureDocument(input.signatureDocument)
  const publisherPublicKey = input.manifest.publisher?.publicKey
  if (!publisherPublicKey) {
    return { status: 'invalid' }
  }

  let publicKeyBytes: Uint8Array
  let signatureBytes: Uint8Array
  try {
    publicKeyBytes = decodeBase64(publisherPublicKey, 'SIGNATURE_DOCUMENT_INVALID')
    signatureBytes = decodeBase64(signatureDocument.signature, 'SIGNATURE_DOCUMENT_INVALID')
  } catch {
    return { status: 'invalid' }
  }

  if (input.knownPublisherPublicKey) {
    try {
      const knownKeyBytes = decodeBase64(input.knownPublisherPublicKey, 'SIGNATURE_DOCUMENT_INVALID')
      if (!areEqualBytes(publicKeyBytes, knownKeyBytes)) {
        return { status: 'publisher-key-changed' }
      }
    } catch {
      return { status: 'publisher-key-changed' }
    }
  }

  const subtle = getSubtleCrypto()
  try {
    const publicKey = await subtle.importKey('spki', publicKeyBytes, { name: 'Ed25519' }, false, ['verify'])
    const isValid = await subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBytes,
      createWidgetSignaturePayload(input.manifest, input.integrity),
    )
    return { status: isValid ? 'valid' : 'invalid' }
  } catch (error) {
    if (error instanceof WidgetSignatureError) throw error
    return { status: 'invalid' }
  }
}
