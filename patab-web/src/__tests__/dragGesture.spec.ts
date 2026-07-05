/**
 * dragGesture 单元测试
 * 覆盖长按前后的移动判定，避免移动端某一方向被误判而无法进入拖拽。
 */
import { describe, expect, it } from 'vitest'
import { getPressMoveDecision } from '@/utils/dragGesture'

describe('dragGesture 触摸手势判定', () => {
  it('长按菜单未打开时，任意方向超过阈值都取消长按', () => {
    expect(getPressMoveDecision(0, 9, 8, false)).toBe('cancel')
    expect(getPressMoveDecision(0, -9, 8, false)).toBe('cancel')
    expect(getPressMoveDecision(9, 0, 8, false)).toBe('cancel')
    expect(getPressMoveDecision(-9, 0, 8, false)).toBe('cancel')
  })

  it('长按菜单已打开后，任意方向超过阈值都进入拖拽', () => {
    expect(getPressMoveDecision(0, 9, 8, true)).toBe('drag')
    expect(getPressMoveDecision(0, -9, 8, true)).toBe('drag')
    expect(getPressMoveDecision(9, 0, 8, true)).toBe('drag')
    expect(getPressMoveDecision(-9, 0, 8, true)).toBe('drag')
  })

  it('鼠标长按已待命后，移动超过阈值才进入拖拽', () => {
    expect(getPressMoveDecision(0, 0, 8, false, true)).toBe('wait')
    expect(getPressMoveDecision(9, 0, 8, false, true)).toBe('drag')
  })

  it('移动未超过阈值时继续等待长按结果', () => {
    expect(getPressMoveDecision(8, 8, 8, false)).toBe('wait')
    expect(getPressMoveDecision(8, 8, 8, true)).toBe('wait')
  })
})
