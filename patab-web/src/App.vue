<script setup lang="ts">
/**
 * App —— PaTab 根组件
 * 负责：壁纸背景、整体布局编排（时钟 → 搜索 → 应用屏幕 → 分页器 → Dock）、
 * 以及全局层的挂载：文件夹弹层 / 右键菜单 / 拖拽幽灵 / 各弹窗
 */
import { computed, watch } from 'vue'
import { Eye } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import ClockDisplay from '@/components/topbar/ClockDisplay.vue'
import SearchBar from '@/components/topbar/SearchBar.vue'
import ScreenViewport from '@/components/screen/ScreenViewport.vue'
import ScreenPager from '@/components/screen/ScreenPager.vue'
import FolderView from '@/components/screen/FolderView.vue'
import DockBar from '@/components/dock/DockBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import DragGhost from '@/components/common/DragGhost.vue'
import ShortcutEditModal from '@/components/modals/ShortcutEditModal.vue'
import ScreenEditModal from '@/components/modals/ScreenEditModal.vue'
import SettingsModal from '@/components/modals/SettingsModal.vue'
import ComponentStoreModal from '@/components/modals/ComponentStoreModal.vue'
import TodoModal from '@/components/modals/TodoModal.vue'
import ClockTypePickerModal from '@/components/modals/ClockTypePickerModal.vue'
import ClockDetailModal from '@/components/modals/ClockDetailModal.vue'
import { useThemeMode } from '@/composables/useThemeMode'
import { resolveAssetPath } from '@/utils/assetPath'

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()
useThemeMode(computed(() => launcher.settings.themeMode))

const wallpaperStyle = computed(() => ({
  backgroundImage: `url(${resolveAssetPath(launcher.settings.wallpaper)})`,
}))

/**
 * 全局屏蔽浏览器原生右键菜单（类操作系统体验）；
 * 输入框内保留原生菜单（复制 / 粘贴），具体业务菜单由各组件自行打开
 */
function onRootContextMenu(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('input, textarea')) return
  if (launcher.settings.cleanMode) {
    ui.openContextMenu(event, [
      {
        label: t('screen.menu.showApps'),
        icon: Eye,
        action: () => launcher.updateSettings({ cleanMode: false }),
      },
    ])
    return
  }
  event.preventDefault()
}

/** 纯净模式下双击非保留区域，恢复应用屏幕 */
function onRootDoubleClick(event: MouseEvent) {
  if (!launcher.settings.cleanMode) return
  if ((event.target as HTMLElement).closest('[data-clean-mode-retained]')) return
  launcher.updateSettings({ cleanMode: false })
}

/**
 * 调整尺寸模式激活时：点击图块外部或按 Escape 退出
 * （监听挂在 window 捕获阶段，点到 [data-resize-tile] 内部不退出）
 */
function onGlobalPointerdown(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('[data-resize-tile]')) return
  ui.exitTileResize()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') ui.exitTileResize()
}

watch(
  () => ui.resizingTileId,
  (tileId) => {
    if (tileId) {
      window.addEventListener('pointerdown', onGlobalPointerdown, true)
      window.addEventListener('keydown', onGlobalKeydown, true)
    } else {
      window.removeEventListener('pointerdown', onGlobalPointerdown, true)
      window.removeEventListener('keydown', onGlobalKeydown, true)
    }
  },
)
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-cover bg-center"
    :style="wallpaperStyle"
    @contextmenu="onRootContextMenu"
    @dblclick="onRootDoubleClick"
  >
    <!-- 根据主题轻微调整壁纸遮罩，保证文字和毛玻璃层可读 -->
    <div class="theme-wallpaper-overlay pointer-events-none absolute inset-0" />

    <div class="relative flex h-full flex-col items-center px-4 sm:px-8">
      <div data-clean-mode-retained class="contents">
        <ClockDisplay class="mt-8 shrink-0 sm:mt-10" />
        <SearchBar class="mt-4 shrink-0 sm:mt-6" />
      </div>

      <Transition name="clean-mode">
        <div v-if="!launcher.settings.cleanMode" class="flex min-h-0 w-full flex-1 flex-col items-center">
          <!-- 应用屏幕区 -->
          <div class="mt-4 min-h-0 w-full max-w-5xl flex-1 pb-40 sm:mt-6 sm:pb-0">
            <ScreenViewport />
          </div>

          <ScreenPager class="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 sm:static sm:mb-3 sm:translate-x-0" />
          <DockBar class="mb-0 shrink-0 sm:mb-5" />
        </div>
      </Transition>
    </div>

    <!-- 全局层 -->
    <FolderView />
    <ContextMenu />
    <DragGhost />

    <ShortcutEditModal
      v-if="ui.modal?.type === 'shortcut-create'"
      :target="ui.modal.target"
    />
    <ShortcutEditModal
      v-else-if="ui.modal?.type === 'shortcut-edit'"
      :shortcut-id="ui.modal.shortcutId"
    />
    <ScreenEditModal v-if="ui.modal?.type === 'screen-create'" />
    <ScreenEditModal
      v-else-if="ui.modal?.type === 'screen-edit'"
      :screen-id="ui.modal.screenId"
    />
    <SettingsModal v-if="ui.modal?.type === 'settings'" />
    <ComponentStoreModal v-if="ui.modal?.type === 'component-store'" />
    <TodoModal v-if="ui.modal?.type === 'todo'" />
    <ClockTypePickerModal
      v-if="ui.modal?.type === 'clock-type-picker'"
      :screen-id="ui.modal.screenId"
      :tile-id="ui.modal.tileId"
    />
    <ClockDetailModal v-if="ui.modal?.type === 'clock-detail'" :tile-id="ui.modal.tileId" />
  </div>
</template>

<style scoped>
.clean-mode-enter-active,
.clean-mode-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.clean-mode-enter-from,
.clean-mode-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
