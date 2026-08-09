import { AsyncUnzipInflate, Unzip, type UnzipFile } from 'fflate'

import {
  DEFAULT_ZIP_CENTRAL_DIRECTORY_LIMITS,
  ZipCentralDirectoryError,
  inspectZipCentralDirectory,
  type ZipCentralDirectoryErrorCode,
  type ZipCentralDirectoryInspection,
  type ZipCentralDirectoryLimits,
} from './centralDirectory.js'

/** 每次向 fflate ZIP 流推进的压缩输入块大小，避免 Worker 对整个归档执行单次解压调用。 */
const ZIP_STREAM_INPUT_CHUNK_BYTES = 64 * 1024

/** Worker 在实际解压阶段返回的稳定安全错误码，不暴露 fflate 底层异常文本。 */
export type BrowserUnzipWorkerErrorCode =
  | ZipCentralDirectoryErrorCode
  | 'ZIP_ACTUAL_ENTRY_COUNT_TOO_LARGE'
  | 'ZIP_ACTUAL_ENTRY_TOO_LARGE'
  | 'ZIP_ACTUAL_SIZE_TOO_LARGE'
  | 'ZIP_STREAM_ENTRY_MISMATCH'
  | 'ZIP_STREAM_INVALID'

/** 表示浏览器 Worker 解压过程中检测到的稳定安全错误。 */
export class BrowserUnzipWorkerError extends Error {
  /**
   * 创建不携带 ZIP 正文、绝对路径或解压器原始异常的 Worker 错误。
   */
  constructor(
    readonly code: Exclude<BrowserUnzipWorkerErrorCode, ZipCentralDirectoryErrorCode>,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'BrowserUnzipWorkerError'
  }
}

/** 描述 Worker 成功解压并已逐块核验的单个 ZIP 文件。 */
export interface BrowserUnzipWorkerFile {
  readonly path: string
  readonly bytes: Uint8Array
}

/** 描述浏览器 Worker 成功结果，文件仅在所有实际配额检查通过后才会公开。 */
export interface BrowserUnzipWorkerResult {
  readonly files: readonly BrowserUnzipWorkerFile[]
  readonly inspection: ZipCentralDirectoryInspection
  readonly actualEntryCount: number
  readonly actualUncompressedBytes: number
}

/** 描述发送给浏览器 ZIP 解压 Worker 的单次请求。 */
export interface BrowserUnzipWorkerRequest {
  readonly type: 'unzip'
  readonly requestId: string
  readonly archive: ArrayBuffer
  readonly limits?: Partial<ZipCentralDirectoryLimits>
}

/** 描述浏览器 ZIP 解压 Worker 成功时返回的消息。 */
export interface BrowserUnzipWorkerSuccessResponse {
  readonly type: 'unzip-success'
  readonly requestId: string
  readonly result: BrowserUnzipWorkerResult
}

/** 描述浏览器 ZIP 解压 Worker 拒绝不可信归档时返回的安全错误消息。 */
export interface BrowserUnzipWorkerErrorResponse {
  readonly type: 'unzip-error'
  readonly requestId: string
  readonly error: {
    readonly code: BrowserUnzipWorkerErrorCode
    readonly path?: string
  }
}

/** 描述浏览器 ZIP 解压 Worker 的全部响应消息。 */
export type BrowserUnzipWorkerResponse =
  | BrowserUnzipWorkerSuccessResponse
  | BrowserUnzipWorkerErrorResponse

/**
 * 描述实际 Worker 所需的最小消息端口能力，以便测试无需 Node Worker 或浏览器全局对象。
 */
export interface BrowserUnzipWorkerPort {
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void
  postMessage(message: BrowserUnzipWorkerResponse, transfer?: readonly ArrayBuffer[]): void
}

/**
 * 将调用方提供的配额合并为完整值，并与中央目录检查器保持完全相同的有效性规则。
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
    throw new BrowserUnzipWorkerError('ZIP_STREAM_INVALID', 'ZIP 解压配额无效。')
  }
  return limits
}

/**
 * 终止当前已发现的 fflate 文件流；即使某个流没有后台解压 Worker，此调用也会阻止后续数据被保留。
 */
function terminateFiles(files: readonly UnzipFile[]): void {
  for (const file of files) {
    file.terminate()
  }
}

/**
 * 将经过逐块限制检查的临时片段合并为完整文件，仅在整个归档安全完成后调用。
 */
function joinChunks(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * 将任意解压阶段异常映射为公开稳定错误码，避免把 fflate 的版本相关异常暴露给组件安装方。
 */
function toSafeWorkerError(error: unknown): ZipCentralDirectoryError | BrowserUnzipWorkerError {
  if (error instanceof ZipCentralDirectoryError || error instanceof BrowserUnzipWorkerError) {
    return error
  }
  return new BrowserUnzipWorkerError('ZIP_STREAM_INVALID', 'ZIP 流式解压失败。')
}

/**
 * 在浏览器 Worker 内以 fflate 的 Unzip/AsyncUnzipInflate 流逐块解压 ZIP。
 *
 * 本函数始终先检查中央目录，再对每个实际输出块累计文件数与解压字节数；一旦发现实际值超限，
 * 会立即终止已发现的流并清空所有临时片段，因此失败路径绝不会返回任何部分文件。
 */
export function unzipBrowserArchiveInWorker(
  archive: ArrayBuffer,
  overrides: Partial<ZipCentralDirectoryLimits> = {},
): Promise<BrowserUnzipWorkerResult> {
  const source = new Uint8Array(archive)
  const inspection = inspectZipCentralDirectory(source, overrides)
  const limits = resolveLimits(overrides)
  const expectedPaths = new Set(inspection.entries.map((entry) => entry.path))

  return new Promise((resolve, reject) => {
    const chunksByPath = new Map<string, Uint8Array[]>()
    const byteLengthsByPath = new Map<string, number>()
    const activeFiles: UnzipFile[] = []
    let actualEntryCount = 0
    let actualUncompressedBytes = 0
    let completedEntryCount = 0
    let inputFinished = false
    let settled = false

    /**
     * 以唯一出口拒绝当前归档，并同步终止流和清空全部暂存片段，防止部分结果逃逸。
     */
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      terminateFiles(activeFiles)
      chunksByPath.clear()
      byteLengthsByPath.clear()
      reject(toSafeWorkerError(error))
    }

    /**
     * 在所有已发现文件都收到 final 块后确认中央目录与实际本地记录一致，并提交不可变结果。
     */
    const finishIfReady = (): void => {
      if (settled || !inputFinished || completedEntryCount !== actualEntryCount) return
      if (actualEntryCount !== inspection.entries.length || chunksByPath.size !== expectedPaths.size) {
        fail(new BrowserUnzipWorkerError('ZIP_STREAM_ENTRY_MISMATCH', 'ZIP 流式条目与中央目录不一致。'))
        return
      }

      let files: BrowserUnzipWorkerFile[]
      try {
        files = inspection.entries.map((entry) => {
          const chunks = chunksByPath.get(entry.path)
          const byteLength = byteLengthsByPath.get(entry.path)
          if (!chunks || byteLength === undefined) {
            throw new BrowserUnzipWorkerError('ZIP_STREAM_ENTRY_MISMATCH', 'ZIP 流式条目与中央目录不一致。', entry.path)
          }
          return { path: entry.path, bytes: joinChunks(chunks, byteLength) }
        })
      } catch (error) {
        fail(error)
        return
      }

      settled = true
      chunksByPath.clear()
      byteLengthsByPath.clear()
      resolve({ files, inspection, actualEntryCount, actualUncompressedBytes })
    }

    /**
     * 注册每个 fflate 文件流，按输出块检查真实条目大小与真实总大小，且不信任本地记录中的路径或数量。
     */
    const handleFile = (file: UnzipFile): void => {
      if (settled) {
        file.terminate()
        return
      }

      const path = file.name.normalize('NFC')
      actualEntryCount += 1
      activeFiles.push(file)
      if (actualEntryCount > limits.maxEntryCount) {
        fail(new BrowserUnzipWorkerError('ZIP_ACTUAL_ENTRY_COUNT_TOO_LARGE', 'ZIP 实际条目数量超过上限。'))
        return
      }
      if (!expectedPaths.has(path) || chunksByPath.has(path)) {
        fail(new BrowserUnzipWorkerError('ZIP_STREAM_ENTRY_MISMATCH', 'ZIP 流式条目与中央目录不一致。', path))
        return
      }

      const chunks: Uint8Array[] = []
      chunksByPath.set(path, chunks)
      byteLengthsByPath.set(path, 0)
      file.ondata = (error, chunk, final) => {
        if (settled) return
        if (error || !chunk) {
          fail(error)
          return
        }

        const nextEntryBytes = (byteLengthsByPath.get(path) ?? 0) + chunk.byteLength
        const nextArchiveBytes = actualUncompressedBytes + chunk.byteLength
        if (nextEntryBytes > limits.maxEntryUncompressedBytes) {
          fail(new BrowserUnzipWorkerError('ZIP_ACTUAL_ENTRY_TOO_LARGE', 'ZIP 单个条目的实际解压大小超过上限。', path))
          return
        }
        if (nextArchiveBytes > limits.maxDeclaredUncompressedBytes) {
          fail(new BrowserUnzipWorkerError('ZIP_ACTUAL_SIZE_TOO_LARGE', 'ZIP 实际解压总大小超过上限。'))
          return
        }

        chunks.push(chunk.slice())
        byteLengthsByPath.set(path, nextEntryBytes)
        actualUncompressedBytes = nextArchiveBytes
        if (final) {
          completedEntryCount += 1
          finishIfReady()
        }
      }
      file.start()
    }

    try {
      const unzip = new Unzip(handleFile)
      unzip.register(AsyncUnzipInflate)
      for (let offset = 0; offset < source.byteLength && !settled; offset += ZIP_STREAM_INPUT_CHUNK_BYTES) {
        const end = Math.min(offset + ZIP_STREAM_INPUT_CHUNK_BYTES, source.byteLength)
        unzip.push(source.subarray(offset, end), end === source.byteLength)
      }
      if (!settled) {
        inputFinished = true
        finishIfReady()
      }
    } catch (error) {
      fail(error)
    }
  })
}

/**
 * 执行单个 Worker 协议请求，并将所有可预期失败压缩为不含底层错误文本的稳定响应。
 */
export async function executeBrowserUnzipWorkerRequest(
  request: BrowserUnzipWorkerRequest,
): Promise<BrowserUnzipWorkerResponse> {
  try {
    const result = await unzipBrowserArchiveInWorker(request.archive, request.limits)
    return { type: 'unzip-success', requestId: request.requestId, result }
  } catch (error) {
    const safeError = toSafeWorkerError(error)
    return {
      type: 'unzip-error',
      requestId: request.requestId,
      error: { code: safeError.code, ...(safeError.path ? { path: safeError.path } : {}) },
    }
  }
}

/**
 * 把解压协议安装到真实浏览器 Worker 端口；成功文件缓冲区会转移回调用方，错误不传递正文。
 */
export function installBrowserUnzipWorker(port: BrowserUnzipWorkerPort): void {
  port.addEventListener('message', (event) => {
    const request = event.data as BrowserUnzipWorkerRequest
    void executeBrowserUnzipWorkerRequest(request).then((response) => {
      const transfers = response.type === 'unzip-success'
        ? response.result.files.map((file) => file.bytes.buffer as ArrayBuffer)
        : []
      port.postMessage(response, transfers)
    })
  })
}

/**
 * 判断当前全局对象是否为具备 importScripts 的浏览器 Worker，避免普通浏览器窗口导入模块时安装消息监听器。
 */
function isBrowserWorkerGlobal(candidate: unknown): candidate is BrowserUnzipWorkerPort {
  if (!candidate || typeof candidate !== 'object') return false
  const scope = candidate as Partial<BrowserUnzipWorkerPort> & { importScripts?: unknown }
  return typeof scope.addEventListener === 'function'
    && typeof scope.postMessage === 'function'
    && typeof scope.importScripts === 'function'
}

const workerGlobal = globalThis as unknown
if (isBrowserWorkerGlobal(workerGlobal)) {
  installBrowserUnzipWorker(workerGlobal)
}
