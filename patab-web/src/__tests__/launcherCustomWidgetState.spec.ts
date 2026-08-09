import { beforeEach, describe, expect, it } from 'vitest'

import { STORAGE_KEY, createInitialLauncherState } from '@/stores/launcherState'
import type { LauncherState } from '@/types'

/**
 * 创建足以经现有 launcher 初始化路径读取的最小持久化状态。
 */
function createPersistedState(tiles: unknown[]): LauncherState {
  return {
    version: 1,
    screens: [{ id: 'screen-1', name: '测试屏幕', icon: 'Bot', tiles: tiles as LauncherState['screens'][number]['tiles'] }],
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

/**
 * 覆盖自定义组件引用在 launcher 启动清洗中的兼容与不丢失规则。
 */
describe('自定义组件图块持久化清洗', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  /**
   * 验证不读取组件仓库时，格式正确的缺包引用仍会保留其组件、实例、variant 与停用状态。
   */
  it('保留格式正确但暂时缺包的自定义实例引用', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createPersistedState([
      {
        id: 'custom-1',
        type: 'widget',
        widgetType: 'custom',
        componentId: 'com.example.weather',
        instanceId: 'instance-1',
        variantId: 'forecast',
        size: { w: 2, h: 2 },
        disabled: true,
      },
    ])))

    const tile = createInitialLauncherState().screens[0]?.tiles[0]

    expect(tile).toMatchObject({
      type: 'widget',
      widgetType: 'custom',
      componentId: 'com.example.weather',
      instanceId: 'instance-1',
      variantId: 'forecast',
      size: { w: 2, h: 2 },
      disabled: true,
    })
  })

  /**
   * 验证缺少必需 id 的引用被删除，而有效引用的非法尺寸、空 variant 和错误停用值只会被安全清除。
   */
  it('拒绝无效引用并清除无效可选字段', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createPersistedState([
      {
        id: 'invalid',
        type: 'widget',
        widgetType: 'custom',
        componentId: '',
        instanceId: 'instance-invalid',
      },
      {
        id: 'custom-2',
        type: 'widget',
        widgetType: 'custom',
        componentId: 'com.example.valid',
        instanceId: 'instance-2',
        variantId: ' ',
        size: { w: 9, h: 9 },
        disabled: 'true',
      },
    ])))

    const tiles = createInitialLauncherState().screens[0]?.tiles ?? []

    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({
      id: 'custom-2',
      componentId: 'com.example.valid',
      instanceId: 'instance-2',
    })
    expect(tiles[0]).not.toHaveProperty('variantId')
    expect(tiles[0]).not.toHaveProperty('size')
    expect(tiles[0]).not.toHaveProperty('disabled')
  })
})
