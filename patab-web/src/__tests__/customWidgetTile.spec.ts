import { describe, expect, it } from 'vitest'

import type { CustomWidgetTile, Tile } from '@/types'

/**
 * 固化第三方图块在主状态中只保存轻量引用的联合类型契约。
 */
describe('CustomWidgetTile', () => {
  /**
   * 验证自定义组件分支同时保留组件、实例、variant、尺寸与停用字段，且可以作为普通主屏图块持久化。
   */
  it('作为独立 WidgetTile 联合分支保存轻量实例引用', () => {
    const customTile: CustomWidgetTile = {
      id: 'tile-1',
      type: 'widget',
      widgetType: 'custom',
      componentId: 'com.example.weather',
      instanceId: 'instance-1',
      variantId: 'forecast',
      size: { w: 3, h: 2 },
      disabled: true,
    }
    const tiles: Tile[] = [customTile]

    expect(tiles[0]).toMatchObject({
      widgetType: 'custom',
      componentId: 'com.example.weather',
      instanceId: 'instance-1',
      disabled: true,
    })
  })
})
