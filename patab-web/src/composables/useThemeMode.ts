/**
 * useThemeMode —— 根据设置同步根节点主题
 * 监听系统深色偏好和用户设置，最终只向 DOM 暴露 light / dark。
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { ThemeMode } from '@/types'
import { applyTheme, resolveTheme } from '@/utils/theme'

/** 挂载主题同步逻辑，服务端或测试环境缺少 matchMedia 时按浅色处理 */
export function useThemeMode(mode: Ref<ThemeMode>) {
  const media = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  /** 读取当前系统深色状态；matchMedia 不是 Vue 响应式值，变化时由监听器主动同步 */
  function getSystemDark() {
    return media?.matches ?? false
  }

  /** 把当前设置解析为最终主题并写入 documentElement */
  function syncTheme() {
    applyTheme(document.documentElement, resolveTheme(mode.value, getSystemDark()))
  }

  /** 系统主题变化时仅在跟随系统模式下刷新，避免覆盖手动选择 */
  function onSystemThemeChange() {
    if (mode.value === 'system') syncTheme()
  }

  media?.addEventListener('change', onSystemThemeChange)
  watch(mode, syncTheme, { immediate: true })
  onBeforeUnmount(() => media?.removeEventListener('change', onSystemThemeChange))
}
