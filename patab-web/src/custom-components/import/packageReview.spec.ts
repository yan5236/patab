import { describe, expect, it } from 'vitest'
import {
  createIntegrityDocument,
  encodeWidgetSignatureBase64,
  type BrowserUnzipWorkerFile,
  type WidgetStaticImageDecoder,
} from '@patab/widget-package'

import {
  CustomComponentPackageReviewError,
  reviewCustomComponentPackage,
} from './packageReview'

/** 使用固定图片尺寸替身覆盖静态素材校验，审查测试不依赖 jsdom 是否实现 createImageBitmap。 */
const imageDecoder: WidgetStaticImageDecoder = {
  async decode() {
    return { width: 16, height: 16 }
  },
}

/** 创建满足 SDK Schema 与文件集校验的最小静态 Manifest；surface 文本刻意包含脚本以检测审查阶段零执行。 */
function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.review',
    version: '1.0.0',
    name: { default: 'Review component' },
    description: { default: '静态审查组件' },
    developer: { default: 'PaTab test' },
    surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    assets: { icon: 'assets/icon.png' },
    ...overrides,
  }
}

/** 把 JSON 文本编码为独立 ZIP 解压结果字节，模拟 Worker 已完成实际体积检查后的输出。 */
function textFile(path: string, source: string): BrowserUnzipWorkerFile {
  return { path, bytes: new TextEncoder().encode(source) }
}

/** 生成满足 PNG 头嗅探的最小静态图标；真实像素解码由 imageDecoder 替身负责。 */
function imageFile(path = 'assets/icon.png'): BrowserUnzipWorkerFile {
  return { path, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
}

/** 为给定静态文件集创建正确完整性清单，并可追加签名文件（签名文件本身不参与哈希）。 */
async function createPackageFiles(manifest: Record<string, unknown>, signature?: string): Promise<BrowserUnzipWorkerFile[]> {
  const files = [
    textFile('patab.manifest.json', JSON.stringify(manifest)),
    textFile('surfaces/widget.html', '<script>globalThis.__reviewSurfaceExecuted = true</script>'),
    imageFile(),
  ]
  const integrity = await createIntegrityDocument(files.map((file) => ({ path: file.path, bytes: file.bytes })))
  return [
    ...files,
    textFile('integrity.json', JSON.stringify(integrity)),
    ...(signature ? [textFile('signature.json', signature)] : []),
  ]
}

/** 覆盖导入前静态审查的零执行、Schema 错误和签名状态，保证失败不依赖底层异常文本。 */
describe('自定义组件安装前静态审查', () => {
  /** 验证审查只读取 Manifest、静态图片与完整性，不会执行 surface 内的任意脚本。 */
  it('审查未签名包时不执行 surface', async () => {
    delete (globalThis as { __reviewSurfaceExecuted?: boolean }).__reviewSurfaceExecuted
    const review = await reviewCustomComponentPackage(await createPackageFiles(createManifest()), imageDecoder)

    expect(review.signatureVerification).toEqual({ status: 'unsigned' })
    expect(review.manifest.id).toBe('com.example.review')
    expect((globalThis as { __reviewSurfaceExecuted?: boolean }).__reviewSurfaceExecuted).toBeUndefined()
  })

  /** 验证畸形 Manifest 返回安全的 JSON Pointer，而不是将原始 JSON、路径或 Schema 异常展示给用户。 */
  it('拒绝不符合 Schema 的 Manifest 并保留字段位置', async () => {
    const invalidManifest = createManifest({ apiVersion: '2' })

    await expect(reviewCustomComponentPackage(await createPackageFiles(invalidManifest), imageDecoder))
      .rejects.toMatchObject({ code: 'MANIFEST_SCHEMA_INVALID', path: '/apiVersion' } satisfies Partial<CustomComponentPackageReviewError>)
  })

  /** 验证有签名但无法通过 Ed25519 验签的包仍可向详情页报告“签名无效”，但不会伪装成未签名。 */
  it('明确报告无效签名状态', async () => {
    const manifest = createManifest({ publisher: { publicKey: 'AA==' } })
    const signature = JSON.stringify({
      schemaVersion: 1,
      algorithm: 'ed25519',
      signature: encodeWidgetSignatureBase64(new Uint8Array(64)),
    })

    const review = await reviewCustomComponentPackage(await createPackageFiles(manifest, signature), imageDecoder)
    expect(review.signatureVerification).toEqual({ status: 'invalid' })
  })
})
