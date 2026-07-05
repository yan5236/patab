<script setup lang="ts">
/**
 * FolderTile —— 文件夹图块
 * 毛玻璃底 + 最多 9 个子项的九宫格缩略图；点击展开文件夹
 * 图标区域是"放入文件夹"的放置目标（data-drop="folder-tile"），拖拽悬停时放大高亮
 * 右键：打开 / 解散文件夹 / 删除
 */
import { computed } from 'vue'
import { FolderOpen, Ungroup } from '@lucide/vue'
import type { Folder } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useDragStore } from '@/stores/drag'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{ folder: Folder }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const drag = useDragStore()

const preview = computed(() => props.folder.children.slice(0, 9))

/** 拖拽悬停在本文件夹上（松手即放入） */
const isHovered = computed(() => drag.hoverKey === `folder-tile:${props.folder.id}`)

function onMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    { label: '打开', icon: FolderOpen, action: () => ui.openFolder(props.folder.id) },
    { label: '解散文件夹', icon: Ungroup, action: () => launcher.disbandFolder(props.folder.id) },
  ])
}
</script>

<template>
  <button
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :title="folder.name"
    @click="ui.openFolder(folder.id)"
    @contextmenu="onMenu"
  >
    <div
      data-drop="folder-tile"
      :data-folder="folder.id"
      class="grid h-16 w-16 grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border border-white/40 bg-white/40 p-1.5 shadow-md shadow-black/20 backdrop-blur-xl transition-transform duration-150 group-hover:scale-105"
      :class="isHovered ? 'scale-110 ring-2 ring-white' : ''"
    >
      <div
        v-for="child in preview"
        :key="child.id"
        class="pointer-events-none overflow-hidden rounded-[4px]"
      >
        <AppIcon :name="child.name" :url="child.url" :icon-url="child.iconUrl" :color="child.color" />
      </div>
    </div>
    <span class="max-w-full truncate px-1 text-xs text-white drop-shadow">{{ folder.name }}</span>
  </button>
</template>
