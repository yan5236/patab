/**
 * 配置导入 / 导出工具
 *
 * 导出内容即 localStorage 中持久化的 LauncherState（布局/磁贴、屏幕、Dock、
 * 待办与全部设置）；导入只做基本结构校验，写入存储后刷新页面，
 * 由 launcherState 的既有清洗逻辑接管兼容与修复。
 */
import type { LauncherState } from '@/types'

/** 判断不可信值是否为普通记录 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 序列化当前持久化状态为可下载的配置备份文本 */
export function serializeLauncherState(state: LauncherState): string {
  return JSON.stringify(state, null, 2)
}

/** 解析并校验配置备份文本；结构不合法时返回 null */
export function parseLauncherStateBackup(text: string): LauncherState | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return null
    if (parsed.version !== 1) return null
    if (!Array.isArray(parsed.screens) || !Array.isArray(parsed.dock)) return null
    if (!isRecord(parsed.settings)) return null
    return parsed as unknown as LauncherState
  } catch {
    return null
  }
}

/** 生成带日期的备份文件名，例如 patab-config-20260810.json */
export function buildConfigBackupFilename(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `patab-config-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`
}
