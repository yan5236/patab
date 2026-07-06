/**
 * useTodoDrag —— 列表项长按拖拽排序（Pointer Events）
 *
 * 用于待办弹窗/小组件中的 todo 行，以及侧边栏列表项的拖拽重排。
 * 不依赖 HTML5 DnD，长按触发后显示指示线，松手提交新顺序。
 *
 * 使用方式：
 *   1. 给可排序容器设置 ref。
 *   2. 给每个排序项设置 data-reorder-id="id"。
 *   3. 在项的最外层元素绑定 @pointerdown="(e) => onPointerDown(e, id)"。
 *   4. 用 draggingId / indicatorIndex / indicatorStyle 渲染拖拽态与指示线。
 */
import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'

interface UseTodoDragOptions {
  /** 排序容器 ref */
  containerRef: Ref<HTMLElement | null>
  /** 当前 id 顺序 */
  ids: Ref<string[]> | ComputedRef<string[]>
  /** 拖拽结束后回调，参数为新 id 顺序 */
  onReorder: (orderedIds: string[]) => void
  /** 长按触发时长（毫秒） */
  longPressMs?: number
  /** 长按期间允许的最大移动像素 */
  moveTolerance?: number
}

const DEFAULT_LONG_PRESS_MS = 300
const DEFAULT_MOVE_TOLERANCE = 8

/** 判断元素或其祖先是否应阻止拖拽启动 */
function isNonDragTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  return !!el.closest('input, textarea, button, a, [data-nodrag]')
}

export function useTodoDrag(options: UseTodoDragOptions) {
  const { containerRef, ids, onReorder, longPressMs = DEFAULT_LONG_PRESS_MS, moveTolerance = DEFAULT_MOVE_TOLERANCE } = options

  const draggingId = ref<string | null>(null)
  const pointerX = ref(0)
  const pointerY = ref(0)

  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let startX = 0
  let startY = 0
  let pointerId: number | null = null
  let pressElement: HTMLElement | null = null
  let hasMoved = false
  let suppressedClick = false

  const indicatorIndex = ref<number | null>(null)

  const indicatorStyle = computed(() => {
    const container = containerRef.value
    const draggedId = draggingId.value
    const index = indicatorIndex.value
    if (!container || !draggedId || index === null || index < 0) return null

    // 排除被拖拽项，与 resolveInsertionIndex 保持一致，避免指示线位置偏移
    const items = getItemElements(container).filter((el) => el.dataset.reorderId !== draggedId)
    if (items.length === 0) return null

    // 指示线位置：插在第 index 项之前 = 取第 index 项的上边；插在最后 = 取最后一项的下边
    const target = items[Math.min(index, items.length - 1)]
    if (!target) return null

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const top = index >= items.length
      ? targetRect.bottom - containerRect.top
      : targetRect.top - containerRect.top

    return {
      top: `${top}px`,
      left: '0',
      right: '0',
      height: '2px',
    }
  })

  function getItemElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-reorder-id]'))
  }

  function resolveInsertionIndex(container: HTMLElement, draggedId: string, y: number): number {
    const items = getItemElements(container).filter((el) => el.dataset.reorderId !== draggedId)
    if (items.length === 0) return 0

    const containerRect = container.getBoundingClientRect()
    const relY = y - containerRect.top + container.scrollTop

    for (let i = 0; i < items.length; i++) {
      const rect = items[i]!.getBoundingClientRect()
      const centerY = rect.top - containerRect.top + container.scrollTop + rect.height / 2
      if (relY < centerY) return i
    }
    return items.length
  }

  function beginDrag(id: string) {
    clearTimeout(pressTimer)
    draggingId.value = id
    suppressedClick = true
    if (pressElement) {
      try {
        if (pointerId !== null && pressElement.hasPointerCapture(pointerId)) {
          pressElement.releasePointerCapture(pointerId)
        }
      } catch {
        // ignore
      }
    }
  }

  function endDrag(commit: boolean) {
    clearTimeout(pressTimer)
    if (commit && draggingId.value !== null && indicatorIndex.value !== null) {
      const current = ids.value
      const dragged = draggingId.value
      const filtered = current.filter((id) => id !== dragged)
      const index = Math.max(0, Math.min(indicatorIndex.value, filtered.length))
      filtered.splice(index, 0, dragged)
      onReorder(filtered)
    }
    draggingId.value = null
    indicatorIndex.value = null
    pointerId = null
    pressElement = null
    hasMoved = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('click', swallowClick, { capture: true })
  }

  function swallowClick(event: MouseEvent) {
    if (!suppressedClick) return
    event.stopPropagation()
    event.preventDefault()
    suppressedClick = false
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (!draggingId.value) {
      // 长按判定阶段：移动过大则取消
      if (Math.hypot(dx, dy) > moveTolerance) {
        endDrag(false)
      }
      return
    }

    hasMoved = true
    event.preventDefault()
    pointerX.value = event.clientX
    pointerY.value = event.clientY

    const container = containerRef.value
    if (container && draggingId.value) {
      indicatorIndex.value = resolveInsertionIndex(container, draggingId.value, event.clientY)
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    endDrag(draggingId.value !== null)
  }

  function onPointerDown(event: PointerEvent, id: string) {
    if (event.button !== 0) return
    if (isNonDragTarget(event.target)) return

    const container = containerRef.value
    if (!container) return

    startX = event.clientX
    startY = event.clientY
    pointerId = event.pointerId
    pressElement = event.currentTarget as HTMLElement
    hasMoved = false
    suppressedClick = false

    // 捕获指针，避免滚动容器中断
    if (pressElement && pointerId !== null) {
      try {
        pressElement.setPointerCapture(pointerId)
      } catch {
        // ignore
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    // 拖拽结束后可能补发 click，统一吞掉
    window.addEventListener('click', swallowClick, { capture: true, once: true })

    pressTimer = setTimeout(() => beginDrag(id), longPressMs)
  }

  onBeforeUnmount(() => endDrag(false))

  return {
    draggingId,
    indicatorIndex,
    indicatorStyle,
    pointerX,
    pointerY,
    onPointerDown,
  }
}
