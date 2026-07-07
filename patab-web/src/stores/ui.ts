/**
 * ui store —— 界面瞬时状态（不持久化）
 *
 * 管理：当前应用屏幕、展开的文件夹、全局右键菜单、全局弹窗
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { MenuItem, ModalState } from '@/types'
import { useLauncherStore } from './launcher'

export const useUiStore = defineStore('ui', () => {
  const launcher = useLauncherStore()

  /* ---------- 应用屏幕切换 ---------- */

  const currentScreenIndex = ref(0)
  /** 切换方向：1 = 向右（新屏幕从右侧滑入），-1 = 向左；驱动过渡动画 */
  const screenDirection = ref(1)

  const currentScreen = computed(() => {
    // 屏幕被删除后索引可能越界，收敛到合法范围
    const index = Math.min(currentScreenIndex.value, launcher.screens.length - 1)
    return launcher.screens[Math.max(index, 0)]
  })

  /** 切换到指定下标的屏幕 */
  function goToScreen(index: number) {
    const clamped = Math.max(0, Math.min(index, launcher.screens.length - 1))
    if (clamped === currentScreenIndex.value) return
    screenDirection.value = clamped > currentScreenIndex.value ? 1 : -1
    currentScreenIndex.value = clamped
  }

  function goToScreenById(screenId: string) {
    const index = launcher.screens.findIndex((s) => s.id === screenId)
    if (index >= 0) goToScreen(index)
  }

  /* ---------- 文件夹展开 ---------- */

  const openFolderId = ref<string | null>(null)

  function openFolder(folderId: string) {
    openFolderId.value = folderId
  }

  function closeFolder() {
    openFolderId.value = null
  }

  /* ---------- 全局右键菜单 ---------- */

  const contextMenu = shallowRef<{ x: number; y: number; items: MenuItem[] } | null>(null)

  /** 在鼠标位置打开右键菜单（菜单项由调用方组装） */
  function openContextMenu(event: MouseEvent, items: MenuItem[]) {
    event.preventDefault()
    event.stopPropagation()
    contextMenu.value = { x: event.clientX, y: event.clientY, items }
  }

  function closeContextMenu() {
    contextMenu.value = null
  }

  /* ---------- 应用屏幕管理模式 ---------- */

  const managementMode = ref(false)
  const selectedTileIds = ref<string[]>([])
  const selectedTileIdSet = computed(() => new Set(selectedTileIds.value))

  /** 进入主屏批量管理模式，保留空选择，等待用户点选图块 */
  function enterManagementMode() {
    managementMode.value = true
    closeContextMenu()
  }

  /** 退出主屏批量管理模式，并清空所有临时选择 */
  function exitManagementMode() {
    managementMode.value = false
    selectedTileIds.value = []
    closeContextMenu()
  }

  /** 切换某个主屏图块的选中态；仅保存 id，不触碰业务数据 */
  function toggleManagedTile(tileId: string) {
    const selected = selectedTileIds.value
    selectedTileIds.value = selected.includes(tileId)
      ? selected.filter((id) => id !== tileId)
      : [...selected, tileId]
  }

  /** 右键或拖拽未选中图块时，先把它纳入本次批量选择 */
  function ensureManagedTile(tileId: string) {
    if (!selectedTileIds.value.includes(tileId)) selectedTileIds.value = [...selectedTileIds.value, tileId]
  }

  /** 清理已不在主屏顶层的选择，避免删除/移入文件夹后残留幽灵选中态 */
  function cleanupManagedSelection() {
    const topLevelIds = new Set(launcher.screens.flatMap((screen) => screen.tiles.map((tile) => tile.id)))
    selectedTileIds.value = selectedTileIds.value.filter((id) => topLevelIds.has(id))
  }

  /* ---------- 全局弹窗 ---------- */

  const modal = shallowRef<ModalState>(null)

  function openModal(state: NonNullable<ModalState>) {
    closeContextMenu()
    modal.value = state
  }

  function closeModal() {
    modal.value = null
  }

  return {
    currentScreenIndex,
    screenDirection,
    currentScreen,
    goToScreen,
    goToScreenById,
    openFolderId,
    openFolder,
    closeFolder,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    managementMode,
    selectedTileIds,
    selectedTileIdSet,
    enterManagementMode,
    exitManagementMode,
    toggleManagedTile,
    ensureManagedTile,
    cleanupManagedSelection,
    modal,
    openModal,
    closeModal,
  }
})
