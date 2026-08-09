import { describe, expect, it } from 'vitest'

import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

import {
  WidgetPackageFileError,
  validateWidgetPackageFiles,
} from './packageFiles.js'

/** 供文件集测试使用的 PNG 文件头；图片实际解码由注入的受控测试解码器模拟。 */
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

/** 供文件集测试使用的 JPEG 文件头，用于验证图标不得伪装为截图 MIME。 */
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0x00])

/** 创建最小有效 Manifest，测试只关注文件引用而不重复 Manifest Schema 契约。 */
function createManifest(): PatabWidgetManifestV1 {
  return {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.files',
    version: '1.0.0',
    name: { default: 'Files' },
    description: { default: '文件集测试' },
    developer: { default: 'PaTab' },
    surfaces: {
      widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } },
    },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    assets: {
      icon: 'assets/icon.png',
      screenshots: ['assets/screenshots/preview.png'],
    },
  }
}

/** 创建通过静态素材解码的测试文件集，调用方可针对边界覆写任意路径或正文。 */
function createFiles(): Array<{ path: string; bytes: Uint8Array }> {
  return [
    { path: 'patab.manifest.json', bytes: new TextEncoder().encode('{}') },
    { path: 'integrity.json', bytes: new TextEncoder().encode('{}') },
    { path: 'surfaces/widget.html', bytes: new TextEncoder().encode('<main>组件</main>') },
    { path: 'assets/icon.png', bytes: PNG_HEADER },
    { path: 'assets/screenshots/preview.png', bytes: PNG_HEADER },
  ]
}

/** 创建可控的真实解码边界替身，以验证共享校验器会使用解码结果而非只信任文件头。 */
function createImageDecoder(width = 640, height = 360): { decode: () => Promise<{ width: number; height: number }> } {
  return {
    decode: async () => ({ width, height }),
  }
}

/** 断言异步包文件集校验以稳定错误码拒绝，而不匹配内部中文错误文本。 */
async function expectPackageError(callback: () => Promise<unknown>, code: WidgetPackageFileError['code']): Promise<void> {
  await expect(callback).rejects.toMatchObject({ code })
}

/** 覆盖 Manifest 引用、文件白名单、静态图片 MIME/实际尺寸和 Manifest 大小限制。 */
describe('组件包文件集与静态素材校验', () => {
  /** 验证完整白名单文件集经 UTF-8 surface 与图片解码后可安全交给安装前详情流程。 */
  it('接受 Manifest 引用的 surface、图标与截图', async () => {
    const result = await validateWidgetPackageFiles(createManifest(), createFiles(), createImageDecoder())

    expect(result.surfaceFiles.map((file) => file.path)).toEqual(['surfaces/widget.html'])
    expect(result.staticAssets.map((asset) => [asset.path, asset.mime, asset.isIcon, asset.isScreenshot])).toEqual([
      ['assets/icon.png', 'image/png', true, false],
      ['assets/screenshots/preview.png', 'image/png', false, true],
    ])
  })

  /** 验证 Manifest 引用缺失或 ZIP 带入未声明文件时，校验在安装记录创建前拒绝。 */
  it('拒绝缺失引用和额外文件', async () => {
    await expectPackageError(
      () => validateWidgetPackageFiles(createManifest(), createFiles().filter((file) => file.path !== 'surfaces/widget.html'), createImageDecoder()),
      'PACKAGE_FILE_MISSING',
    )
    await expectPackageError(
      () => validateWidgetPackageFiles(createManifest(), [...createFiles(), { path: 'runtime.js', bytes: new Uint8Array() }], createImageDecoder()),
      'PACKAGE_FILE_EXTRA',
    )
  })

  /** 验证文件头 MIME、实际解码尺寸和 Manifest 原始大小都不能通过名称或声明值绕过。 */
  it('拒绝错误 MIME、超限截图和过大 Manifest', async () => {
    const jpegIconFiles = createFiles().map((file) => file.path === 'assets/icon.png' ? { ...file, bytes: JPEG_HEADER } : file)
    await expectPackageError(
      () => validateWidgetPackageFiles(createManifest(), jpegIconFiles, createImageDecoder()),
      'PACKAGE_STATIC_IMAGE_MIME_INVALID',
    )
    await expectPackageError(
      () => validateWidgetPackageFiles(createManifest(), createFiles(), createImageDecoder(2561, 1440)),
      'PACKAGE_STATIC_IMAGE_DIMENSIONS_INVALID',
    )
    const largeManifestFiles = createFiles().map((file) => file.path === 'patab.manifest.json'
      ? { ...file, bytes: new Uint8Array(64 * 1024 + 1) }
      : file)
    await expectPackageError(
      () => validateWidgetPackageFiles(createManifest(), largeManifestFiles, createImageDecoder()),
      'PACKAGE_MANIFEST_TOO_LARGE',
    )
  })
})
