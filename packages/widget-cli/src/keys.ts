import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { stdin as input, stderr as output } from 'node:process'

import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'
import { encodeWidgetSignatureBase64, type WidgetIntegrityDocument, createWidgetSignaturePayload } from '@patab/widget-package'

import { WidgetCliError } from './report.js'

/** 供非交互 CI 使用的口令环境变量名；CLI 从不在日志、ZIP 或项目文件中回显其值。 */
export const WIDGET_KEY_PASSPHRASE_ENV = 'PATAB_WIDGET_KEY_PASSPHRASE'

/** keygen 成功后返回的安全摘要；公开密钥需要开发者明确写入 Manifest publisher 字段。 */
export interface WidgetGeneratedKeyPair {
  readonly privateKeyPath: string
  readonly publicKeyBase64: string
}

/** 读取未回显的终端口令；非 TTY 且未配置环境变量时明确失败，防止脚本误把空口令当作安全密钥。 */
async function readSecret(prompt: string): Promise<string> {
  const fromEnvironment = process.env[WIDGET_KEY_PASSPHRASE_ENV]
  if (fromEnvironment) return fromEnvironment
  if (!input.isTTY || !output.isTTY) throw new WidgetCliError('SIGNATURE_INVALID', '签名操作需要交互终端口令或受保护的 CI 环境变量。')
  try {
    output.write(prompt)
    input.setRawMode?.(true)
    const value = await new Promise<string>((resolveSecret) => {
      let secret = ''
      const receive = (chunk: Buffer): void => {
        const character = chunk.toString('utf8')
        if (character === '\r' || character === '\n') {
          input.off('data', receive)
          resolveSecret(secret)
          return
        }
        if (character === '\u0003') {
          input.off('data', receive)
          resolveSecret('')
          return
        }
        if (character === '\u007f' || character === '\b') {
          secret = secret.slice(0, -1)
          return
        }
        secret += character
      }
      input.on('data', receive)
    })
    output.write('\n')
    return value
  } finally {
    input.setRawMode?.(false)
  }
}

/** 读取并确认两次非空口令，避免 keygen 在用户误输入时生成无法使用的私钥。 */
async function readNewPassphrase(): Promise<string> {
  const first = await readSecret('输入私钥口令：')
  const second = await readSecret('再次输入私钥口令：')
  if (first.length < 12 || first !== second) throw new WidgetCliError('SIGNATURE_INVALID', '私钥口令不足 12 个字符或两次输入不一致。')
  return first
}

/** 从已校验组件 ID 生成目录安全的默认私钥文件名，不信任调用方传来的路径片段。 */
function createDefaultPrivateKeyPath(projectRoot: string, manifest: PatabWidgetManifestV1): string {
  const fileName = `${manifest.id.replace(/[^a-z0-9.-]/gi, '_')}.ed25519.pem`
  return join(dirname(resolve(projectRoot)), '.patab-widget-keys', fileName)
}

/**
 * 生成口令加密的 Ed25519 PKCS#8 私钥与 SPKI 公钥。
 *
 * 默认私钥目录严格位于项目外；调用方必须主动把返回的公钥填入 Manifest，CLI 不会静默篡改组件身份声明。
 */
export async function generateWidgetKeyPair(input: {
  readonly projectRoot: string
  readonly manifest: PatabWidgetManifestV1
  readonly outputPath?: string
  readonly passphrase?: string
}): Promise<WidgetGeneratedKeyPair> {
  const passphrase = input.passphrase ?? await readNewPassphrase()
  if (passphrase.length < 12) throw new WidgetCliError('SIGNATURE_INVALID', '私钥口令至少需要 12 个字符。')
  const privateKeyPath = resolve(input.outputPath ?? createDefaultPrivateKeyPath(input.projectRoot, input.manifest))
  const pair = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
  })
  try {
    await mkdir(dirname(privateKeyPath), { recursive: true })
    await writeFile(privateKeyPath, pair.privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  } catch {
    throw new WidgetCliError('SIGNATURE_INVALID', '无法安全写入私钥文件。')
  }
  return { privateKeyPath, publicKeyBase64: Buffer.from(pair.publicKey).toString('base64') }
}

/**
 * 使用加密 PKCS#8 私钥对共享签名输入进行 Ed25519 签名。
 *
 * 任何读取、解锁、格式或签名失败都抛出稳定错误；调用方必须中止 pack，绝不能降级成未签名 ZIP。
 */
export async function signWidgetPackage(input: {
  readonly privateKeyPath: string
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly passphrase?: string
}): Promise<string> {
  const passphrase = input.passphrase ?? await readSecret('输入私钥口令：')
  if (!passphrase) throw new WidgetCliError('SIGNATURE_INVALID', '私钥口令不能为空。')
  let privateKeySource: string
  try {
    privateKeySource = await readFile(resolve(input.privateKeyPath), 'utf8')
  } catch {
    throw new WidgetCliError('SIGNATURE_INVALID', '无法读取私钥文件。')
  }
  try {
    const privateKey = createPrivateKey({ key: privateKeySource, format: 'pem', type: 'pkcs8', passphrase })
    return encodeWidgetSignatureBase64(new Uint8Array(sign(null, createWidgetSignaturePayload(input.manifest, input.integrity), privateKey)))
  } catch {
    throw new WidgetCliError('SIGNATURE_INVALID', '私钥格式、口令或签名操作无效。')
  }
}
