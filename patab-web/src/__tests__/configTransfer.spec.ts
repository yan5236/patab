import { describe, expect, it } from 'vitest'
import type { LauncherState } from '@/types'
import {
  buildConfigBackupFilename,
  parseLauncherStateBackup,
  serializeLauncherState,
} from '@/utils/configTransfer'

function buildState(): LauncherState {
  return {
    version: 1,
    screens: [{ id: 's1', name: '主页', icon: 'Bot', tiles: [] }],
    dock: [],
    todos: [],
    todoLists: [],
    settings: {
      language: 'zh-CN',
      themeMode: 'system',
      wallpaper: '/scenery1.jpg',
      customWallpapers: [],
      hour12: false,
      showDate: true,
      cleanMode: false,
      searchEngine: 'baidu',
      searchEngines: [],
      placementMode: 'compact',
    },
  }
}

describe('configTransfer 配置导入导出工具', () => {
  it('序列化后可原样解析回持久化状态', () => {
    const state = buildState()
    expect(parseLauncherStateBackup(serializeLauncherState(state))).toEqual(state)
  })

  it('拒绝非 JSON 文本与非对象结构', () => {
    expect(parseLauncherStateBackup('not json')).toBeNull()
    expect(parseLauncherStateBackup('[1,2]')).toBeNull()
    expect(parseLauncherStateBackup('null')).toBeNull()
  })

  it('拒绝版本不符或缺少关键字段的备份', () => {
    const state = buildState()
    expect(parseLauncherStateBackup(JSON.stringify({ ...state, version: 2 }))).toBeNull()
    expect(parseLauncherStateBackup(JSON.stringify({ ...state, screens: {} }))).toBeNull()
    expect(parseLauncherStateBackup(JSON.stringify({ ...state, dock: null }))).toBeNull()
    expect(parseLauncherStateBackup(JSON.stringify({ ...state, settings: [] }))).toBeNull()
  })

  it('生成按日期命名的备份文件名', () => {
    expect(buildConfigBackupFilename(new Date(2026, 7, 9))).toBe('patab-config-20260809.json')
  })
})
