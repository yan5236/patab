import { describe, expect, it } from 'vitest'

import { strFromU8, strToU8, zipSync } from 'fflate'

import {
  executeBrowserUnzipWorkerRequest,
  unzipBrowserArchiveInWorker,
} from './browserUnzipWorker.js'

/** ZIP 中央目录文件头签名，测试仅定点伪造声明大小，不读取或解压正文。 */
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x0201_4b50

/**
 * 生成只含文本文件的最小 ZIP，用于验证 Worker 的实际流式输出而非同步解压实现。
 */
function createArchive(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  ))
}

/**
 * 找到 ZIP 中第 index 个中央目录记录，为伪造声明尺寸而保留本地文件正文的实际尺寸。
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
 * 用小端字节序修改中央目录的 32 位声明字段，使中央目录预检可通过而实际流输出会触发配额保护。
 */
function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true)
}

/**
 * 复制 Uint8Array 的精确视图范围为独立 ArrayBuffer，模拟通过 postMessage 传入 Worker 的归档载荷。
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * 覆盖浏览器端流式解压的成功、实际大小保护和稳定协议错误，所有断言均不依赖底层解压器错误文本。
 */
describe('浏览器 ZIP 流式解压 Worker', () => {
  /**
   * 验证 Worker 先通过中央目录检查，再以 fflate 文件流逐块收集合法文件并返回真实统计值。
   */
  it('流式解压合法归档并返回经过实际核验的文件', async () => {
    const archive = toArrayBuffer(createArchive({
      'patab.manifest.json': '{}',
      'surfaces/widget.html': '<main>组件</main>',
    }))

    const result = await unzipBrowserArchiveInWorker(archive)

    expect(result.actualEntryCount).toBe(2)
    expect(result.actualUncompressedBytes).toBeGreaterThan(0)
    expect(result.files.map((file) => file.path)).toEqual([
      'patab.manifest.json',
      'surfaces/widget.html',
    ])
    expect(strFromU8(result.files[1].bytes)).toBe('<main>组件</main>')
  })

  /**
   * 验证即使中央目录伪造了较小尺寸，Worker 仍会在真实输出越过单文件上限时拒绝且不返回部分文件。
   */
  it('拒绝实际解压尺寸超过单文件上限的伪造归档', async () => {
    const archive = createArchive({ 'payload.txt': '实际解压内容超过声明值' })
    writeUint32(archive, findCentralDirectoryEntry(archive, 0) + 24, 1)

    const response = await executeBrowserUnzipWorkerRequest({
      type: 'unzip',
      requestId: 'actual-entry-limit',
      archive: toArrayBuffer(archive),
      limits: { maxEntryUncompressedBytes: 2 },
    })

    expect(response).toEqual({
      type: 'unzip-error',
      requestId: 'actual-entry-limit',
      error: { code: 'ZIP_ACTUAL_ENTRY_TOO_LARGE', path: 'payload.txt' },
    })
  })

  /**
   * 验证多文件的实际输出总和同样不信任中央目录声明，超过总配额时不返回任何部分文件。
   */
  it('拒绝实际解压总大小超过上限的伪造归档', async () => {
    const archive = createArchive({
      'first.txt': '123',
      'second.txt': '456',
    })
    writeUint32(archive, findCentralDirectoryEntry(archive, 0) + 24, 1)
    writeUint32(archive, findCentralDirectoryEntry(archive, 1) + 24, 1)

    const response = await executeBrowserUnzipWorkerRequest({
      type: 'unzip',
      requestId: 'actual-total-limit',
      archive: toArrayBuffer(archive),
      limits: {
        maxEntryUncompressedBytes: 10,
        maxDeclaredUncompressedBytes: 5,
      },
    })

    expect(response).toEqual({
      type: 'unzip-error',
      requestId: 'actual-total-limit',
      error: { code: 'ZIP_ACTUAL_SIZE_TOO_LARGE' },
    })
  })

  /**
   * 验证协议会保留中央目录检查的稳定错误码，并且不会尝试进入 fflate 解压阶段。
   */
  it('将中央目录拒绝映射为稳定 Worker 协议错误', async () => {
    const response = await executeBrowserUnzipWorkerRequest({
      type: 'unzip',
      requestId: 'invalid-archive',
      archive: new ArrayBuffer(0),
    })

    expect(response).toEqual({
      type: 'unzip-error',
      requestId: 'invalid-archive',
      error: { code: 'ZIP_CENTRAL_DIRECTORY_INVALID' },
    })
  })
})
