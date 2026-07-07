<script setup lang="ts">
/**
 * ScreenViewport —— 应用屏幕容器
 * - 渲染当前屏幕的网格，切换时按方向做滑动过渡
 * - 空白处右键：新建快捷方式 / 新建文件夹 / 更换壁纸
 */
import { computed } from 'vue'
import { FolderPlus, Image, SquareCheckBig, SquarePlus, X } from '@lucide/vue'
import type { MenuItem } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import ScreenGrid from './ScreenGrid.vue'

const launcher = useLauncherStore()
const ui = useUiStore()

/** 过渡名随切换方向变化：向右切换 = 新屏幕从右侧滑入 */
const transitionName = computed(() =>
  ui.screenDirection === 1 ? 'slide-left' : 'slide-right',
)

/** 空白处右键菜单 */
function onBlankMenu(event: MouseEvent) {
  const screen = ui.currentScreen
  if (!screen) return
  if (ui.managementMode) {
    ui.openContextMenu(event, [
      { label: '退出管理', icon: X, action: () => ui.exitManagementMode() },
    ])
    return
  }
  const items: MenuItem[] = [
    {
      label: '管理',
      icon: SquareCheckBig,
      action: () => ui.enterManagementMode(),
    },
    {
      label: '新建快捷方式',
      icon: SquarePlus,
      action: () =>
        ui.openModal({ type: 'shortcut-create', target: { kind: 'screen', screenId: screen.id } }),
    },
    {
      label: '新建文件夹',
      icon: FolderPlus,
      action: () => launcher.addFolder(screen.id, '新建文件夹'),
    },
  ]
  items.push({
    label: '更换壁纸',
    icon: Image,
    action: () => ui.openModal({ type: 'settings', tab: 'wallpaper' }),
  })
  ui.openContextMenu(event, items)
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden" @contextmenu="onBlankMenu">
    <Transition :name="transitionName">
      <ScreenGrid
        v-if="ui.currentScreen"
        :key="ui.currentScreen.id"
        :screen="ui.currentScreen"
        class="absolute inset-0"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* 屏幕切换：双向滑动过渡（新旧屏幕同时移动） */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.slide-left-enter-from,
.slide-right-leave-to {
  transform: translateX(48px);
  opacity: 0;
}
.slide-left-leave-to,
.slide-right-enter-from {
  transform: translateX(-48px);
  opacity: 0;
}
</style>
