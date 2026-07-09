<script setup lang="ts">
/**
 * ScreenPager —— 应用屏幕分页指示器
 * - 点击指示条切换屏幕，左右箭头逐页切换，"+"新建屏幕
 * - 右键指示条：编辑 / 删除屏幕（删除时内容并入第一个屏幕）
 * - 指示条是拖拽放置目标（data-drop="pager"）：拖拽悬停自动切屏，释放则移入该屏幕
 */
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Screen } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useDragStore } from '@/stores/drag'
import GlassPanel from '@/components/common/GlassPanel.vue'

const launcher = useLauncherStore()
const ui = useUiStore()
const drag = useDragStore()
const { t } = useI18n()

/** 右键指示条：屏幕管理菜单 */
function onScreenMenu(event: MouseEvent, screen: Screen) {
  const items = [
    {
      label: t('screen.menu.editScreen'),
      icon: Pencil,
      action: () => ui.openModal({ type: 'screen-edit', screenId: screen.id }),
    },
  ]
  // 至少保留一个屏幕，最后一个不提供删除
  if (launcher.screens.length > 1) {
    items.push({
      label: t('screen.menu.deleteScreen'),
      icon: Trash2,
      danger: true,
      action: () => launcher.removeScreen(screen.id),
    } as (typeof items)[number])
  }
  ui.openContextMenu(event, items)
}
</script>

<template>
  <div class="flex items-center justify-center gap-1.5">
    <button
      class="rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 disabled:opacity-30"
      :disabled="ui.currentScreenIndex === 0"
      :title="t('screen.pager.prev')"
      @click="ui.goToScreen(ui.currentScreenIndex - 1)"
    >
      <ChevronLeft class="h-4 w-4" />
    </button>

    <GlassPanel class="flex items-center gap-1 rounded-full p-1">
      <button
        v-for="(screen, i) in launcher.screens"
        :key="screen.id"
        data-drop="pager"
        :data-screen="screen.id"
        class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all"
        :class="[
          i === ui.currentScreenIndex
            ? 'theme-control font-medium shadow-sm'
            : 'theme-muted theme-surface-hover',
          drag.hoverKey === `pager:${screen.id}` ? 'ring-2 ring-sky-400' : '',
        ]"
        :title="screen.name"
        @click="ui.goToScreen(i)"
        @contextmenu="onScreenMenu($event, screen)"
      >
        <span>{{ screen.icon }}</span>
        <span class="max-w-20 truncate">{{ screen.name }}</span>
      </button>

      <!-- 新建应用屏幕 -->
      <button
        class="theme-muted theme-surface-hover rounded-full p-1 transition-colors"
        :title="t('screen.pager.newScreen')"
        @click="ui.openModal({ type: 'screen-create' })"
      >
        <Plus class="h-3.5 w-3.5" />
      </button>
    </GlassPanel>

    <button
      class="rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 disabled:opacity-30"
      :disabled="ui.currentScreenIndex >= launcher.screens.length - 1"
      :title="t('screen.pager.next')"
      @click="ui.goToScreen(ui.currentScreenIndex + 1)"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>
</template>
