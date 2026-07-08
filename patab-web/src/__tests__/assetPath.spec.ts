import { describe, expect, it } from 'vitest'
import { resolveAssetPath } from '@/utils/assetPath'

describe('assetPath 静态资源路径工具', () => {
  it('网页版保持已有根路径资源不变', () => {
    expect(resolveAssetPath('/wallpaper-aurora.jpg', 'web')).toBe('/wallpaper-aurora.jpg')
  })

  it('扩展版优先使用 chrome.runtime.getURL 生成扩展内资源地址', () => {
    const runtime = {
      getURL: (path: string) => `chrome-extension://patab-test/${path}`,
    }

    expect(resolveAssetPath('/wallpaper-aurora.jpg', 'extension', runtime)).toBe(
      'chrome-extension://patab-test/wallpaper-aurora.jpg',
    )
  })

  it('外部链接和 Data URL 在扩展版不改写', () => {
    expect(resolveAssetPath('https://example.com/a.jpg', 'extension')).toBe('https://example.com/a.jpg')
    expect(resolveAssetPath('data:image/png;base64,abc', 'extension')).toBe('data:image/png;base64,abc')
  })
})
