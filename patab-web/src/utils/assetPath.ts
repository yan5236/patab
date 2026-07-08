import type { RuntimeEnvironment } from '@/utils/runtimeEnvironment'
import { detectRuntimeEnvironment } from '@/utils/runtimeEnvironment'

type ExtensionRuntime = {
  getURL(path: string): string
}

/** 判断资源是否已经是完整外部地址或 Data URL，这类地址不应被扩展环境改写 */
function isAbsoluteAsset(path: string): boolean {
  return /^(https?:|data:|blob:|chrome-extension:)/i.test(path)
}

/** 去掉 public 资源根路径前缀，供 chrome.runtime.getURL 接收相对路径 */
function toExtensionAssetPath(path: string): string {
  return path.replace(/^\/+/, '')
}

/** 根据运行环境解析 public 静态资源地址，保持持久化数据仍存原始根路径 */
export function resolveAssetPath(
  path: string,
  environment: RuntimeEnvironment = detectRuntimeEnvironment(),
  runtime = (globalThis as { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime,
): string {
  if (!path || isAbsoluteAsset(path) || environment === 'web') return path
  const assetPath = toExtensionAssetPath(path)
  return runtime?.getURL ? runtime.getURL(assetPath) : assetPath
}
