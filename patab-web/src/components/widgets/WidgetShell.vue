<script setup lang="ts">
/**
 * WidgetShell —— 小组件通用外壳
 * 毛玻璃卡片 + 标题栏（标题栏兼作长按拖动的手柄）；右键：移除小组件
 * 内容区由默认插槽提供，插槽内容应自带 data-nodrag（避免与长按拖动冲突）
 * 具体小组件可通过 menuItems 在「调整尺寸」之前注入自己的右键菜单项
 */
import { Expand, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import GlassPanel from '@/components/common/GlassPanel.vue'
import type { MenuItem } from '@/types'

const props = defineProps<{
  /** 小组件在网格中的图块 id（用于移除） */
  tileId: string
  title: string
  /** 追加在「调整尺寸 / 移除」之前的自定义右键菜单项 */
  menuItems?: MenuItem[]
}>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

function onMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    ...(props.menuItems ?? []),
    {
      label: t('screen.menu.resizeTile'),
      icon: Expand,
      action: () => ui.enterTileResize(props.tileId),
    },
    {
      label: t('widgets.remove'),
      icon: Trash2,
      danger: true,
      action: () => launcher.removeTile(props.tileId),
    },
  ])
}
</script>

<template>
  <GlassPanel
    class="flex h-full w-full flex-col overflow-hidden rounded-3xl"
    @contextmenu="onMenu"
  >
    <div class="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
      <span class="theme-heading cursor-grab text-sm font-semibold">
        {{ title }}
      </span>
      <div v-if="$slots.actions" class="flex items-center gap-1" data-nodrag>
        <slot name="actions" />
      </div>
    </div>
    <div class="min-h-0 flex-1 px-3 pb-3" data-nodrag>
      <slot />
    </div>
  </GlassPanel>
</template>
