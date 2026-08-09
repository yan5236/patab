import type {
  BrowserUnzipWorkerRequest,
  BrowserUnzipWorkerResponse,
} from './browserUnzipWorker.js'
import type {
  WidgetStaticImageDecoder,
  WidgetStaticImageDimensions,
  WidgetStaticImageMime,
} from './packageFiles.js'

/**
 * 提供浏览器端显式入口，保持导入边界稳定且不引入 Node 内置模块。
 */
export * from './index.js'
export * from './browserUnzipWorker.js'

/** 浏览器解压 Worker 对宿主公开的最小控制句柄，避免 SDK 声明依赖宿主 DOM 类型库。 */
export interface BrowserUnzipWorkerHandle {
  postMessage(message: BrowserUnzipWorkerRequest, transfer?: readonly ArrayBuffer[]): void
  addEventListener(type: 'message', listener: (event: { readonly data: BrowserUnzipWorkerResponse }) => void): void
  terminate(): void
}

/** 浏览器模块 Worker 构造器的最小结构，供 Node-neutral 声明文件安全表达运行时依赖。 */
interface BrowserUnzipWorkerConstructor {
  new (scriptUrl: URL, options: { readonly type: 'module' }): BrowserUnzipWorkerHandle
}

/** 在不含 DOM lib 的共享包编译环境中声明浏览器 Worker 全局；运行时仍由下方特征检测保护。 */
declare const Worker: BrowserUnzipWorkerConstructor

/** 浏览器 Blob 构造器的最小结构，避免共享包声明文件依赖 Node 端没有的 DOM 类型库。 */
interface BrowserBlobConstructor {
  new (parts: readonly Uint8Array[], options: { readonly type: string }): unknown
}

/** 浏览器已解码图片位图的最小安全读取接口。 */
interface BrowserImageBitmap extends WidgetStaticImageDimensions {
  close(): void
}

/** 浏览器真实图片解码函数的最小结构。 */
interface BrowserCreateImageBitmap {
  (source: unknown): Promise<BrowserImageBitmap>
}

/** 浏览器 Blob URL API 的最小接口；仅供脱离 DOM 的静态图片解码回退路径使用。 */
interface BrowserObjectUrlApi {
  createObjectURL(blob: unknown): string
  revokeObjectURL(url: string): void
}

/** 浏览器图片元素的最小解码结果接口；不需要插入文档，也不暴露 package 内容给页面。 */
interface BrowserImageElement {
  src: string
  onload: (() => void) | null
  onerror: (() => void) | null
  readonly naturalWidth: number
  readonly naturalHeight: number
}

/** 浏览器图片元素构造器的最小接口，避免共享包导出 DOM 具体类型。 */
interface BrowserImageConstructor {
  new (): BrowserImageElement
}

/**
 * 用不可见的浏览器图片解码器读取静态资源尺寸。
 *
 * 某些受管 Chromium 环境会在 `createImageBitmap` 上拒绝可由 `<img>` 正常解码的 PNG、JPEG 或 WebP。
 * 回退仍只处理已通过包白名单、MIME 嗅探和体积限制的 Blob，图片元素从不插入 DOM，且无论成功或失败都会释放 Blob URL。
 */
function decodeWithImageElement(
  blob: unknown,
  browserGlobal: {
    readonly URL?: BrowserObjectUrlApi
    readonly Image?: BrowserImageConstructor
  },
): Promise<WidgetStaticImageDimensions> {
  const urlApi = browserGlobal.URL
  const imageConstructor = browserGlobal.Image
  if (!urlApi || !imageConstructor) {
    return Promise.reject(new Error('当前环境不支持浏览器图片元素解码。'))
  }

  return new Promise((resolve, reject) => {
    const objectUrl = urlApi.createObjectURL(blob)
    const image = new imageConstructor()
    const cleanup = (): void => {
      image.onload = null
      image.onerror = null
      urlApi.revokeObjectURL(objectUrl)
    }
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight }
      cleanup()
      resolve(dimensions)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('静态图片无法实际解码。'))
    }
    image.src = objectUrl
  })
}

/**
 * 创建承载流式 ZIP 解压协议的模块 Worker，使宿主无需复制内部模块路径或在主线程解压。
 */
export function createBrowserUnzipWorker(): BrowserUnzipWorkerHandle {
  if (typeof Worker === 'undefined') {
    throw new Error('当前环境不支持浏览器模块 Worker。')
  }
  return new Worker(new URL('./browserUnzipWorker.js', import.meta.url), { type: 'module' })
}

/**
 * 创建基于 Blob 的浏览器真实图片解码器，优先使用 createImageBitmap，并在该 API 的环境级失败后回退到脱离 DOM 的 Image 解码。
 */
export function createBrowserStaticImageDecoder(): WidgetStaticImageDecoder {
  const browserGlobal = globalThis as unknown as {
    readonly Blob?: BrowserBlobConstructor
    readonly createImageBitmap?: BrowserCreateImageBitmap
    readonly URL?: BrowserObjectUrlApi
    readonly Image?: BrowserImageConstructor
  }
  if (!browserGlobal.Blob || (!browserGlobal.createImageBitmap && (!browserGlobal.URL || !browserGlobal.Image))) {
    throw new Error('当前环境不支持浏览器图片解码。')
  }

  return {
    async decode(bytes: Uint8Array, mime: WidgetStaticImageMime): Promise<WidgetStaticImageDimensions> {
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new browserGlobal.Blob!([copy], { type: mime })
      if (browserGlobal.createImageBitmap) {
        try {
          const bitmap = await browserGlobal.createImageBitmap(blob)
          try {
            return { width: bitmap.width, height: bitmap.height }
          } finally {
            bitmap.close()
          }
        } catch {
          // 受管 Chromium 可能禁用 ImageBitmap 解码；继续使用同一份受限 Blob 做真实图片解码。
        }
      }
      return decodeWithImageElement(blob, browserGlobal)
    },
  }
}
