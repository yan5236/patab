import { describe, expect, it } from 'vitest'

import { strToU8, zipSync } from 'fflate'

import { inspectZipCentralDirectory } from './centralDirectory.js'
import {
  createIntegrityDocument,
  verifyIntegrityDocument,
} from './integrity.js'
import {
  WIDGET_ED25519_SIGNATURE_BYTES,
  WIDGET_SIGNATURE_ALGORITHM,
  WIDGET_SIGNATURE_SCHEMA_VERSION,
  encodeWidgetSignatureBase64,
  verifyWidgetSignature,
} from './signature.js'

/** ZIP 中央目录条目签名，测试只用于修改不可信元数据以覆盖解压前安全边界。 */
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x0201_4b50

/** 创建 fflate ZIP 语料，所有条目均使用浏览器与 CLI 共享的唯一归档库。 */
function createArchive(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 9 })
}

/** 找到中央目录第一个条目，便于构造 Unix 符号链接攻击语料而无需读取正文。 */
function findFirstCentralDirectoryEntry(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) return offset
  }
  throw new Error('测试 ZIP 缺少中央目录条目')
}

/** 按 ZIP 小端字节序修改 16 位字段，用于将条目标记为 Unix 生成。 */
function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true)
}

/** 按 ZIP 小端字节序修改 32 位字段，用于写入 Unix 符号链接外部属性。 */
function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true)
}

/** 创建签名校验所需的最小完整 Manifest，字段只用于产生固定规范输入而不执行任何组件代码。 */
function createManifest(publicKey: string) {
  return {
    schemaVersion: 1 as const,
    apiVersion: '1' as const,
    id: 'com.example.corpus',
    version: '1.0.0',
    name: { default: 'Corpus' },
    description: { default: '恶意语料' },
    developer: { default: 'PaTab' },
    surfaces: { widget: { entry: 'surfaces/widget.html' as const, title: { default: 'Widget' } } },
    sizes: [{ w: 2 as const, h: 2 as const }],
    defaultSize: { w: 2 as const, h: 2 as const },
    assets: { icon: 'assets/icon.png' as const },
    publisher: { publicKey },
  }
}

/** 生成仅用于验签语料的 Ed25519 SPKI 公钥，签名内容可故意无效以测试拒绝路径。 */
async function createPublicKey(): Promise<string> {
  const keyPair = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  return encodeWidgetSignatureBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)))
}

/** 覆盖 ZIP 炸弹、路径、Unicode、符号链接、完整性和签名换钥的恶意导入语料。 */
describe('恶意组件包语料', () => {
  /** 验证中央目录会在解压前拒绝高压缩比、路径穿越、NFC/大小写冲突和 Unix 符号链接。 */
  it('拒绝 ZIP 炸弹、歧义路径和符号链接', () => {
    const bomb = createArchive({ 'payload.bin': new Uint8Array(256 * 1024) })
    expect(() => inspectZipCentralDirectory(bomb)).toThrow(/压缩比/)

    const traversal = createArchive({ '../escape.txt': strToU8('x') })
    expect(() => inspectZipCentralDirectory(traversal)).toThrow(/路径/)

    const unicodeConflict = createArchive({
      'assets/é.png': strToU8('one'),
      'assets/e\u0301.png': strToU8('two'),
    })
    expect(() => inspectZipCentralDirectory(unicodeConflict)).toThrow(/重复/)

    const caseConflict = createArchive({ 'assets/Icon.png': strToU8('one'), 'assets/icon.png': strToU8('two') })
    expect(() => inspectZipCentralDirectory(caseConflict)).toThrow(/重复/)

    const symbolicLink = createArchive({ 'assets/link.png': strToU8('target') })
    const centralOffset = findFirstCentralDirectoryEntry(symbolicLink)
    writeUint16(symbolicLink, centralOffset + 4, 0x0314)
    writeUint32(symbolicLink, centralOffset + 38, (0o120777 << 16) >>> 0)
    expect(() => inspectZipCentralDirectory(symbolicLink)).toThrow(/符号链接/)
  })

  /** 验证清单不能遗漏实际文件，也不能让未列入清单的额外文件在安装前详情阶段混入包内容。 */
  it('拒绝完整性缺失与额外文件', async () => {
    const files = [
      { path: 'patab.manifest.json', bytes: strToU8('{}') },
      { path: 'surfaces/widget.html', bytes: strToU8('<main />') },
    ]
    const integrity = await createIntegrityDocument(files)

    await expect(verifyIntegrityDocument(integrity, [files[0]!])).rejects.toMatchObject({ code: 'INTEGRITY_FILE_MISSING' })
    await expect(verifyIntegrityDocument(integrity, [...files, { path: 'unexpected.js', bytes: strToU8('x') }])).rejects.toMatchObject({
      code: 'INTEGRITY_EXTRA_FILE',
    })
  })

  /** 验证无效 Ed25519 签名不会降级为 unsigned，且已安装组件的不同有效 SPKI 会优先进入换钥状态。 */
  it('拒绝无效签名并识别发布者换钥', async () => {
    const currentPublicKey = await createPublicKey()
    const previousPublicKey = await createPublicKey()
    const manifest = createManifest(currentPublicKey)
    const integrity = await createIntegrityDocument([{ path: 'patab.manifest.json', bytes: strToU8('{}') }])
    const signatureDocument = {
      schemaVersion: WIDGET_SIGNATURE_SCHEMA_VERSION,
      algorithm: WIDGET_SIGNATURE_ALGORITHM,
      signature: encodeWidgetSignatureBase64(new Uint8Array(WIDGET_ED25519_SIGNATURE_BYTES)),
    } as const

    await expect(verifyWidgetSignature({ manifest, integrity, signatureDocument })).resolves.toEqual({ status: 'invalid' })
    await expect(verifyWidgetSignature({
      manifest,
      integrity,
      signatureDocument,
      knownPublisherPublicKey: previousPublicKey,
    })).resolves.toEqual({ status: 'publisher-key-changed' })
  })
})
