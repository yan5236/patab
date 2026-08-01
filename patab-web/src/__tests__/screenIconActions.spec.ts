/** 屏幕图标 action 测试：所有写入入口都只保存可渲染的 Lucide 名称。 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLauncherStore } from '@/stores/launcher'

describe('screen icon actions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('创建和更新屏幕时规范化图标', () => {
    const store = useLauncherStore()
    const screen = store.addScreen('设计', '🎨')

    expect(screen.icon).toBe('Palette')

    store.updateScreen(screen.id, { name: '设计', icon: '非法名称' })
    expect(screen.icon).toBe('LayoutGrid')
  })
})
