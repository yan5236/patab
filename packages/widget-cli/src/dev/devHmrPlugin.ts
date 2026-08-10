import { resolve } from 'node:path'

import type { Plugin } from 'vite'

/** Vite 8 需要在源码中看到这段精确调用，才会把模块识别为自接收 HMR 边界。 */
const HMR_ACCEPT_BOUNDARY = '\nif (import.meta.hot) {\n  import.meta.hot.accept()\n}\n'

/** 为单个官方 surface 入口追加最小自接收声明，更新模块本身仍由 Vite 重新执行。 */
export function appendWidgetDevHmrBoundary(code: string): string {
  return `${code}${HMR_ACCEPT_BOUNDARY}`
}

/**
 * 只把从 surface HTML 静态提取出的入口模块标记为 HMR 边界。
 *
 * 依赖模块仍按 Vite/框架原生规则传播，未知项目文件不会被全部强制自接收；这样普通入口
 * 更新会重新执行而不会刷新 opaque-origin iframe，也就不会丢失已转移的 MessagePort。
 */
export function createWidgetDevHmrPlugin(entryModulePaths: readonly string[]): Plugin {
  const entries = new Set(entryModulePaths.map((path) => resolve(path)))
  return {
    name: 'patab-widget-dev-hmr-boundary',
    enforce: 'pre',
    transform(code, id) {
      const path = resolve(id.split('?', 1)[0]!)
      return entries.has(path) ? appendWidgetDevHmrBoundary(code) : undefined
    },
  }
}
