/** 可被 JSON Canonicalization Scheme 表示的基础数据类型。 */
export type CanonicalJsonPrimitive = boolean | null | number | string

/** 可被 JSON Canonicalization Scheme 表示的递归数据类型。 */
export type CanonicalJsonValue = CanonicalJsonPrimitive | readonly CanonicalJsonValue[] | { readonly [key: string]: CanonicalJsonValue }

/** 规范化 JSON 失败时的稳定错误码。 */
export type CanonicalJsonErrorCode =
  | 'CANONICAL_JSON_CIRCULAR'
  | 'CANONICAL_JSON_INVALID_ARRAY'
  | 'CANONICAL_JSON_INVALID_NUMBER'
  | 'CANONICAL_JSON_INVALID_OBJECT'
  | 'CANONICAL_JSON_UNSUPPORTED_VALUE'

/**
 * 表示规范化 JSON 输入不符合纯 JSON 数据约束的安全错误，不包含原始值或调用栈。
 */
export class CanonicalJsonError extends Error {
  /**
   * 创建只包含稳定错误码和 JSON Pointer 定位的规范化错误。
   */
  constructor(
    readonly code: CanonicalJsonErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(message)
    this.name = 'CanonicalJsonError'
  }
}

/**
 * 转义 JSON Pointer 段，确保错误中的对象键不会改变路径层级。
 */
function escapeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

/**
 * 判断数组属性名是否为当前数组长度范围内的规范整数索引。
 */
function isArrayIndex(propertyName: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(propertyName)) return false
  const index = Number(propertyName)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}

/**
 * 将有限数值按 ECMAScript JSON 数值规则输出，拒绝 NaN 和无穷以保持跨端相同字节。
 */
function serializeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalJsonError('CANONICAL_JSON_INVALID_NUMBER', path, '规范 JSON 不支持非有限数值。')
  }

  return JSON.stringify(value)
}

/**
 * 递归输出单个纯 JSON 值，并拒绝循环、稀疏数组、访问器、原型对象和非 JSON 类型。
 */
function serializeCanonicalValue(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return serializeNumber(value, path)
  if (typeof value === 'string') return JSON.stringify(value)

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new CanonicalJsonError('CANONICAL_JSON_CIRCULAR', path, '规范 JSON 不支持循环引用。')
    }

    const ownKeys = Object.keys(value)
    if (ownKeys.some((key) => !isArrayIndex(key, value.length))) {
      throw new CanonicalJsonError('CANONICAL_JSON_INVALID_ARRAY', path, '规范 JSON 数组不能包含额外属性。')
    }

    ancestors.add(value)
    try {
      const items = value.map((item, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || 'get' in descriptor || 'set' in descriptor) {
          throw new CanonicalJsonError('CANONICAL_JSON_INVALID_ARRAY', `${path}/${index}`, '规范 JSON 数组不能包含空洞或访问器。')
        }
        return serializeCanonicalValue(item, `${path}/${index}`, ancestors)
      })
      return `[${items.join(',')}]`
    } finally {
      ancestors.delete(value)
    }
  }

  if (typeof value !== 'object') {
    throw new CanonicalJsonError('CANONICAL_JSON_UNSUPPORTED_VALUE', path, '规范 JSON 仅支持 JSON 基础类型。')
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalJsonError('CANONICAL_JSON_INVALID_OBJECT', path, '规范 JSON 仅接受普通对象。')
  }
  if (ancestors.has(value)) {
    throw new CanonicalJsonError('CANONICAL_JSON_CIRCULAR', path, '规范 JSON 不支持循环引用。')
  }

  const keys = Object.keys(value).sort()
  ancestors.add(value)
  try {
    const entries = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const childPath = `${path}/${escapeJsonPointerSegment(key)}`
      if (!descriptor || 'get' in descriptor || 'set' in descriptor) {
        throw new CanonicalJsonError('CANONICAL_JSON_INVALID_OBJECT', childPath, '规范 JSON 对象不能包含访问器。')
      }
      return `${JSON.stringify(key)}:${serializeCanonicalValue(descriptor.value, childPath, ancestors)}`
    })
    return `{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

/**
 * 将不可信的纯 JSON 数据序列化为 JCS 兼容的稳定字符串，供浏览器与 Node 产生相同签名输入。
 */
export function canonicalizeJson(value: unknown): string {
  return serializeCanonicalValue(value, '', new Set())
}

/**
 * 将规范 JSON 编码为 UTF-8 字节，避免不同运行时对字符串默认编码的差异。
 */
export function canonicalizeJsonToBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJson(value))
}
