/**
 * 轻量随机 id 生成器（nanoid 风格，无外部依赖）
 * 用于图块 / 屏幕 / 待办等所有数据实体的唯一标识
 */

const ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'

/** 生成一个 12 位随机 id */
export function createId(): string {
  let id = ''
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length]
  }
  return id
}
