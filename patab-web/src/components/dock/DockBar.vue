<script setup lang="ts">
/**
 * DockBar —— 底部 Dock 栏（Mac 风格）
 * 左侧：常用快捷方式（可拖入 / 拖出 / 重排）；右侧固定：设置、快速添加、组件商店
 * 容器自身是放置目标（拖到空白 = 追加到 Dock 末尾）
 */
import { Plus, Settings, Store } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import GlassPanel from '@/components/common/GlassPanel.vue'
import DockItem from './DockItem.vue'

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

/** 快速添加：在当前屏幕新建快捷方式 */
function quickAdd() {
  const screen = ui.currentScreen
  if (!screen) return
  ui.openModal({ type: 'shortcut-create', target: { kind: 'screen', screenId: screen.id } })
}
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-0 z-30 flex w-full justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:w-auto sm:px-0 sm:pb-0"
  >
    <GlassPanel
      class="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto rounded-3xl px-3 py-2"
      data-drop="dock"
      :data-index="launcher.dock.length"
    >
      <TransitionGroup name="dock">
        <DockItem v-for="(item, i) in launcher.dock" :key="item.id" :item="item" :index="i" />
      </TransitionGroup>

      <!-- Dock 为空时的占位提示 -->
      <span v-if="launcher.dock.length === 0" class="shrink-0 px-2 text-xs text-neutral-500">
        {{ t('dock.empty') }}
      </span>

      <!-- 分隔线 + 固定功能按钮 -->
      <div class="mx-1 h-10 w-px shrink-0 bg-neutral-500/30" />

      <button
        class="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white/60 text-neutral-600 shadow transition-transform duration-150 hover:scale-110 hover:text-neutral-800"
        :title="t('dock.settings')"
        @click="ui.openModal({ type: 'settings' })"
      >
        <Settings class="h-6 w-6" />
      </button>

      <button
        class="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white/60 text-neutral-600 shadow transition-transform duration-150 hover:scale-110 hover:text-neutral-800"
        :title="t('dock.newShortcut')"
        @click="quickAdd"
      >
        <Plus class="h-6 w-6" />
      </button>

      <button
        class="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white/60 text-neutral-600 shadow transition-transform duration-150 hover:scale-110 hover:text-neutral-800"
        :title="t('dock.componentStore')"
        @click="ui.openModal({ type: 'component-store' })"
      >
        <Store class="h-6 w-6" />
      </button>
    </GlassPanel>
  </div>
</template>

<style scoped>
/* Dock 项增删 / 重排的平滑过渡 */
.dock-move,
.dock-enter-active,
.dock-leave-active {
  transition: all 0.2s ease;
}
.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
.dock-leave-active {
  position: absolute;
}
</style>
