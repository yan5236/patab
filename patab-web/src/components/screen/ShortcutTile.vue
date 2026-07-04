<script setup lang="ts">
/**
 * ShortcutTile —— 快捷方式图块（图标 + 名称）
 * 点击打开网址；右键：编辑 / 添加到 Dock / 删除
 */
import { Pencil, SquareArrowDown, Trash2 } from '@lucide/vue'
import type { Shortcut } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{
  shortcut: Shortcut
  /** 是否渲染在文件夹展开层内（浅色面板上文字用深色） */
  inFolder?: boolean
}>()

const launcher = useLauncherStore()
const ui = useUiStore()

function open() {
  window.location.href = props.shortcut.url
}

function onMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    {
      label: '编辑',
      icon: Pencil,
      action: () => ui.openModal({ type: 'shortcut-edit', shortcutId: props.shortcut.id }),
    },
    {
      label: '添加到 Dock',
      icon: SquareArrowDown,
      action: () => launcher.moveToDock(props.shortcut.id),
    },
    {
      label: '删除',
      icon: Trash2,
      danger: true,
      action: () => launcher.removeTile(props.shortcut.id),
    },
  ])
}
</script>

<template>
  <button
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :title="shortcut.name"
    @click="open"
    @contextmenu="onMenu"
  >
    <div
      class="h-16 w-16 rounded-2xl shadow-md shadow-black/20 transition-transform duration-150 group-hover:scale-105"
    >
      <AppIcon
        :name="shortcut.name"
        :url="shortcut.url"
        :icon-url="shortcut.iconUrl"
        :color="shortcut.color"
      />
    </div>
    <span
      class="max-w-full truncate px-1 text-xs"
      :class="inFolder ? 'text-neutral-700' : 'text-white drop-shadow'"
    >
      {{ shortcut.name }}
    </span>
  </button>
</template>
