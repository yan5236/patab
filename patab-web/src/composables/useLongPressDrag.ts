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
import { cellFromPoint, insertionIndex, packOrder, rowMajorOrder, tileAt } from '@/utils/grid'

/** 长按触发时长（毫秒） */
const LONG_PRESS_MS = 300
/** 长按期间允许的指针抖动阈值（像素），超过则取消长按 */
const MOVE_TOLERANCE = 8
/** 拖拽悬停分页指示点多久后自动切屏（毫秒） */
const PAGER_HOVER_SWITCH_MS = 500
/** 从文件夹内拖出、悬停面板外多久后自动关闭文件夹（毫秒） */
const FOLDER_CLOSE_HOVER_MS = 300
/** 紧凑模式：拖拽悬停到文件夹图标上，多久内「不让位」以便放入文件夹（毫秒） */
const FOLDER_HOLD_MS = 500
/** 触摸长按菜单相对手指的偏移，避免菜单挡住后续拖拽起手路径 */
const TOUCH_MENU_OFFSET_X = 28
const TOUCH_MENU_OFFSET_Y = 132

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

export function useLongPressDrag(getPayload: () => DragPayload | null) {
  const dragStore = useDragStore()
  const launcher = useLauncherStore()
  const ui = useUiStore()

  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pagerTimer: ReturnType<typeof setTimeout> | undefined
  let folderCloseTimer: ReturnType<typeof setTimeout> | undefined
  /** 紧凑模式「文件夹保持窗口」计时器与状态 */
  let folderHoldTimer: ReturnType<typeof setTimeout> | undefined
  /** 当前正处于保持窗口的文件夹 id（null = 未悬停在文件夹上） */
  let pendingFolderId: string | null = null
  /** 保持窗口是否已超时（true = 允许该文件夹让位） */
  let folderYielded = false
  let lastHoverKey = ''
  let startX = 0
  let startY = 0
  let pointerType = ''
  let pressTarget: EventTarget | null = null
  let touchMenuOpened = false
  let removeNativeMenuBlockTimer: ReturnType<typeof setTimeout> | undefined
  /** 来源图块的像素尺寸（长按判定阶段捕获，供幽灵图标等比还原） */
  let srcW = 0
  let srcH = 0
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
    touchMenuOpened = false
    // 在按下时捕获来源尺寸：此刻元素确定存在、布局稳定
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    srcW = rect.width
    srcH = rect.height
    pressTimer = setTimeout(() => {
      if (pointerType === 'touch') openTouchMenu()
      else beginDrag(startX, startY)
    }, LONG_PRESS_MS)
    window.addEventListener('pointermove', onPrePressMove)
    window.addEventListener('pointerup', cancelPress)
  }

  /** 长按未触发前移动过大 → 取消（视为点击或滚动） */
  function onPrePressMove(event: PointerEvent) {
    if (
      Math.abs(event.clientX - startX) > MOVE_TOLERANCE ||
      Math.abs(event.clientY - startY) > MOVE_TOLERANCE
    ) {
      if (pointerType === 'touch' && touchMenuOpened) beginDrag(event.clientX, event.clientY)
      else cancelPress()
    }
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
    window.addEventListener('contextmenu', blockNativeTouchMenu, { capture: true })
    window.addEventListener('click', swallowClick, { capture: true, once: true })
  }

  function cancelPress() {
    clearTimeout(pressTimer)
    window.removeEventListener('pointermove', onPrePressMove)
    window.removeEventListener('pointerup', cancelPress)
    if (touchMenuOpened) {
      removeNativeMenuBlockTimer = setTimeout(removeNativeMenuBlock, 600)
    } else {
      removeNativeMenuBlock()
    }
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
    ui.closeContextMenu()
    dragStore.start(activePayload.tile, activePayload.source, x, y, srcW, srcH)
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
    const { col, row } = cellFromPoint(rect, x, y)

    // 悬停到文件夹图标上：短暂保持窗口内「不让位」，让用户可把快捷方式放进文件夹。
    // 用真实布局判定悬停格（不受让位位移影响，避免文件夹被推走后判不准）。
    if (dragTile.type === 'shortcut') {
      const hovered = tileAt(screen.tiles, col, row, dragTile.id)
      if (hovered?.type === 'folder') {
        // 进入某文件夹：开启保持窗口（超时后才允许让位）
        if (pendingFolderId !== hovered.id) {
          pendingFolderId = hovered.id
          folderYielded = false
          clearTimeout(folderHoldTimer)
          folderHoldTimer = setTimeout(onFolderHoldElapsed, FOLDER_HOLD_MS)
        }
        if (!folderYielded) {
          // 保持中：所有图块回真实位置（文件夹回到光标下），呈现「放入文件夹」目标
          dragStore.clearCompactPreview()
          return { kind: 'folder-tile', folderId: hovered.id }
        }
        // 已超时 → 落到下方让位逻辑，文件夹随之让开
      } else {
        resetFolderHold()
      }
    } else {
      resetFolderHold()
    }

    // 排除被拖图块后的当前行主序序列 → 悬停格插入下标
    const order = rowMajorOrder(screen.tiles).filter((t) => t.id !== dragTile.id)
    const index = insertionIndex(order, col, row)
    // 插入下标未变（仍在同格同屏）则复用现有预览，避免每次移动重建 Map 触发无谓重排/动画
    if (dragStore.previewScreenId === screenId && dragStore.compactIndex === index) {
      return { kind: 'grid', screenId, index }
    }
    order.splice(index, 0, dragTile)
    dragStore.setCompactPreview(screenId, packOrder(order), index)
    return { kind: 'grid', screenId, index }
  }

  /** 退出文件夹保持窗口（移开文件夹 / 拖非快捷方式时） */
  function resetFolderHold() {
    pendingFolderId = null
    folderYielded = false
    clearTimeout(folderHoldTimer)
  }

  /** 保持窗口超时：允许该文件夹让位，并用最后指针位置立即重算一次（此时无指针移动） */
  function onFolderHoldElapsed() {
    folderYielded = true
    if (!dragStore.tile) return
    const target = resolveDropTarget(dragStore.pointerX, dragStore.pointerY)
    dragStore.update(dragStore.pointerX, dragStore.pointerY, target)
    applyHoverTimers(target)
  }

  /** 悬停目标变化时重置分页自动切屏 / 文件夹自动关闭两个延时行为 */
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
      launcher.handleDrop(tile.id, source, target)
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
    resetFolderHold()
    lastHoverKey = ''
    activePayload = null
    pressTarget = null
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

  onBeforeUnmount(() => {
    cancelPress()
    // 注意：这里不能调用 finishDrag() —— 拖拽悬停分页指示点自动切屏时，
    // 来源图块组件会随旧屏幕一起被卸载，但拖拽监听器都挂在 window 上、闭包依然有效，
    // 会话必须保留到 pointerup 才能完成跨屏放置；结束时 finishDrag 会移除全部监听器，不会泄漏
  })

  return { onPointerdown }
}
