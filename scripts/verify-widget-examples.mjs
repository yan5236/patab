import { execFile as executeFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(executeFile)
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXAMPLE_DIRECTORY_NAMES = ['vanilla-widget', 'vue-widget']
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const KEY_PASSPHRASE = 'patab-ci-signing-passphrase'

/**
 * 执行子命令，并在失败时只保留命令名称而不回显可能包含敏感路径的输出。
 *
 * Windows 的 pnpm 为 `.cmd` 包装器，Node 只能在该平台通过 shell 启动它；参数全部来自本脚本固定路径，
 * 不接受外部输入，Linux CI 仍使用不经 shell 解释的直接执行。
 */
async function runCommand(command, argumentsList, options = {}) {
  try {
    return await execFile(command, argumentsList, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
      ...options,
    })
  } catch {
    throw new Error(`组件示例验证命令失败：${command}`)
  }
}

/**
 * 通过示例自身的 CLI 依赖执行命令，保证 Windows 与 Linux 都由 pnpm 解析同一套 bin 链接。
 */
async function runWidgetCli(exampleRoot, argumentsList, environment) {
  return runCommand(PNPM_COMMAND, ['--dir', exampleRoot, 'exec', 'patab-widget', ...argumentsList], {
    env: environment,
  })
}

/**
 * 读取 keygen 的唯一 JSON 成功摘要，不打印公钥或私钥位置，避免 CI 日志形成无用的密钥追踪信息。
 */
function parseKeygenResult(stdout) {
  const source = stdout.trim().split(/\r?\n/).at(-1)
  if (!source) throw new Error('组件示例验证无法读取 keygen 摘要。')
  const result = JSON.parse(source)
  if (!result.ok || typeof result.publicKeyBase64 !== 'string') {
    throw new Error('组件示例验证未获得有效公钥。')
  }
  return result
}

/**
 * 比较两个确定性 pack 输出的原始字节，不能只比较文件名、长度或 inspect 摘要。
 */
async function assertSameArchiveBytes(firstPath, secondPath) {
  const [first, second] = await Promise.all([readFile(firstPath), readFile(secondPath)])
  if (!first.equals(second)) throw new Error('组件示例的两次 pack 输出不满足字节确定性。')
}

/**
 * 将临时公钥写入示例 Manifest 以验证签名路径，并始终由调用方恢复仓库原始文件。
 */
async function writeTemporaryPublisher(manifestPath, publicKeyBase64) {
  const source = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(source)
  manifest.publisher = { publicKey: publicKeyBase64 }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return source
}

/**
 * 对一个官方示例执行 check、build、两次未签名 pack、inspect 与已签名 pack/验签。
 *
 * 所有输出和私钥位于系统临时目录；Manifest 在 finally 中恢复，因此本地执行不会污染示例源码。
 */
async function verifyExample(exampleName, temporaryDirectory, environment) {
  const exampleRoot = join(REPO_ROOT, 'examples', exampleName)
  const firstArchive = join(temporaryDirectory, `${exampleName}-first.patab.zip`)
  const secondArchive = join(temporaryDirectory, `${exampleName}-second.patab.zip`)
  const signedArchive = join(temporaryDirectory, `${exampleName}-signed.patab.zip`)
  const privateKeyPath = join(temporaryDirectory, `${exampleName}.ed25519.pem`)
  const manifestPath = join(exampleRoot, 'patab.manifest.json')
  let originalManifest

  await runCommand(PNPM_COMMAND, ['--dir', exampleRoot, 'run', 'check'], { env: environment })
  await runCommand(PNPM_COMMAND, ['--dir', exampleRoot, 'run', 'build'], { env: environment })
  await runWidgetCli(exampleRoot, ['pack', '--root', exampleRoot, '--out', firstArchive], environment)
  await runWidgetCli(exampleRoot, ['pack', '--root', exampleRoot, '--out', secondArchive], environment)
  await assertSameArchiveBytes(firstArchive, secondArchive)
  await runWidgetCli(exampleRoot, ['inspect', firstArchive], environment)
  await runWidgetCli(exampleRoot, ['inspect', secondArchive], environment)

  try {
    const keygen = await runWidgetCli(exampleRoot, ['keygen', '--root', exampleRoot, '--key-out', privateKeyPath], environment)
    originalManifest = await writeTemporaryPublisher(manifestPath, parseKeygenResult(keygen.stdout).publicKeyBase64)
    await runWidgetCli(exampleRoot, ['pack', '--root', exampleRoot, '--out', signedArchive, '--sign', privateKeyPath], environment)
    await runWidgetCli(exampleRoot, ['inspect', signedArchive], environment)
  } finally {
    if (originalManifest !== undefined) await writeFile(manifestPath, originalManifest, 'utf8')
  }
}

/**
 * 验证全部官方示例，并确保临时签名材料和 ZIP 不会留在工作区或项目外的持久目录。
 */
async function main() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'patab-widget-example-ci-'))
  const environment = {
    ...process.env,
    PATAB_WIDGET_KEY_PASSPHRASE: KEY_PASSPHRASE,
  }
  try {
    for (const exampleName of EXAMPLE_DIRECTORY_NAMES) {
      await verifyExample(exampleName, temporaryDirectory, environment)
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

await main()
