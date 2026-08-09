import { describe, expect, it } from 'vitest'

import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'

import { createIntegrityDocument } from './integrity.js'
import {
  WIDGET_SIGNATURE_ALGORITHM,
  WIDGET_SIGNATURE_SCHEMA_VERSION,
  createWidgetSignaturePayload,
  encodeWidgetSignatureBase64,
  parseWidgetSignatureDocument,
  verifyWidgetSignature,
} from './signature.js'

/** 创建签名测试所需的最小静态 Manifest，所有可签名字段均为纯 JSON 数据。 */
function createManifest(publicKey?: string): PatabWidgetManifestV1 {
  return {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.signature',
    version: '1.0.0',
    name: { default: 'Signature' },
    description: { default: '签名测试' },
    developer: { default: 'PaTab' },
    surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    assets: { icon: 'assets/icon.png' },
    ...(publicKey ? { publisher: { publicKey } } : {}),
  }
}

/** 生成 Web Crypto Ed25519 密钥对与 SPKI Base64 公钥，验证测试走与浏览器相同的算法路径。 */
async function createEd25519KeyPair(): Promise<{ readonly privateKey: CryptoKey; readonly publicKeyBase64: string }> {
  const keyPair = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const publicKey = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)
  return {
    privateKey: keyPair.privateKey,
    publicKeyBase64: encodeWidgetSignatureBase64(new Uint8Array(publicKey)),
  }
}

/** 覆盖无签名、有效签名、签名篡改、换钥与签名文档格式拒绝。 */
describe('Ed25519 组件签名验证', () => {
  /** 验证未提供 signature.json 时明确返回 unsigned，而不是把未签名误标为无效。 */
  it('区分未签名包', async () => {
    const integrity = await createIntegrityDocument([{ path: 'patab.manifest.json', bytes: new TextEncoder().encode('{}') }])

    await expect(verifyWidgetSignature({ manifest: createManifest(), integrity })).resolves.toEqual({ status: 'unsigned' })
  })

  /** 验证 Web Crypto 的 SPKI 导入和 Ed25519 验签可接受规范 Manifest 加完整性清单的固定输入。 */
  it('接受有效签名并拒绝篡改签名', async () => {
    const keyPair = await createEd25519KeyPair()
    const manifest = createManifest(keyPair.publicKeyBase64)
    const integrity = await createIntegrityDocument([{ path: 'patab.manifest.json', bytes: new TextEncoder().encode('{}') }])
    const signature = await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      createWidgetSignaturePayload(manifest, integrity),
    )
    const signatureDocument = {
      schemaVersion: WIDGET_SIGNATURE_SCHEMA_VERSION,
      algorithm: WIDGET_SIGNATURE_ALGORITHM,
      signature: encodeWidgetSignatureBase64(new Uint8Array(signature)),
    } as const

    await expect(verifyWidgetSignature({ manifest, integrity, signatureDocument })).resolves.toEqual({ status: 'valid' })

    const alteredSignature = new Uint8Array(signature)
    alteredSignature[0] = alteredSignature[0]! ^ 1
    await expect(verifyWidgetSignature({
      manifest,
      integrity,
      signatureDocument: { ...signatureDocument, signature: encodeWidgetSignatureBase64(alteredSignature) },
    })).resolves.toEqual({ status: 'invalid' })
  })

  /** 验证更新时即使新包签名本身有效，只要 SPKI 公钥变化就优先要求重新确认。 */
  it('区分发布者换钥', async () => {
    const currentKey = await createEd25519KeyPair()
    const previousKey = await createEd25519KeyPair()
    const manifest = createManifest(currentKey.publicKeyBase64)
    const integrity = await createIntegrityDocument([{ path: 'patab.manifest.json', bytes: new TextEncoder().encode('{}') }])
    const signature = await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      currentKey.privateKey,
      createWidgetSignaturePayload(manifest, integrity),
    )

    await expect(verifyWidgetSignature({
      manifest,
      integrity,
      signatureDocument: {
        schemaVersion: WIDGET_SIGNATURE_SCHEMA_VERSION,
        algorithm: WIDGET_SIGNATURE_ALGORITHM,
        signature: encodeWidgetSignatureBase64(new Uint8Array(signature)),
      },
      knownPublisherPublicKey: previousKey.publicKeyBase64,
    })).resolves.toEqual({ status: 'publisher-key-changed' })
  })

  /** 验证签名 JSON 只能包含固定字段和长度正确的规范 Base64 Ed25519 签名。 */
  it('拒绝畸形签名文档', () => {
    expect(() => parseWidgetSignatureDocument('{"algorithm":"ed25519","schemaVersion":1,"signature":"not-base64"}')).toThrowError(/签名/)
    expect(() => parseWidgetSignatureDocument('{"algorithm":"rsa","schemaVersion":1,"signature":""}')).toThrowError(/签名/)
  })
})
