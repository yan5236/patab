import type { WidgetStaticImageDecoder, WidgetStaticImageDimensions, WidgetStaticImageMime } from '@patab/widget-package'

import { WidgetCliError } from './report.js'

/** 读取大端 16 位整数；缺少字节时返回 undefined 而不是抛出 RangeError。 */
function readU16BigEndian(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined
  return (bytes[offset]! << 8) | bytes[offset + 1]!
}

/** 读取大端 32 位整数；图片尺寸超过安全整数时由调用方统一拒绝。 */
function readU32BigEndian(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined
  return (bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!
}

/** 读取小端 24 位整数，用于 WebP VP8L 的无损画布尺寸。 */
function readU24LittleEndian(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 3 > bytes.length) return undefined
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

/** 读取小端 16 位整数，用于 WebP 有损帧头。 */
function readU16LittleEndian(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

/** 解析 PNG IHDR 的宽高；真实 MIME 已由共享包文件头嗅探，此处只负责 Node 无原生图像解码器的尺寸读取。 */
function decodePng(bytes: Uint8Array): WidgetStaticImageDimensions | undefined {
  const width = readU32BigEndian(bytes, 16)
  const height = readU32BigEndian(bytes, 20)
  return width && height ? { width, height } : undefined
}

/** 遍历 JPEG SOF 标记读取真实画布尺寸，跳过扫描数据与不携带长度的标记。 */
function decodeJpeg(bytes: Uint8Array): WidgetStaticImageDimensions | undefined {
  let offset = 2
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return undefined
    const length = readU16BigEndian(bytes, offset)
    if (!length || length < 2 || offset + length > bytes.length) return undefined
    const isSof = marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf
    if (isSof) {
      const height = readU16BigEndian(bytes, offset + 3)
      const width = readU16BigEndian(bytes, offset + 5)
      return width && height ? { width, height } : undefined
    }
    offset += length
  }
  return undefined
}

/** 解析 WebP 三种帧头的画布尺寸，拒绝不含有效 VP8/VP8L/VP8X 定义的字节序列。 */
function decodeWebp(bytes: Uint8Array): WidgetStaticImageDimensions | undefined {
  const chunk = new TextDecoder().decode(bytes.slice(12, 16))
  if (chunk === 'VP8 ') {
    const width = readU16LittleEndian(bytes, 26)
    const height = readU16LittleEndian(bytes, 28)
    return width && height ? { width: width & 0x3fff, height: height & 0x3fff } : undefined
  }
  if (chunk === 'VP8L') {
    const value = readU32BigEndian(bytes, 21)
    if (value === undefined) return undefined
    return { width: (value & 0x3fff) + 1, height: ((value >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    const width = readU24LittleEndian(bytes, 24)
    const height = readU24LittleEndian(bytes, 27)
    return width === undefined || height === undefined ? undefined : { width: width + 1, height: height + 1 }
  }
  return undefined
}

/**
 * 创建 CLI 使用的 Node 静态图片解码器。
 *
 * 它只解析 PNG/JPEG/WebP 尺寸，不执行组件脚本或加载外部资源；失败统一压缩为稳定的包校验错误。
 */
export function createNodeStaticImageDecoder(): WidgetStaticImageDecoder {
  return {
    async decode(bytes: Uint8Array, mime: WidgetStaticImageMime): Promise<WidgetStaticImageDimensions> {
      const dimensions = mime === 'image/png' ? decodePng(bytes) : mime === 'image/jpeg' ? decodeJpeg(bytes) : decodeWebp(bytes)
      if (!dimensions) throw new WidgetCliError('INVALID_PACKAGE', '静态图片无法解码。')
      return dimensions
    },
  }
}
