<script setup lang="ts">
/**
 * ContextMenu —— 全局唯一的右键菜单
 * 数据驱动：各组件通过 ui.openContextMenu(event, items) 传入菜单项，本组件只负责渲染
 * 自动处理：视口边缘防溢出、点击任意处 / ESC / 窗口失焦关闭
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import GlassPanel from './GlassPanel.vue'

const ui = useUiStore()

/** 估算尺寸做视口防溢出（菜单宽 176px，每项高 36px） */
const MENU_WIDTH = 176
const ITEM_HEIGHT = 36

const position = computed(() => {
  const menu = ui.contextMenu
  if (!menu) return { left: 0, top: 0 }
  const height = menu.items.length * ITEM_HEIGHT + 12
  return {
    left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)),
    top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
  }
})

function onGlobalClose() {
  ui.closeContextMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') ui.closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', onGlobalClose)
  window.addEventListener('blur', onGlobalClose)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClose)
  window.removeEventListener('blur', onGlobalClose)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="menu">
      <GlassPanel
        v-if="ui.contextMenu"
        strong
        class="fixed z-[60] w-44 rounded-xl p-1.5"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        @contextmenu.prevent
      >
        <button
          v-for="(item, i) in ui.contextMenu.items"
          :key="i"
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors"
          :class="item.danger ? 'text-red-600 hover:bg-red-500/10' : 'text-neutral-700 hover:bg-black/5'"
          @click="item.action(), ui.closeContextMenu()"
        >
          <component :is="item.icon" v-if="item.icon" class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </GlassPanel>
    </Transition>
  </Teleport>
</template>

<style scoped>
.menu-enter-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.menu-leave-active {
  transition: opacity 0.08s ease;
}
.menu-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.menu-leave-to {
  opacity: 0;
}
</style>
