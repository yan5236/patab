export type RuntimeEnvironment = 'web' | 'extension'

/** 判断当前页面运行环境，扩展页协议固定为 chrome-extension: */
export function detectRuntimeEnvironment(protocol = globalThis.location?.protocol): RuntimeEnvironment {
  return protocol === 'chrome-extension:' ? 'extension' : 'web'
}
