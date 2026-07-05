/**
 * 壁纸工具单元测试
 * 覆盖设置弹窗打开时的自定义壁纸草稿生成规则。
 */
import { describe, expect, it } from 'vitest'
import { buildInitialWallpaperOptions, toCustomWallpaper } from '@/utils/wallpapers'

describe('wallpapers 壁纸工具', () => {
  it('buildInitialWallpaperOptions：保留已保存的自定义壁纸', () => {
    const options = buildInitialWallpaperOptions('/custom.jpg', [
      { id: 'custom-1', name: '我的壁纸', src: '/custom.jpg' },
    ])

    expect(options).toEqual([
      { id: 'custom-1', name: '我的壁纸', src: '/custom.jpg', custom: true },
    ])
  })

  it('buildInitialWallpaperOptions：当前壁纸不在列表时补成兼容选项', () => {
    const options = buildInitialWallpaperOptions('/legacy-custom.jpg', [])

    expect(options).toEqual([
      {
        id: 'current-custom',
        name: '自定义壁纸',
        src: '/legacy-custom.jpg',
        custom: true,
      },
    ])
  })

  it('toCustomWallpaper：保存前裁剪名称和地址', () => {
    expect(toCustomWallpaper({ id: 'x', name: '  名称  ', src: '  /x.jpg  ', custom: true })).toEqual({
      id: 'x',
      name: '名称',
      src: '/x.jpg',
    })
  })
})
