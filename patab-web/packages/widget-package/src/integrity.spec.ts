import { describe, expect, it } from 'vitest'

import {
  CanonicalJsonError,
  canonicalizeJson,
  canonicalizeJsonToBytes,
} from './canonicalJson.js'
import {
  IntegrityError,
  createIntegrityDocument,
  parseIntegrityDocument,
  serializeIntegrityDocument,
  sha256Hex,
  verifyIntegrityDocument,
} from './integrity.js'

/** 统一把测试文本编码为完整性输入，避免各用例重复创建 TextEncoder。 */
function textFile(path: string, content: string): { readonly path: string; readonly bytes: Uint8Array } {
  return { path, bytes: new TextEncoder().encode(content) }
}

/** 断言异步完整性操作返回预期稳定错误码，不依赖中文错误文本。 */
async function expectIntegrityError(callback: () => Promise<unknown>, code: IntegrityError['code']): Promise<void> {
  await expect(callback).rejects.toMatchObject({ code })
}

/** 覆盖规范 JSON、SHA-256 和完整性清单的跨端稳定格式与安全失败路径。 */
describe('规范 JSON 与完整性校验', () => {
  /** 验证对象键、UTF-8 字节和 SHA-256 摘要在同一输入下具有固定输出。 */
  it('稳定规范化 JSON 并生成 SHA-256', async () => {
    const input = { z: [true, '\u000f'], a: { b: 2, a: -0 } }

    expect(canonicalizeJson(input)).toBe('{"a":{"a":0,"b":2},"z":[true,"\\u000f"]}')
    expect(new TextDecoder().decode(canonicalizeJsonToBytes(input))).toBe(canonicalizeJson(input))
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  /** 验证规范化拒绝非 JSON 数值、循环引用和会执行任意 getter 的对象。 */
  it('拒绝不安全或不可规范化的 JSON 输入', () => {
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrowError(CanonicalJsonError)
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrow(/CANONICAL_JSON_INVALID_NUMBER|非有限数值/)

    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(() => canonicalizeJson(circular)).toThrowError(CanonicalJsonError)

    const accessor = Object.create(null) as { readonly value: string }
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => '不应读取' })
    expect(() => canonicalizeJson(accessor)).toThrowError(CanonicalJsonError)
  })

  /** 验证创建和序列化会按路径字典序生成确定的清单，并可通过原文件复核。 */
  it('创建、序列化并验证完整性清单', async () => {
    const files = [textFile('surfaces/widget.html', '<main />'), textFile('patab.manifest.json', '{}')]
    const document = await createIntegrityDocument(files)

    expect(document.files.map((file) => file.path)).toEqual(['patab.manifest.json', 'surfaces/widget.html'])
    expect(serializeIntegrityDocument(document)).toBe(
      '{"algorithm":"sha256","files":[{"path":"patab.manifest.json","sha256":"44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"},{"path":"surfaces/widget.html","sha256":"f307ab80fcb4306780fa51d406a4e464be41a6341732b1f9e7a2cb5eae6d2928"}],"schemaVersion":1}',
    )
    await expect(verifyIntegrityDocument(document, files)).resolves.toBeUndefined()
    expect(parseIntegrityDocument(serializeIntegrityDocument(document))).toEqual(document)
  })

  /** 验证缺失、额外和内容变化的任一文件都会得到稳定错误码与首个安全路径。 */
  it('拒绝缺失、额外或哈希不匹配的文件', async () => {
    const files = [textFile('patab.manifest.json', '{}'), textFile('surfaces/widget.html', '<main />')]
    const document = await createIntegrityDocument(files)

    await expectIntegrityError(
      () => verifyIntegrityDocument(document, [files[0]!]),
      'INTEGRITY_FILE_MISSING',
    )
    await expectIntegrityError(
      () => verifyIntegrityDocument(document, [...files, textFile('unexpected.txt', 'x')]),
      'INTEGRITY_EXTRA_FILE',
    )
    await expectIntegrityError(
      () => verifyIntegrityDocument(document, [files[0]!, textFile('surfaces/widget.html', 'changed')]),
      'INTEGRITY_HASH_MISMATCH',
    )
  })
})
