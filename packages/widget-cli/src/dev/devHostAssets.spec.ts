import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openWidgetDevHostAssets } from './devHostAssets.js'

const temporaryRoots: string[] = []

/** 创建含固定元数据、HTML 与 JS 的临时发布目录。 */
async function createAssetRoot(version = '1.0.0'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patab-dev-host-assets-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'assets'))
  await Promise.all([
    writeFile(join(root, 'host.json'), JSON.stringify({ version, entry: 'index.html' })),
    writeFile(join(root, 'index.html'), '<!doctype html><html></html>'),
    writeFile(join(root, 'assets', 'main.js'), 'export {}'),
  ])
  return root
}

/** 每个用例回收临时宿主目录，避免发布资产测试污染工作区。 */
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('开发宿主发布资产', () => {
  /** 验证合法元数据打开后按固定 MIME 读取入口和嵌套文件。 */
  it('读取版本匹配的宿主资产', async () => {
    const assets = await openWidgetDevHostAssets({ root: await createAssetRoot(), expectedHostVersion: '1.0.0' })

    await expect(assets.read('index.html')).resolves.toMatchObject({
      contentType: 'text/html; charset=utf-8',
      relativePath: 'index.html',
    })
    await expect(assets.read('assets/main.js')).resolves.toMatchObject({
      contentType: 'text/javascript; charset=utf-8',
      relativePath: 'assets/main.js',
    })
  })

  /** 验证缺失元数据和版本漂移在 server 启动前失败。 */
  it('拒绝缺失或版本不匹配的宿主', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'patab-dev-host-empty-'))
    temporaryRoots.push(emptyRoot)

    await expect(openWidgetDevHostAssets({ root: emptyRoot })).rejects.toMatchObject({ code: 'BUILD_FAILED' })
    await expect(openWidgetDevHostAssets({ root: await createAssetRoot('2.0.0') })).rejects.toMatchObject({
      code: 'BUILD_FAILED',
    })
  })

  /** 验证绝对、穿越、反斜杠、目录和缺失路径都不能离开资产根。 */
  it.each(['../secret.txt', '/absolute.txt', 'assets\\main.js', 'assets', 'missing.js'])(
    '拒绝不安全资产路径：%s',
    async (path) => {
      const assets = await openWidgetDevHostAssets({ root: await createAssetRoot() })
      await expect(assets.read(path)).resolves.toBeUndefined()
    },
  )
})
