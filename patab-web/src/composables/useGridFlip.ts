/**
 * useGridFlip —— 网格图块「让位」FLIP 动画（容器级）
 *
 * 紧凑模式下拖拽会不断改写各图块的预览坐标（drag.previewPositions），
 * 但 CSS grid 的行列变更不会自带过渡、图块会瞬移。本组合式用 FLIP 技术补上平滑滑动：
 * 1. 预览变更「前」（flush:'pre'，组件重渲染之前）记录各图块当前位置 = First
 * 2. 预览变更「后」（flush:'post'，DOM 已按新坐标布局）读取新位置 = Last
 * 3. Invert：瞬间用 transform 把图块拉回旧位置；Play：下一帧过渡到 0，形成滑动
 *
 * 图块根元素需标注 data-flip-tile="<tileId>" 以便采集。
 */
import { watch, type Ref } from 'vue'
import { useDragStore } from '@/stores/drag'

/** 让位滑动时长（毫秒） */
const FLIP_MS = 180

export function useGridFlip(containerRef: Ref<HTMLElement | null>) {
  const drag = useDragStore()

  /** 变更前采集的各图块位置（id → rect） */
  let firstRects: Map<string, DOMRect> | null = null

  /** 采集容器内全部图块当前的屏幕位置 */
  function captureRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>()
    const container = containerRef.value
    if (!container) return map
    container.querySelectorAll<HTMLElement>('[data-flip-tile]').forEach((el) => {
      const id = el.dataset.flipTile
      if (id) map.set(id, el.getBoundingClientRect())
    })
    return map
  }

  /** 对比新旧位置，先反向位移再过渡归零，播放滑动 */
  function play() {
    const container = containerRef.value
    if (!container || !firstRects) return
    container.querySelectorAll<HTMLElement>('[data-flip-tile]').forEach((el) => {
      const id = el.dataset.flipTile
      if (!id) return
      const first = firstRects!.get(id)
      if (!first) return
      const last = el.getBoundingClientRect()
      const dx = first.left - last.left
      const dy = first.top - last.top
      if (dx === 0 && dy === 0) return
      // Invert：瞬间拉回旧位置
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      // Play：下一帧过渡到原位
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_MS}ms ease`
        el.style.transform = ''
      })
    })
  }

  // 变更前记录 First（组件重渲染之前，DOM 仍是旧布局）
  watch(() => drag.previewPositions, () => {
    firstRects = captureRects()
  }, { flush: 'pre' })

  // 变更后播放（DOM 已按新坐标重排）
  watch(() => drag.previewPositions, () => {
    play()
  }, { flush: 'post' })
}
