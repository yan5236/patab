/**
 * useLongPressDrag —— 长按拖拽引擎（Pointer Events 实现，不依赖 HTML5 DnD）
 *
 * 交互流程：
 * 1. pointerdown 启动长按计时（LONG_PRESS_MS）；期间移动超过阈值或抬起则取消，退化为普通点击
 * 2. 计时触发后进入拖拽态：写入 drag store（App.vue 据此渲染跟随指针的幽灵图标）
 * 3. pointermove 用 elementFromPoint + [data-drop] 属性做命中检测，更新悬停目标；
 *    悬停分页指示点一段时间后自动切换屏幕（实现拖拽跨屏）
 * 4. pointerup 调用 launcher.handleDrop 完成数据移动；ESC / pointercancel 取消
 *
 * 放置目标通过 data 属性声明身份（各组件自行标注）：
 *   data-drop="cell"        + data-zone="screen|folder" + data-container + data-index
 *   data-drop="folder-tile" + data-folder
 *   data-drop="dock"        + data-index
 *   data-drop="pager"       + data-screen
 *   data-drop="folder-outside"
 */
import { onBeforeUnmount } from 'vue'
import type { DragSource, DropTarget, Tile } from '@/types'
import { useDragStore, dropTargetKey } from '@/stores/drag'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { getPressMoveDecision } from '@/utils/dragGesture'
import {
  cellFromPoint,
  COLS,
  insertionIndex,
  insertionSlotFromGeometry,
  packOrder,
  rowMajorOrder,
  tileAt,
} from '@/utils/grid'

/** 当前是否为手机端流式布局视口（与 ScreenGrid 的 max-width:640px 媒体查询一致） */
function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 640px)').matches
}

/** 长按触发时长（毫秒） */
const LONG_PRESS_MS = 300
/** 长按期间允许的指针抖动阈值（像素），超过则取消长按 */
const MOVE_TOLERANCE = 8
/** 拖拽悬停分页指示点多久后自动切屏（毫秒） */
const PAGER_HOVER_SWITCH_MS = 500
/** 从文件夹内拖出、悬停面板外多久后自动关闭文件夹（毫秒） */
const FOLDER_CLOSE_HOVER_MS = 300
/** 紧凑模式：拖拽悬停到文件夹图标上，靠近边缘多少像素内才让文件夹「让位」以便重新排序（像素） */
const FOLDER_YIELD_MARGIN = 10
/** 触摸长按菜单相对手指的偏移，避免菜单挡住后续拖拽起手路径 */
const TOUCH_MENU_OFFSET_X = 28
const TOUCH_MENU_OFFSET_Y = 132
/** 紧凑让位预览的指针距离迟滞（像素）：距上次让位提交不足此值不重建预览，吸收手指微抖 */
const COMMIT_GATE = 6
type ScrollAxis = 'x' | 'y'

/** 被拖拽元素需要提供的载荷（图块本体 + 来源位置） */
export interface DragPayload {
  tile: Tile
  source: DragSource
}

/** 解析指针下方的放置目标元素 */
function resolveTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)
  const dropEl = el?.closest<HTMLElement>('[data-drop]')
  if (!dropEl) return null
  const d = dropEl.dataset
  switch (d.drop) {
    case 'cell':
      return {
        kind: 'cell',
        zone: d.zone === 'folder' ? 'folder' : 'screen',
        containerId: d.container ?? '',
        index: Number(d.index ?? 0),
      }
    case 'slot':
      return {
        kind: 'slot',
        screenId: d.screen ?? '',
        col: Number(d.col ?? 0),
        row: Number(d.row ?? 0),
      }
    case 'folder-tile':
      return { kind: 'folder-tile', folderId: d.folder ?? '' }
    case 'dock':
      return { kind: 'dock', index: Number(d.index ?? 0) }
    case 'pager':
      return { kind: 'pager', screenId: d.screen ?? '' }
    case 'folder-outside':
      return { kind: 'folder-outside' }
    default:
      return null
  }
}

/** 基础合法性过滤（用于悬停高亮；最终校验在 launcher.handleDrop） */
function isValidTarget(tile: Tile, target: DropTarget | null): DropTarget | null {
  if (!target) return null
  const isShortcut = tile.type === 'shortcut'
  if (target.kind === 'folder-tile' && (!isShortcut || target.folderId === tile.id)) return null
  if (target.kind === 'dock' && !isShortcut) return null
  if (target.kind === 'cell' && target.zone === 'folder' && !isShortcut) return null
  return target
}

/** 查找最近的可滚动祖先，用于图标禁用原生 pan 后保留普通滑动体验 */
function findScrollableAncestor(el: HTMLElement | null, axis: ScrollAxis): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const style = window.getComputedStyle(node)
    const overflow = axis === 'x' ? style.overflowX : style.overflowY
    const canScroll =
      /(auto|scroll|overlay)/.test(overflow) &&
      (axis === 'x' ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight)
    if (canScroll) return node
    node = node.parentElement
  }
  return null
}

export function useLongPressDrag(getPayload: () => DragPayload | null) {
  const dragStore = useDragStore()
  const launcher = useLauncherStore()
  const ui = useUiStore()

  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pagerTimer: ReturnType<typeof setTimeout> | undefined
  let folderCloseTimer: ReturnType<typeof setTimeout> | undefined
  /** 上次让位预览提交时的指针坐标（用于 COMMIT_GATE 距离迟滞） */
  let lastCommitX = 0
  let lastCommitY = 0
  let lastHoverKey = ''
  let startX = 0
  let startY = 0
  let pointerType = ''
  let pressTarget: EventTarget | null = null
  let pressElement: HTMLElement | null = null
  let pointerId: number | null = null
  let touchMenuOpened = false
  let mouseDragArmed = false
  let removeNativeMenuBlockTimer: ReturnType<typeof setTimeout> | undefined
  let scrollElement: HTMLElement | null = null
  let scrollAxis: ScrollAxis | null = null
  let lastScrollX = 0
  let lastScrollY = 0
  /** 来源图块的像素尺寸（长按判定阶段捕获，供幽灵图标等比还原） */
  let srcW = 0
  let srcH = 0
  /** 指针在来源图块内的按下偏移，避免幽灵图块拖拽开始时跳到指针中心 */
  let srcOffsetX = 0
  let srcOffsetY = 0
  let activePayload: DragPayload | null = null

  /* ---------- 阶段一：长按判定 ---------- */

  function onPointerdown(event: PointerEvent) {
    // 仅响应主键（左键 / 触摸）；右键留给右键菜单
    if (event.button !== 0) return
    // 小组件内部的交互区（输入框、待办列表等）不触发拖拽
    if ((event.target as HTMLElement).closest('[data-nodrag]')) return
    const payload = getPayload()
    if (!payload) return
    activePayload = payload
    startX = event.clientX
    startY = event.clientY
    pointerType = event.pointerType
    pressTarget = event.target
    pressElement = event.currentTarget as HTMLElement
    pointerId = event.pointerId
    touchMenuOpened = false
    mouseDragArmed = false
    // 在按下时捕获来源尺寸：此刻元素确定存在、布局稳定
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    srcW = rect.width
    srcH = rect.height
    srcOffsetX = event.clientX - rect.left
    srcOffsetY = event.clientY - rect.top
    pressTimer = setTimeout(() => {
      if (pointerType === 'touch') openTouchMenu()
      else mouseDragArmed = true
    }, LONG_PRESS_MS)
    window.addEventListener('pointermove', onPrePressMove)
    window.addEventListener('pointerup', cancelPress)
    window.addEventListener('pointercancel', cancelPress)
  }

  /** 长按未触发前移动过大 → 取消（视为点击或滚动） */
  function onPrePressMove(event: PointerEvent) {
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const decision = getPressMoveDecision(dx, dy, MOVE_TOLERANCE, touchMenuOpened, mouseDragArmed)
    if (decision === 'wait') return
    if (decision === 'drag') {
      beginDrag(event.clientX, event.clientY)
      return
    }
    if (pointerType === 'touch' && beginManualScroll(event, dx, dy)) return
    cancelPress()
  }

  /** 触摸长按先打开业务菜单；继续拖动时再进入拖拽并自动关闭菜单 */
  function openTouchMenu() {
    touchMenuOpened = true
    clearTimeout(pressTimer)
    clearTimeout(removeNativeMenuBlockTimer)
    const target = pressTarget instanceof Element ? pressTarget : null
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: startX + TOUCH_MENU_OFFSET_X,
        clientY: startY - TOUCH_MENU_OFFSET_Y,
      }),
    )
    // 先派发业务 contextmenu，再拦截浏览器随后补发的原生 contextmenu
    window.addEventListener('contextmenu', blockNativeTouchMenu, { capture: true })
    // 只吞掉落在原图块上的 click（避免抬手时误触发"打开网址"），不吞菜单项点击
    window.addEventListener('click', swallowTouchClick, { capture: true, once: true })
  }

  function cancelPress() {
    clearTimeout(pressTimer)
    mouseDragArmed = false
    window.removeEventListener('pointermove', onPrePressMove)
    window.removeEventListener('pointerup', cancelPress)
    window.removeEventListener('pointercancel', cancelPress)
    releasePointer()
    if (touchMenuOpened) {
      removeNativeMenuBlockTimer = setTimeout(removeNativeMenuBlock, 600)
      // 若浏览器未补发 click，once 监听会残留并误吞下一次点击，延迟清理
      setTimeout(() => window.removeEventListener('click', swallowTouchClick, { capture: true }), 80)
    } else {
      removeNativeMenuBlock()
    }
  }

  /** 长按前移动到可滚动区域时，手动滚动最近容器，避免 touch-action:none 阻断普通滑动 */
  function beginManualScroll(event: PointerEvent, dx: number, dy: number) {
    const axis: ScrollAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    const el = findScrollableAncestor(pressElement, axis)
    if (!el) return false
    event.preventDefault()
    scrollElement = el
    scrollAxis = axis
    lastScrollX = event.clientX
    lastScrollY = event.clientY
    cancelPress()
    window.addEventListener('pointermove', onManualScrollMove, { passive: false })
    window.addEventListener('pointerup', endManualScroll)
    window.addEventListener('pointercancel', endManualScroll)
    return true
  }

  /** 跟随手指位移滚动容器；只在长按尚未成立时启用 */
  function onManualScrollMove(event: PointerEvent) {
    if (!scrollElement || !scrollAxis) return
    event.preventDefault()
    if (scrollAxis === 'x') {
      scrollElement.scrollLeft += lastScrollX - event.clientX
    } else {
      scrollElement.scrollTop += lastScrollY - event.clientY
    }
    lastScrollX = event.clientX
    lastScrollY = event.clientY
  }

  function endManualScroll() {
    scrollElement = null
    scrollAxis = null
    activePayload = null
    pressTarget = null
    pressElement = null
    pointerId = null
    window.removeEventListener('pointermove', onManualScrollMove)
    window.removeEventListener('pointerup', endManualScroll)
    window.removeEventListener('pointercancel', endManualScroll)
  }

  /** 屏蔽触摸长按后浏览器补发的原生 contextmenu，避免覆盖偏移后的业务菜单位置 */
  function blockNativeTouchMenu(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
  }

  function removeNativeMenuBlock() {
    clearTimeout(removeNativeMenuBlockTimer)
    window.removeEventListener('contextmenu', blockNativeTouchMenu, { capture: true })
  }

  /* ---------- 阶段二：拖拽会话 ---------- */

  function beginDrag(x: number, y: number) {
    cancelPress()
    if (!activePayload) return
    capturePointer()
    ui.closeContextMenu()
    dragStore.start(activePayload.tile, activePayload.source, x, y, srcW, srcH, srcOffsetX, srcOffsetY)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
    window.addEventListener('pointercancel', abortDrag)
    window.addEventListener('keydown', onKeydown)
    // 吞掉拖拽结束后紧跟的 click，避免误触发"打开网址"
    window.addEventListener('click', swallowClick, { capture: true, once: true })
  }

  function onDragMove(event: PointerEvent) {
    if (!dragStore.tile) return
    const target = resolveDropTarget(event.clientX, event.clientY)
    dragStore.update(event.clientX, event.clientY, target)
    applyHoverTimers(target)
  }

  /**
   * 统一解析当前指针下的放置目标（move / up 共用）：
   * 紧凑模式优先命中主屏网格并写入让位预览；否则走通用命中检测（Dock / 文件夹 / 分页点等）。
   */
  function resolveDropTarget(x: number, y: number): DropTarget | null {
    const dragTile = dragStore.tile
    if (!dragTile) return null
    if (launcher.settings.placementMode === 'compact') {
      const gridTarget = resolveCompactPreview(x, y)
      if (gridTarget) return gridTarget
      // 离开网格：清预览，落回通用目标
      dragStore.clearCompactPreview()
    }
    return isValidTarget(dragTile, resolveTarget(x, y))
  }

  /**
   * 紧凑模式让位预览：命中主屏网格则计算并写入预览坐标，返回 grid 落点；未命中返回 null。
   * 被拖图块从当前序列排除，按悬停格算插入下标后重新紧凑打包，得到全屏图块预览坐标。
   */
  function resolveCompactPreview(x: number, y: number): DropTarget | null {
    const dragTile = dragStore.tile
    if (!dragTile) return null
    const gridEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop="grid"]')
    if (!gridEl) return null
    const screenId = gridEl.dataset.screen ?? ''
    const screen = launcher.findScreen(screenId)
    if (!screen) return null
    const rect = gridEl.getBoundingClientRect()
    const mobile = isMobileViewport()
    // 悬停格坐标仅桌面端 8 列模型有效；手机端为流式网格，此坐标无意义故不用于命中判定
    const { col, row } = cellFromPoint(rect, x, y)
    const directTarget = isValidTarget(dragTile, resolveTarget(x, y))

    // 悬停到文件夹图标上：仅在指针真正位于文件夹图块 DOM 上且未靠近边缘时，
    // 才视为「可放入文件夹」目标并保持文件夹不让位；靠近边缘时允许走下方让位逻辑，文件夹会移开。
    // 桌面端用真实布局格坐标兜底判定（不受让位位移影响）；手机端 8 列格坐标与 4 列视觉网格错位，
    // 会把手指误判到文件夹逻辑格上（触发无谓的 clearCompactPreview → 空位卡回原位），故手机端只信 DOM 命中。
    if (dragTile.type === 'shortcut') {
      const hovered =
        directTarget?.kind === 'folder-tile'
          ? launcher.findFolder(directTarget.folderId)
          : mobile
            ? undefined
            : tileAt(screen.tiles, col, row, dragTile.id)
      if (hovered?.type === 'folder') {
        // 只有 DOM 直接命中文件夹图块时，才按几何边缘判断是否保持「可放入」状态。
        const folderEl =
          directTarget?.kind === 'folder-tile'
            ? document.querySelector<HTMLElement>(`[data-drop="folder-tile"][data-folder="${hovered.id}"]`)
            : null
        if (folderEl) {
          const rect = folderEl.getBoundingClientRect()
          const nearEdge =
            x <= rect.left + FOLDER_YIELD_MARGIN ||
            x >= rect.right - FOLDER_YIELD_MARGIN ||
            y <= rect.top + FOLDER_YIELD_MARGIN ||
            y >= rect.bottom - FOLDER_YIELD_MARGIN
          if (!nearEdge) {
            dragStore.clearCompactPreview()
            return { kind: 'folder-tile', folderId: hovered.id }
          }
        }
        // 在边缘、或仅网格坐标命中但 DOM 未命中 → 落到下方让位逻辑，文件夹随之让开
      }
    }

    // 排除被拖图块后的当前行主序序列 → 悬停格插入下标
    const order = rowMajorOrder(screen.tiles).filter((t) => t.id !== dragTile.id)
    const index = resolveCompactIndex(gridEl, order, x, y, col, row, mobile)
    // 插入下标未变（仍在同格同屏）则复用现有预览，避免每次移动重建 Map 触发无谓重排/动画
    if (dragStore.previewScreenId === screenId && dragStore.compactIndex === index) {
      return { kind: 'grid', screenId, index }
    }
    // 距离迟滞：同屏且指针距上次让位提交不足 COMMIT_GATE 时，不重建预览，
    // 吸收手指微抖跨中心线导致的下标抖动（沿用上次预览下标）。首次进入网格（previewScreenId 为 null）不受此限。
    if (
      dragStore.previewScreenId === screenId &&
      Math.hypot(x - lastCommitX, y - lastCommitY) < COMMIT_GATE
    ) {
      return { kind: 'grid', screenId, index: dragStore.compactIndex }
    }
    lastCommitX = x
    lastCommitY = y
    order.splice(index, 0, dragTile)
    dragStore.setCompactPreview(screenId, packOrder(order), index)
    return { kind: 'grid', screenId, index }
  }

  /** 根据当前响应式布局计算紧凑模式插入下标：桌面端用 8 列固定格坐标，手机端用流式网格几何 */
  function resolveCompactIndex(
    gridEl: HTMLElement,
    order: Tile[],
    x: number,
    y: number,
    col: number,
    row: number,
    mobile: boolean,
  ): number {
    const rect = gridEl.getBoundingClientRect()
    // 桌面端固定 8 列坐标网格：由指针在悬停格内的水平比例判定「插到该格之前/之后」，
    // 右半 → after，令「落到满行最后一个图标之后」在本行内即可达。
    if (!mobile) {
      const cw = rect.width / COLS
      const frac = (x - rect.left) / cw - col // 悬停格内水平比例 [0,1)
      return insertionIndex(order, col, row, frac > 0.5)
    }
    // 手机端流式网格：读网格实际渲染的列数/格距做纯几何换算得到流式插入槽位，
    // 不读各图块矩形——避免被拖图标占预览槽位、测量又排除它形成的自我参照反馈（空位滞后手指一格 / 疯狂闪烁）。
    const cs = getComputedStyle(gridEl)
    const colWidths = cs.gridTemplateColumns.split(' ').filter(Boolean)
    const cols = Math.max(1, colWidths.length)
    const cellW = parseFloat(colWidths[0] ?? '') || rect.width / cols
    const rowH = parseFloat(cs.gridAutoRows) || parseFloat(cs.gridTemplateRows) || cellW
    const pitchX = cellW + (parseFloat(cs.columnGap) || 0)
    const pitchY = rowH + (parseFloat(cs.rowGap) || 0)
    const relX = x - rect.left - (parseFloat(cs.paddingLeft) || 0) + gridEl.scrollLeft
    const relY = y - rect.top - (parseFloat(cs.paddingTop) || 0) + gridEl.scrollTop
    const slot = insertionSlotFromGeometry(relX, relY, pitchX, pitchY, cols)
    // 槽位可能超出实际图块数（手指落在末行空白）→ 夹紧为「追加到末尾」
    return Math.min(slot, order.length)
  }


  function applyHoverTimers(target: DropTarget | null) {
    const key = dropTargetKey(target)
    if (key === lastHoverKey) return
    lastHoverKey = key
    clearTimeout(pagerTimer)
    clearTimeout(folderCloseTimer)
    // 悬停分页指示点：停留一段时间自动切换到对应屏幕
    if (target?.kind === 'pager') {
      const screenId = target.screenId
      pagerTimer = setTimeout(() => ui.goToScreenById(screenId), PAGER_HOVER_SWITCH_MS)
    }
    // 从文件夹内拖出、悬停面板外一段时间 → 自动关闭文件夹，露出主屏以精确落位
    if (dragStore.source?.kind === 'folder' && target?.kind === 'folder-outside') {
      folderCloseTimer = setTimeout(() => ui.closeFolder(), FOLDER_CLOSE_HOVER_MS)
    }
  }

  function onDragUp(event: PointerEvent) {
    const tile = dragStore.tile
    const source = dragStore.source
    const target = resolveDropTarget(event.clientX, event.clientY)
    if (tile && source && target) {
      const selected = ui.managementMode && ui.selectedTileIds.includes(tile.id)
        ? [...ui.selectedTileIds]
        : [tile.id]
      if (selected.length > 1) launcher.handleBatchDrop(selected, tile.id, source, target)
      else launcher.handleDrop(tile.id, source, target)
      ui.cleanupManagedSelection()
    }
    finishDrag()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') abortDrag()
  }

  /** 取消拖拽（不放置） */
  function abortDrag() {
    finishDrag()
  }

  function finishDrag() {
    clearTimeout(pagerTimer)
    clearTimeout(folderCloseTimer)
    removeNativeMenuBlock()
    lastCommitX = 0
    lastCommitY = 0
    lastHoverKey = ''
    activePayload = null
    pressTarget = null
    mouseDragArmed = false
    releasePointer()
    pressElement = null
    pointerId = null
    touchMenuOpened = false
    dragStore.end()
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    window.removeEventListener('pointercancel', abortDrag)
    window.removeEventListener('keydown', onKeydown)
    // 拖拽结束后紧跟的 click（浏览器派发到 down/up 公共祖先）会被上面的捕获监听吞掉；
    // 若没有 click 产生，短延时后强制移除，避免误吞下一次正常点击
    setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 80)
  }

  function swallowClick(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  /** 触摸长按后，吞掉落在原图块上的抬手 click，避免误触发打开网址；菜单项点击不吞 */
  function swallowTouchClick(event: MouseEvent) {
    if (pressElement && pressElement.contains(event.target as Node)) {
      event.stopPropagation()
      event.preventDefault()
    }
  }

  /** 捕获当前 pointer，避免触摸拖拽中途被浏览器或滚动容器切断 */
  function capturePointer() {
    if (pointerId === null || !pressElement) return
    try {
      if (!pressElement.hasPointerCapture(pointerId)) pressElement.setPointerCapture(pointerId)
    } catch {
      // 某些浏览器在 pointer 已取消时会抛错；此处静默退化为 window 监听。
    }
  }

  function releasePointer() {
    if (pointerId === null || !pressElement) return
    try {
      if (pressElement.hasPointerCapture(pointerId)) pressElement.releasePointerCapture(pointerId)
    } catch {
      // pointer 已结束时释放失败无副作用。
    }
  }

  onBeforeUnmount(() => {
    cancelPress()
    endManualScroll()
    // 注意：这里不能调用 finishDrag() —— 拖拽悬停分页指示点自动切屏时，
    // 来源图块组件会随旧屏幕一起被卸载，但拖拽监听器都挂在 window 上、闭包依然有效，
    // 会话必须保留到 pointerup 才能完成跨屏放置；结束时 finishDrag 会移除全部监听器，不会泄漏
  })

  return { onPointerdown }
}
