import { describe, expect, it } from 'vitest'

import { strFromU8, strToU8, unzipSync, zipSync } from './index.js'

/**
 * 验证共享归档基础包只依赖 fflate，且同一 ZIP 原语可在后续浏览器与 CLI 任务复用。
 */
describe('widget-package 归档基础', () => {
  /**
   * 验证 fflate 可以在无 Vue/DOM/Node 特有依赖的包中完成最小 ZIP 往返，防止配置意外引入第二套库。
   */
  it('使用 fflate 完成跨端 ZIP 原语往返', () => {
    const archive = zipSync({ 'manifest.txt': strToU8('PaTab') })
    const files = unzipSync(archive)

    expect(strFromU8(files['manifest.txt']!)).toBe('PaTab')
  })
})
