<script setup lang="ts">
/**
 * DragGhost —— 拖拽时跟随指针的幽灵图标
 * 读取 drag store 的实时坐标与被拖图块，渲染在最顶层；
 * 整棵子树 pointer-events 关闭，避免干扰 elementFromPoint 命中检测。
 * 小组件按来源实际尺寸还原「整卡」，而非单个小图标。
 */
import { computed } from 'vue'
import { Folder as FolderIcon } from '@lucide/vue'
import { useDragStore } from '@/stores/drag'
import { useUiStore } from '@/stores/ui'
import AppIcon from './AppIcon.vue'
import TodoWidget from '@/components/widgets/TodoWidget.vue'

const drag = useDragStore()
const ui = useUiStore()

const style = computed(() => ({
  left: `${drag.pointerX}px`,
  top: `${drag.pointerY}px`,
}))

/** 小组件整卡按捕获的来源尺寸还原（缺省时给一个兜底尺寸） */
const widgetStyle = computed(() => ({
  width: `${drag.sourceWidth || 320}px`,
  height: `${drag.sourceHeight || 212}px`,
  transform: `translate(${-drag.sourceOffsetX}px, ${-drag.sourceOffsetY}px)`,
}))

/** 管理模式拖拽组选中数量；非组选中拖拽不显示角标 */
const batchCount = computed(() =>
  drag.tile && ui.managementMode && ui.selectedTileIds.includes(drag.tile.id)
    ? ui.selectedTileIds.length
    : 1,
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="drag.tile"
      class="pointer-events-none fixed z-[70] opacity-90 drop-shadow-2xl"
      :class="drag.tile.type === 'widget' ? '' : '-translate-x-1/2 -translate-y-1/2'"
      :style="style"
    >
      <!-- 快捷方式：真实图标 -->
      <div v-if="drag.tile.type === 'shortcut'" class="h-16 w-16 rounded-2xl">
        <AppIcon
          :name="drag.tile.name"
          :url="drag.tile.url"
          :icon-url="drag.tile.iconUrl"
          :color="drag.tile.color"
        />
      </div>
      <!-- 小组件：还原整卡（按来源尺寸），而非单个小图标 -->
      <div v-else-if="drag.tile.type === 'widget'" :style="widgetStyle">
        <TodoWidget :tile-id="drag.tile.id" />
      </div>
      <!-- 文件夹：示意图标 -->
      <div
        v-else
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 backdrop-blur-xl"
      >
        <FolderIcon class="h-8 w-8 text-neutral-500" />
      </div>
      <span
        v-if="batchCount > 1"
        class="absolute -right-2 -top-2 rounded-full bg-sky-500 px-1.5 py-0.5 text-xs font-bold text-white ring-2 ring-white"
      >
        {{ batchCount }}
      </span>
    </div>
  </Teleport>
</template>
