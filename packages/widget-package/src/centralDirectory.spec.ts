import { describe, expect, it } from 'vitest'

import { strToU8, zipSync } from 'fflate'

import {
  ZipCentralDirectoryError,
  inspectZipCentralDirectory,
} from './centralDirectory.js'

/** ZIP 中央目录文件头签名，测试仅用于定点篡改声明元数据而不解压正文。 */
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x0201_4b50

/**
 * 生成只含 UTF-8 文本条目的最小 fflate ZIP，供中央目录检查器测试使用。
 */
function createArchive(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  ))
}

/**
 * 找到第 index 个中央目录条目，允许测试只篡改元数据而保留压缩正文不被读取的前提。
 */
function findCentralDirectoryEntry(bytes: Uint8Array, index: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let found = 0
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) continue
    if (found === index) return offset
    found += 1
  }
  throw new Error(`测试 ZIP 缺少第 ${index} 个中央目录条目`)
}

/**
 * 用小端字节序修改 ZIP 中央目录的 16 位声明字段。
 */
function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true)
}

/**
 * 用小端字节序修改 ZIP 中央目录的 32 位声明字段。
 */
function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true)
}

/**
 * 断言检查器以期望稳定错误码拒绝不可信 ZIP，避免测试依赖中文错误文本。
 */
function expectZipError(callback: () => unknown, code: ZipCentralDirectoryError['code']): void {
  expect(callback).toThrowError(ZipCentralDirectoryError)
  try {
    callback()
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

/**
 * 覆盖 ZIP 中央目录的无解压安全边界，包括路径、配额、压缩比和 Unix 外部属性。
 */
describe('ZIP 中央目录检查器', () => {
  /**
   * 验证正常 UTF-8 条目只通过中央目录读取即可返回路径、大小和归档摘要。
   */
  it('检查合法 UTF-8 条目而不读取正文', () => {
    const inspection = inspectZipCentralDirectory(createArchive({
      'patab.manifest.json': '{}',
      'surfaces/widget.html': '<main>组件</main>',
    }))

    expect(inspection.entries.map((entry) => entry.path)).toEqual([
      'patab.manifest.json',
      'surfaces/widget.html',
    ])
    expect(inspection.declaredUncompressedBytes).toBeGreaterThan(0)
  })

  /**
   * 验证路径穿越、规范化重复和大小写冲突都在解压前拒绝。
   */
  it('拒绝穿越、重复和大小写冲突路径', () => {
    expectZipError(
      () => inspectZipCentralDirectory(createArchive({ '../evil.txt': 'x' })),
      'ZIP_PATH_INVALID',
    )

    const duplicate = createArchive({ 'first.txt': 'one', 'other.txt': 'two' })
    const firstOffset = findCentralDirectoryEntry(duplicate, 0)
    const secondOffset = findCentralDirectoryEntry(duplicate, 1)
    const firstNameLength = new DataView(duplicate.buffer, duplicate.byteOffset, duplicate.byteLength).getUint16(firstOffset + 28, true)
    duplicate.set(duplicate.subarray(firstOffset + 46, firstOffset + 46 + firstNameLength), secondOffset + 46)
    expectZipError(() => inspectZipCentralDirectory(duplicate), 'ZIP_DUPLICATE_PATH')

    expectZipError(
      () => inspectZipCentralDirectory(createArchive({ 'one.txt': 'one', 'ONE.txt': 'two' })),
      'ZIP_DUPLICATE_PATH',
    )
  })

  /**
   * 验证声明解压大小、压缩比、特殊 Unix 文件属性与非 UTF-8 标记不会进入后续解压阶段。
   */
  it('拒绝异常大小、压缩比、特殊文件和非 UTF-8 路径', () => {
    const oversized = createArchive({ 'large.txt': 'x' })
    writeUint32(oversized, findCentralDirectoryEntry(oversized, 0) + 24, 5 * 1024 * 1024 + 1)
    expectZipError(() => inspectZipCentralDirectory(oversized), 'ZIP_ENTRY_TOO_LARGE')

    const suspiciousRatio = createArchive({ 'ratio.txt': 'x' })
    const ratioOffset = findCentralDirectoryEntry(suspiciousRatio, 0)
    writeUint32(suspiciousRatio, ratioOffset + 20, 1)
    writeUint32(suspiciousRatio, ratioOffset + 24, 101)
    expectZipError(() => inspectZipCentralDirectory(suspiciousRatio), 'ZIP_COMPRESSION_RATIO_TOO_HIGH')

    const symbolicLink = createArchive({ 'link.txt': 'target' })
    const linkOffset = findCentralDirectoryEntry(symbolicLink, 0)
    writeUint16(symbolicLink, linkOffset + 4, 0x0314)
    writeUint32(symbolicLink, linkOffset + 38, (0o120777 << 16) >>> 0)
    expectZipError(() => inspectZipCentralDirectory(symbolicLink), 'ZIP_UNSUPPORTED_SPECIAL_FILE')

    const invalidUtf8 = createArchive({ 'utf8.txt': 'x' })
    const utf8Offset = findCentralDirectoryEntry(invalidUtf8, 0)
    invalidUtf8[utf8Offset + 46] = 0xff
    expectZipError(() => inspectZipCentralDirectory(invalidUtf8), 'ZIP_UTF8_PATH_INVALID')
  })
})
