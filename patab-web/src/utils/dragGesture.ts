/**
 * 判断长按判定阶段的移动结果。
 * 未超过阈值继续等待；超过阈值后，已打开触摸菜单则转拖拽，否则取消长按。
 */
export function getPressMoveDecision(
  deltaX: number,
  deltaY: number,
  tolerance: number,
  touchMenuOpened: boolean,
): 'wait' | 'cancel' | 'drag' {
  if (Math.abs(deltaX) <= tolerance && Math.abs(deltaY) <= tolerance) return 'wait'
  return touchMenuOpened ? 'drag' : 'cancel'
}
