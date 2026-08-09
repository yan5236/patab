import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runPatabWidgetCli } from './cli.js'
import { generateWidgetKeyPair } from './keys.js'
import { checkWidgetProject, inspectWidgetPackage, packWidgetProject } from './packageCommands.js'

/** 统一记录测试临时目录，确保 ZIP、私钥和 Vite 输出不会落入仓库或污染下一个用例。 */
const temporaryDirectories: string[] = []

/** 生成同时满足 Manifest 图片尺寸验证的 1×1 PNG 固定字节。 */
const FIXTURE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/7wAAAABJRU5ErkJggg==', 'base64')

/** 返回测试组件需要的最小 Manifest，并允许签名用例在写盘前补充 publisher 公钥。 */
function createFixtureManifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.cli-fixture',
    version: '1.0.0',
    name: { default: 'CLI fixture' },
    description: { default: 'CLI fixture' },
    developer: { default: 'PaTab' },
    surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    assets: { icon: 'assets/icon.png', screenshots: ['assets/preview.png'] },
  }
}

/** 以真实 npm script、真实 Vite 入口和固定图片创建一次性组件项目。 */
async function createWidgetFixture(options: { readonly dynamicImport?: boolean; readonly externalPlugin?: boolean } = {}): Promise<string> {
  const container = await mkdtemp(join(tmpdir(), 'patab-widget-cli-test-'))
  const root = join(container, 'project')
  temporaryDirectories.push(container)
  await Promise.all([
    mkdir(join(root, 'assets'), { recursive: true }),
    mkdir(join(root, 'src', 'surfaces'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'type-check': 'node -e "process.exit(0)"' } })),
    writeFile(join(root, 'patab.manifest.json'), JSON.stringify(createFixtureManifest(), null, 2)),
    writeFile(join(root, 'assets', 'icon.png'), FIXTURE_PNG),
    writeFile(join(root, 'assets', 'preview.png'), FIXTURE_PNG),
    writeFile(join(root, 'src', 'surfaces', 'widget.html'), '<!doctype html><html><head><meta charset="UTF-8"></head><body><main id="app"></main><script type="module" src="./widget.ts"></script></body></html>'),
    writeFile(join(root, 'src', 'surfaces', 'widget.ts'), options.dynamicImport ? "void import('./lazy.ts')\n" : "document.querySelector('#app')!.textContent = 'PaTab'\n"),
  ])
  if (options.dynamicImport) await writeFile(join(root, 'src', 'surfaces', 'lazy.ts'), "export const value = 'lazy'\n")
  if (options.externalPlugin) {
    await writeFile(join(root, 'vite.config.mjs'), "export default { plugins: [{ name: 'external-output', transformIndexHtml() { return [{ tag: 'script', attrs: { src: 'https://invalid.example/unsafe.js' } }] } }] }\n")
  }
  return root
}

/** 读取、补充并原子式覆盖测试 Manifest；仅签名用例需要显式写入公钥身份。 */
async function setFixturePublisher(root: string, publicKey: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, 'patab.manifest.json'), 'utf8')) as Record<string, unknown>
  manifest.publisher = { publicKey }
  await writeFile(join(root, 'patab.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 每个测试后删除精确创建的系统临时目录，避免在 Windows 产生可误认成项目的签名文件。 */
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('patab-widget check、pack 与 inspect', () => {
  /** 验证 Windows 原生分隔符和 POSIX 分隔符都能定位同一个项目，不由平台分隔符改变 ZIP 结果。 */
  it('接受 Windows 与 POSIX 风格项目路径，并以 npm script 完成 type-check', async () => {
    const root = await createWidgetFixture()
    await expect(checkWidgetProject(root)).resolves.toMatchObject({ componentId: 'com.example.cli-fixture', signed: false })
    await expect(checkWidgetProject(root.replaceAll('\\', '/'))).resolves.toMatchObject({ componentId: 'com.example.cli-fixture' })
    await expect(runPatabWidgetCli(['check', '--root', root])).resolves.toBe(0)
  })

  /** 验证 fflate 固定文件顺序和元数据，两个独立 pack 的 ZIP 字节必须完全相等且可 inspect。 */
  it('生成可 inspect 的确定性 ZIP', async () => {
    const root = await createWidgetFixture()
    const first = join('dist', 'first.patab.zip')
    const second = join('dist', 'second.patab.zip')
    await expect(packWidgetProject({ root, outputPath: first })).resolves.toMatchObject({ summary: { signed: false } })
    await expect(packWidgetProject({ root, outputPath: second })).resolves.toMatchObject({ summary: { signed: false } })
    await expect(readFile(join(root, first))).resolves.toEqual(await readFile(join(root, second)))
    await expect(inspectWidgetPackage(join(root, first))).resolves.toMatchObject({ componentId: 'com.example.cli-fixture', signed: false })
  })

  /** 验证动态 import 与自选 Vite 插件产生的外链均被最终 HTML 契约拒绝，且失败目标 ZIP 不会残留。 */
  it('拒绝动态导入和外链插件产物，并删除失败输出', async () => {
    const dynamicRoot = await createWidgetFixture({ dynamicImport: true })
    const dynamicOutput = join(dynamicRoot, 'dist', 'dynamic.patab.zip')
    await mkdir(dirname(dynamicOutput), { recursive: true })
    await writeFile(dynamicOutput, 'stale')
    await expect(packWidgetProject({ root: dynamicRoot, outputPath: dynamicOutput })).rejects.toMatchObject({ code: 'CHECK_FAILED' })
    await expect(access(dynamicOutput)).rejects.toMatchObject({ code: 'ENOENT' })

    const pluginRoot = await createWidgetFixture({ externalPlugin: true })
    await expect(checkWidgetProject(pluginRoot)).rejects.toMatchObject({ code: 'CHECK_FAILED' })
  })

  /** 验证加密 PKCS#8 私钥可生成可验证签名，错误口令时 pack 失败且不会降级写未签名 ZIP。 */
  it('签名、验证并在私钥误用时删除输出', async () => {
    const root = await createWidgetFixture()
    const manifest = createFixtureManifest()
    const passphrase = 'phase11-test-passphrase'
    const key = await generateWidgetKeyPair({ projectRoot: root, manifest: manifest as never, outputPath: join(root, '..', 'phase11.ed25519.pem'), passphrase })
    await setFixturePublisher(root, key.publicKeyBase64)
    const previousPassphrase = process.env.PATAB_WIDGET_KEY_PASSPHRASE
    process.env.PATAB_WIDGET_KEY_PASSPHRASE = passphrase
    try {
      const signedOutput = join(root, 'dist', 'signed.patab.zip')
      await expect(packWidgetProject({ root, outputPath: signedOutput, signPrivateKeyPath: key.privateKeyPath })).resolves.toMatchObject({ summary: { signed: true } })
      await expect(inspectWidgetPackage(signedOutput)).resolves.toMatchObject({ signed: true })

      process.env.PATAB_WIDGET_KEY_PASSPHRASE = 'wrong-phase11-passphrase'
      const failedOutput = join(root, 'dist', 'failed.patab.zip')
      await expect(packWidgetProject({ root, outputPath: failedOutput, signPrivateKeyPath: key.privateKeyPath })).rejects.toMatchObject({ code: 'SIGNATURE_INVALID' })
      await expect(access(failedOutput)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (previousPassphrase === undefined) delete process.env.PATAB_WIDGET_KEY_PASSPHRASE
      else process.env.PATAB_WIDGET_KEY_PASSPHRASE = previousPassphrase
    }
  })

  /** 验证未知命令和明确禁止的 --force 都返回非零退出码，而不是静默绕过 pack 安全路径。 */
  it('为未知命令和 --force 返回非零退出码', async () => {
    await expect(runPatabWidgetCli(['unknown'])).resolves.toBe(1)
    await expect(runPatabWidgetCli(['check', '--force'])).resolves.toBe(1)
  })
})
