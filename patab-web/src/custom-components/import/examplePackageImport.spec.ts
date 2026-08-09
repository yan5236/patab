import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { unzipSync } from '@patab/widget-package'

import { createNodeStaticImageDecoder } from '../../../../packages/widget-cli/src/imageDecoder'
import { packWidgetProject } from '../../../../packages/widget-cli/src/packageCommands'
import { reviewCustomComponentPackage } from './packageReview'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const EXAMPLE_DIRECTORY_NAMES = ['vanilla-widget', 'vue-widget'] as const

/**
 * 把 CLI 打出的 ZIP 展开为与浏览器 Worker 相同的安全文件形状。
 *
 * 测试只将已生成的字节交给宿主静态审查，不创建 iframe、解析 surface DOM 或执行任何第三方脚本。
 */
async function readPackedFiles(archivePath: string) {
  const archive = new Uint8Array(await readFile(archivePath))
  return Object.entries(unzipSync(archive)).map(([path, bytes]) => ({ path, bytes }))
}

/**
 * 对官方示例执行一次真实打包，并交由网页端安装前审查验证导入契约。
 *
 * 输出放在系统临时目录并在 finally 中删除，避免测试在示例源码目录中留下 ZIP 或构建副作用。
 */
async function reviewPackedExample(exampleName: string): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'patab-widget-import-contract-'))
  try {
    const root = join(REPO_ROOT, 'examples', exampleName)
    const archivePath = join(temporaryDirectory, `${exampleName}.patab.zip`)
    await packWidgetProject({ root, outputPath: archivePath })
    const review = await reviewCustomComponentPackage(
      await readPackedFiles(archivePath),
      createNodeStaticImageDecoder(),
    )

    expect(review.manifest.id).toMatch(/^com\.example\./)
    expect(review.signatureVerification).toEqual({ status: 'unsigned' })
    expect(review.files.some((file) => file.path === 'surfaces/widget.html')).toBe(true)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

describe('官方示例与网页导入契约', () => {
  /** 验证 Vue 与 Vanilla 示例都能通过网页端安装前的完整静态审查链。 */
  it('打包后的 Vue 与 Vanilla 示例可由宿主导入审查', async () => {
    for (const exampleName of EXAMPLE_DIRECTORY_NAMES) {
      await reviewPackedExample(exampleName)
    }
  }, 60_000)
})
