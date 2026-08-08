<script setup lang="ts">
/**
 * FolderTile —— 文件夹图块
 * 毛玻璃底 + 子项缩略预览；点击展开文件夹
 * 支持多尺寸（1×1 图标形态 / 2×1、1×2、2×2、3×3 大文件夹），尺寸由 tileSize 决定，
 * 更大尺寸时预览网格自适应放大并填满整个图块
 * 图标区域是"放入文件夹"的放置目标（data-drop="folder-tile"），拖拽悬停时放大高亮
 * 右键：打开 / 调整尺寸 / 解散文件夹
 */
import { computed } from 'vue'
import { Expand, FolderOpen, Ungroup } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Folder } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useDragStore } from '@/stores/drag'
import { tileSize } from '@/utils/grid'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{ folder: Folder }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const drag = useDragStore()
const { t } = useI18n()

/** 当前网格尺寸（格数），未自定义时为 1×1 */
const size = computed(() => tileSize(props.folder))
/** 大于 1×1 时为大文件夹形态：预览网格填满整个图块 */
const isLarge = computed(() => size.value.w > 1 || size.value.h > 1)

/** 预览网格的行列数：随尺寸放大，最多 3×3 */
const previewCols = computed(() => Math.min(3, size.value.w + 1))
const previewRows = computed(() => Math.min(3, size.value.h + 1))

const preview = computed(() =>
  props.folder.children.slice(0, isLarge.value ? previewCols.value * previewRows.value : 9),
)

/** 大文件夹的预览网格模板（1×1 保持固定 class 即可） */
const previewGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${previewCols.value}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${previewRows.value}, minmax(0, 1fr))`,
}))

/** 拖拽悬停在本文件夹上（松手即放入） */
const isHovered = computed(() => drag.hoverKey === `folder-tile:${props.folder.id}`)

function onMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    { label: t('screen.menu.open'), icon: FolderOpen, action: () => ui.openFolder(props.folder.id) },
    { label: t('screen.menu.resizeTile'), icon: Expand, action: () => ui.enterTileResize(props.folder.id) },
    { label: t('screen.menu.disbandFolder'), icon: Ungroup, action: () => launcher.disbandFolder(props.folder.id) },
  ])
}
</script>

<template>
  <button
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :class="isLarge ? 'h-full' : ''"
    :title="folder.name"
    @click="ui.openFolder(folder.id)"
    @contextmenu="onMenu"
  >
    <div
      data-drop="folder-tile"
      :data-folder="folder.id"
      class="grid gap-0.5 rounded-2xl border border-white/40 bg-white/40 p-1.5 shadow-md shadow-black/20 backdrop-blur-xl transition-transform duration-150 group-hover:scale-105"
      :class="[
        isLarge ? 'min-h-0 w-full flex-1 gap-1 p-2' : 'h-16 w-16 grid-cols-3 grid-rows-3',
        isHovered ? 'scale-110 ring-2 ring-white' : '',
      ]"
      :style="isLarge ? previewGridStyle : undefined"
    >
      <div
        v-for="child in preview"
        :key="child.id"
        class="pointer-events-none overflow-hidden rounded-[4px]"
        :class="isLarge ? 'rounded-lg' : ''"
      >
        <AppIcon :name="child.name" :url="child.url" :icon-url="child.iconUrl" :color="child.color" />
      </div>
    </div>
    <span class="max-w-full truncate px-1 text-xs text-white drop-shadow">{{ folder.name }}</span>
  </button>
</template>
