/**
 * 壁纸工具 —— 内置壁纸与设置弹窗的壁纸草稿转换
 * 这里只放纯数据与纯函数，避免弹窗组件直接承载壁纸领域规则。
 */
import type { CustomWallpaper } from '@/types'

/** 设置弹窗中展示的一张壁纸选项 */
export interface WallpaperOption {
  id: string
  name: string
  src: string
  custom?: boolean
}

/** 内置壁纸列表，必须与 public 目录中的真实图片文件保持一致 */
export const DEFAULT_WALLPAPERS: WallpaperOption[] = [
  { id: 'scenery', name: '山谷晨光', src: '/scenery1.jpg' },
  { id: 'aurora', name: '极光夜幕', src: '/wallpaper-aurora.jpg' },
  { id: 'paper-lake', name: '纸感湖畔', src: '/wallpaper-paper-lake.jpg' },
  { id: 'sunrise-grid', name: '晨曦网格', src: '/wallpaper-sunrise-grid.jpg' },
  { id: 'snow-mountain-aurora', name: '雪山极光夜幕', src: '/wallpaper-snow-mountain-aurora.jpg' },
]

/** 本地壁纸 Data URL 的最大体积，避免 localStorage 过快膨胀 */
export const MAX_LOCAL_WALLPAPER_SIZE = 2 * 1024 * 1024

/** 生成设置弹窗打开时展示的自定义壁纸，兼容旧版只保存当前壁纸地址的数据 */
export function buildInitialWallpaperOptions(
  current: string,
  customWallpapers: CustomWallpaper[],
  currentCustomName = '自定义壁纸',
): WallpaperOption[] {
  const saved = customWallpapers.map((item) => ({ ...item, custom: true }))
  if (!current || DEFAULT_WALLPAPERS.some((item) => item.src === current)) return saved
  if (saved.some((item) => item.src === current)) return saved
  return [...saved, { id: 'current-custom', name: currentCustomName, src: current, custom: true }]
}

/** 转成 settings 持久化需要的纯自定义壁纸结构 */
export function toCustomWallpaper(item: WallpaperOption): CustomWallpaper {
  return {
    id: item.id,
    name: item.name.trim(),
    src: item.src.trim(),
  }
}
