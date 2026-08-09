import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

import {
  canonicalizeJson,
  createIntegrityDocument,
  inspectZipCentralDirectory,
  parseIntegrityDocument,
  parseWidgetSignatureDocument,
  unzipSync,
  validateWidgetPackageFiles,
  verifyIntegrityDocument,
  verifyWidgetSignature,
  zipSync,
  type IntegrityFileContent,
  type WidgetIntegrityDocument,
} from '@patab/widget-package'
import { validatePatabWidgetManifestV1, type PatabWidgetManifestV1 } from '@patab/widget-sdk'

import { createNodeStaticImageDecoder } from './imageDecoder.js'
import { signWidgetPackage } from './keys.js'
import { loadWidgetProject, readDeclaredWidgetAssets, type WidgetProject, type WidgetProjectFile, WIDGET_MANIFEST_FILE_NAME } from './project.js'
import { WidgetCliError } from './report.js'
import { buildWidgetSurfaces } from './surfaceBuild.js'

/** ZIP 输出的固定压缩级别与 DOS 时间下界；ZIP 不支持 Unix epoch，固定本地 1980-01-01 仍可跨时区得到同一元数据。 */
const DETERMINISTIC_ZIP_OPTIONS = { level: 9, mtime: new Date(1980, 0, 1, 0, 0, 0) } as const

/** 描述 check、inspect 和 pack 成功后可安全展示的摘要，不携带文件绝对路径、内容、私钥或口令。 */
export interface WidgetPackageSummary {
  readonly componentId: string
  readonly version: string
  readonly surfaceCount: number
  readonly signed: boolean
}

/** 在 Node 子进程中调用项目标准 type-check 脚本；Windows 的 npm.cmd 必须经受控 shell 启动，参数恒为固定值。 */
async function runProjectTypeCheck(project: WidgetProject): Promise<void> {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    const child = spawn(executable, ['run', 'type-check'], { cwd: project.root, stdio: 'ignore', shell: process.platform === 'win32' })
    child.once('error', reject)
    child.once('exit', resolveExit)
  }).catch(() => null)
  if (exitCode !== 0) throw new WidgetCliError('TYPE_CHECK_FAILED', '项目 type-check 脚本未通过。')
}

/** 将已构建文件转成共享完整性函数需要的输入，并明确排除完整性与签名文件本身。 */
function toIntegrityInputs(files: readonly WidgetProjectFile[]): readonly IntegrityFileContent[] {
  return files
    .filter((file) => file.path !== 'integrity.json' && file.path !== 'signature.json')
    .map((file) => ({ path: file.path, bytes: file.bytes }))
}

/** 根据已经通过 Schema 的 Manifest、独立 surface 与声明 assets 生成生产包基础文件。 */
async function createBasePackageFiles(project: WidgetProject): Promise<readonly WidgetProjectFile[]> {
  const manifestBytes = new TextEncoder().encode(canonicalizeJson(project.manifest))
  const [surfaces, assets] = await Promise.all([buildWidgetSurfaces(project), readDeclaredWidgetAssets(project)])
  return [{ path: WIDGET_MANIFEST_FILE_NAME, bytes: manifestBytes }, ...surfaces, ...assets]
}

/** 复用共享归档文件集、静态图片、完整性和签名验证规则审查一组已解压文件。 */
async function validatePackageFiles(files: readonly WidgetProjectFile[]): Promise<WidgetPackageSummary> {
  const manifestFile = files.find((file) => file.path === WIDGET_MANIFEST_FILE_NAME)
  if (!manifestFile) throw new WidgetCliError('INVALID_PACKAGE', '组件包缺少 Manifest。')
  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestFile.bytes))
  } catch {
    throw new WidgetCliError('MANIFEST_INVALID', '组件包 Manifest 不是有效 UTF-8 JSON。')
  }
  const manifestResult = validatePatabWidgetManifestV1(rawManifest)
  if (!manifestResult.valid) throw new WidgetCliError('MANIFEST_INVALID', `组件包 Manifest Schema 校验失败：${manifestResult.path}`)
  const manifest = rawManifest as PatabWidgetManifestV1
  try {
    await validateWidgetPackageFiles(manifest, files, createNodeStaticImageDecoder())
  } catch {
    throw new WidgetCliError('INVALID_PACKAGE', '组件包文件集、图片或路径校验失败。')
  }
  const integrityFile = files.find((file) => file.path === 'integrity.json')
  if (!integrityFile) throw new WidgetCliError('INTEGRITY_FAILED', '组件包缺少完整性清单。')
  let integrity: WidgetIntegrityDocument
  try {
    integrity = parseIntegrityDocument(new TextDecoder('utf-8', { fatal: true }).decode(integrityFile.bytes))
    await verifyIntegrityDocument(integrity, toIntegrityInputs(files))
  } catch {
    throw new WidgetCliError('INTEGRITY_FAILED', '组件包完整性校验失败。')
  }
  const signatureFile = files.find((file) => file.path === 'signature.json')
  try {
    const verification = await verifyWidgetSignature({
      manifest,
      integrity,
      ...(signatureFile ? { signatureDocument: parseWidgetSignatureDocument(new TextDecoder('utf-8', { fatal: true }).decode(signatureFile.bytes)) } : {}),
    })
    if (verification.status !== 'unsigned' && verification.status !== 'valid') {
      throw new WidgetCliError('SIGNATURE_INVALID', '组件包签名无效。')
    }
  } catch (error) {
    if (error instanceof WidgetCliError) throw error
    throw new WidgetCliError('SIGNATURE_INVALID', '组件包签名无效。')
  }
  return { componentId: manifest.id, version: manifest.version, surfaceCount: Object.keys(manifest.surfaces).length, signed: Boolean(signatureFile) }
}

/** 将固定排序后的文件映射交给共享 fflate ZIP 实现，绝不引入第二套归档器或依赖当前时间。 */
function createDeterministicZip(files: readonly WidgetProjectFile[]): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {}
  for (const file of [...files].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)) zipEntries[file.path] = file.bytes
  return zipSync(zipEntries, DETERMINISTIC_ZIP_OPTIONS)
}

/**
 * 执行共享 Schema、Vite 生产构建、文件集/图片/配额和完整性检查。
 *
 * 此函数不写出 ZIP，供 check 和 pack 共用，确保两条命令无法对最终产物实施不同的安全规则。
 */
export async function checkWidgetProject(rootInput: string = process.cwd()): Promise<WidgetPackageSummary> {
  const project = await loadWidgetProject(rootInput)
  const baseFiles = await createBasePackageFiles(project)
  const integrity = await createIntegrityDocument(toIntegrityInputs(baseFiles))
  const files = [...baseFiles, { path: 'integrity.json', bytes: new TextEncoder().encode(canonicalizeJson(integrity)) }]
  return validatePackageFiles(files)
}

/**
 * 读取 ZIP 并复用导入端的中央目录、文件集、完整性和签名校验。
 *
 * inspect 永远不执行 package surface，也不会把归档路径、HTML、私钥或原始解压异常写入默认输出。
 */
export async function inspectWidgetPackage(archivePath: string): Promise<WidgetPackageSummary> {
  let archive: Uint8Array
  try {
    archive = new Uint8Array(await readFile(resolve(archivePath)))
    inspectZipCentralDirectory(archive)
  } catch {
    throw new WidgetCliError('INVALID_PACKAGE', '组件 ZIP 中央目录校验失败。')
  }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(archive)
  } catch {
    throw new WidgetCliError('INVALID_PACKAGE', '组件 ZIP 无法安全解压。')
  }
  return validatePackageFiles(Object.entries(entries).map(([path, bytes]) => ({ path, bytes })))
}

/** pack 输入包含的签名选项；只传私钥路径，口令始终由 keys 模块从交互终端或受保护环境变量读取。 */
export interface PackWidgetProjectOptions {
  readonly root?: string
  readonly outputPath?: string
  readonly signPrivateKeyPath?: string
}

/**
 * 强制 type-check、构建、自检并原子写出确定性 ZIP。
 *
 * 临时文件位于输出目录且失败必删；签名任一步异常直接中断，不允许回退为未签名包。
 */
export async function packWidgetProject(options: PackWidgetProjectOptions = {}): Promise<{ readonly fileName: string; readonly summary: WidgetPackageSummary }> {
  let outputPath: string | undefined
  let temporaryDirectory: string | undefined
  try {
    const project = await loadWidgetProject(options.root)
    outputPath = resolve(project.root, options.outputPath ?? join('dist', `${project.manifest.id}-${project.manifest.version}.patab.zip`))
    await rm(outputPath, { force: true })
    await runProjectTypeCheck(project)
    const baseFiles = await createBasePackageFiles(project)
    const integrity = await createIntegrityDocument(toIntegrityInputs(baseFiles))
    const files: WidgetProjectFile[] = [...baseFiles, { path: 'integrity.json', bytes: new TextEncoder().encode(canonicalizeJson(integrity)) }]
    if (options.signPrivateKeyPath) {
      const signature = await signWidgetPackage({ privateKeyPath: options.signPrivateKeyPath, manifest: project.manifest, integrity })
      files.push({ path: 'signature.json', bytes: new TextEncoder().encode(canonicalizeJson({ schemaVersion: 1, algorithm: 'ed25519', signature })) })
    }
    await validatePackageFiles(files)
    const archive = createDeterministicZip(files)
    await mkdir(dirname(outputPath), { recursive: true })
    temporaryDirectory = await mkdtemp(join(dirname(outputPath), '.patab-widget-'))
    const temporaryPath = join(temporaryDirectory, 'package.zip')
    await writeFile(temporaryPath, archive, { flag: 'wx' })
    await inspectWidgetPackage(temporaryPath)
    await rename(temporaryPath, outputPath)
    return { fileName: basename(outputPath), summary: { ...await inspectWidgetPackage(outputPath), signed: Boolean(options.signPrivateKeyPath) } }
  } catch (error) {
    if (outputPath) await rm(outputPath, { force: true }).catch(() => undefined)
    if (error instanceof WidgetCliError) throw error
    throw new WidgetCliError('CHECK_FAILED', '组件包生成后自检失败。')
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

/** 暴露确定性 ZIP 生成器给 focused 测试，输入仍必须先经过 check/pack 组合路径验证。 */
export function createDeterministicWidgetZipForTest(files: readonly WidgetProjectFile[]): Uint8Array {
  return createDeterministicZip(files)
}
