<script setup lang="ts">
/**
 * App —— PaTab 根组件
 * 负责：壁纸背景、整体布局编排（时钟 → 搜索 → 应用屏幕 → 分页器 → Dock）、
 * 以及全局层的挂载：文件夹弹层 / 右键菜单 / 拖拽幽灵 / 各弹窗
 */
import { computed } from 'vue'
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

const launcher = useLauncherStore()
const ui = useUiStore()

const wallpaperStyle = computed(() => ({
  backgroundImage: `url(${launcher.settings.wallpaper})`,
}))

/**
 * 全局屏蔽浏览器原生右键菜单（类操作系统体验）；
 * 输入框内保留原生菜单（复制 / 粘贴），具体业务菜单由各组件自行打开
 */
function onRootContextMenu(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('input, textarea')) return
  event.preventDefault()
}
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-cover bg-center"
    :style="wallpaperStyle"
    @contextmenu="onRootContextMenu"
  >
    <!-- 轻微暗化，保证白色文字可读 -->
    <div class="pointer-events-none absolute inset-0 bg-black/10" />

    <div class="relative flex h-full flex-col items-center px-4 sm:px-8">
      <ClockDisplay class="mt-8 shrink-0 sm:mt-10" />
      <SearchBar class="mt-4 shrink-0 sm:mt-6" />

      <!-- 应用屏幕区 -->
      <div class="mt-4 min-h-0 w-full max-w-5xl flex-1 pb-40 sm:mt-6 sm:pb-0">
        <ScreenViewport />
      </div>

      <ScreenPager class="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 sm:static sm:mb-3 sm:translate-x-0" />
      <DockBar class="mb-0 shrink-0 sm:mb-5" />
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
  </div>
</template>
