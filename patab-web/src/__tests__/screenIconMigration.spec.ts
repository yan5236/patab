/** 应用屏幕图标持久化迁移测试：旧 Emoji 应在初始化时转换为 Lucide 名称。 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialLauncherState, STORAGE_KEY } from '@/stores/launcherState'

describe('screen icon migration', () => {
  beforeEach(() => localStorage.clear())

  it('迁移旧 Emoji，并让首次使用数据直接采用 Lucide 名称', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        screens: [{ id: 'screen', name: 'AI', icon: '🤖', tiles: [] }],
        dock: [],
        todos: [],
        todoLists: [],
        settings: {
          wallpaper: '/scenery1.jpg',
          customWallpapers: [],
          hour12: false,
          searchEngine: 'baidu',
          placementMode: 'compact',
        },
      }),
    )

    expect(createInitialLauncherState().screens[0]?.icon).toBe('Bot')

    localStorage.clear()
    expect(createInitialLauncherState().screens.map((screen) => screen.icon)).toEqual([
      'Bot',
      'BookOpen',
    ])
  })
})
