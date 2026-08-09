<script setup lang="ts">
/**
 * TileItem —— 网格图块分发器
 * 职责（对所有图块类型统一）：
 * 1. 按 tile.type 分发渲染 ShortcutTile / FolderTile / 待办小组件
 * 2. 标注放置目标 data 属性：主屏用 slot（坐标），文件夹用 cell（下标）
 * 3. 绑定长按拖拽（来源 = 所在容器 + 下标）
 * 4. 拖拽中的视觉反馈：自己被拖走时留出空位（隐形占位）、被悬停时高亮
 * 主屏网格（自由摆放）与文件夹展开层（紧凑）复用同一个组件（zone 区分）。
 */
import { computed } from 'vue'
import { Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { WidgetTileSize } from '@patab/widget-sdk'
import type { CustomWidgetTile, DragSource, MenuItem, Tile, TileSize } from '@/types'
import { useDragStore } from '@/stores/drag'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useLongPressDrag } from '@/composables/useLongPressDrag'
import { COLS, allowedSizesFor, tileSize } from '@/utils/grid'
import ShortcutTile from './ShortcutTile.vue'
import FolderTile from './FolderTile.vue'
import ResizeHandle from './ResizeHandle.vue'
import { useTileResize } from '@/composables/useTileResize'
import TodoWidget from '@/components/widgets/TodoWidget.vue'
import ClockWidget from '@/components/widgets/clock/ClockWidget.vue'
import CustomWidgetHost from '@/components/custom-components/CustomWidgetHost.vue'
import { getCustomComponentRuntime } from '@/custom-components/runtime/runtimeHost'
import { useCustomComponentStore } from '@/stores/customComponents'

const props = defineProps<{
  tile: Tile
  zone: 'screen' | 'folder'
  containerId: string
  index: number
}>()

const drag = useDragStore()
const launcher = useLauncherStore()
const ui = useUiStore()
const customComponents = useCustomComponentStore()
const { t } = useI18n()

/** 本图块处于紧凑模式的主屏（整格由容器接管放置、拖拽走让位重排） */
const isCompactScreen = computed(
  () => props.zone === 'screen' && launcher.settings.placementMode === 'compact',
)

/** 紧凑让位预览生效时，本图块的预览坐标（否则为 null，用自身坐标） */
const previewPos = computed(() => {
  if (!isCompactScreen.value || drag.previewScreenId !== props.containerId) return null
  return drag.previewPositions?.get(props.tile.id) ?? null
})

const source = computed<DragSource>(() =>
  props.zone === 'screen'
    ? { kind: 'screen', screenId: props.containerId, index: props.index }
    : { kind: 'folder', folderId: props.containerId, index: props.index },
)

const { onPointerdown } = useLongPressDrag(() => ({ tile: props.tile, source: source.value }))

/** 当前 custom 图块的已验证 Manifest；缺包或目录未加载时不开放尺寸操作。 */
const customTile = computed<CustomWidgetTile | undefined>(() => {
  const tile = props.tile
  return tile.type === 'widget' && tile.widgetType === 'custom' ? tile : undefined
})
const customManifest = computed(() => {
  const tile = customTile.value
  if (!tile) return undefined
  return customComponents.installedCatalog.find((entry) => entry.component.componentId === tile.componentId)?.manifest
})

/** 当前类型允许的静态尺寸；未选 variant 时回退组件总尺寸，绝不让动态 third-party 代码参与决策。 */
const customAllowedSizes = computed<readonly TileSize[]>(() => {
  const manifest = customManifest.value
  if (!manifest) return []
  const variant = customTile.value?.variantId
    ? manifest.variants?.find((item) => item.id === customTile.value?.variantId)
    : undefined
  return (variant?.supportedSizes ?? manifest.sizes).map((size) => ({ w: size.w, h: size.h }))
})

/** 读取某图块可调整尺寸：自定义组件只使用 Manifest 静态白名单，内置图块沿用既有规则。 */
function getResizableSizes(tile: Tile): readonly TileSize[] {
  if (tile.type === 'widget' && tile.widgetType === 'custom' && tile.id === props.tile.id) {
    return customAllowedSizes.value
  }
  return allowedSizesFor(tile)
}

/** 尺寸拖拽提交后向同实例的所有存活 surface 广播公开 sizeChanged 事件。 */
function publishCustomSizeChanged(tile: Tile, previousSize: TileSize, size: TileSize): void {
  if (tile.type !== 'widget' || tile.widgetType !== 'custom') return
  getCustomComponentRuntime().publishInstanceLifecycle(tile.componentId, tile.instanceId, {
    event: 'sizeChanged',
    payload: { previousSize: previousSize as WidgetTileSize, size: size as WidgetTileSize },
  })
}

/** 尺寸拖拽变形（仅主屏的文件夹 / 小组件支持），自定义组件额外收紧为 Manifest 声明尺寸。 */
const { onHandlePointerdown } = useTileResize(() => props.tile, {
  getAllowedSizes: getResizableSizes,
  onResizeCommitted: publishCustomSizeChanged,
})

/** 本图块类型支持多尺寸调整 */
const isResizable = computed(() => getResizableSizes(props.tile).length > 0)
/** 本图块正处于「调整尺寸」模式：右下角显示拖拽柄并高亮 */
const isResizing = computed(
  () => props.zone === 'screen' && isResizable.value && ui.resizingTileId === props.tile.id,
)

/** 本图块正在被拖拽（主屏：原位留空；文件夹：半透明占位） */
const isDragSource = computed(() => drag.tile?.id === props.tile.id)
/** 文件夹内拖拽悬停在本单元格上（主屏的悬停高亮由空格放置层负责） */
const isHoverCell = computed(
  () =>
    props.zone === 'folder' &&
    drag.hoverKey === `cell:folder:${props.containerId}:${props.index}`,
)

/** 主屏管理模式下本图块是否可被批量选择 */
const isManageable = computed(() => props.zone === 'screen' && ui.managementMode)
/** 本图块是否已被管理模式选中 */
const isSelected = computed(() => ui.selectedTileIdSet.has(props.tile.id))

/** 图标由长按拖拽接管触摸；小组件保留纵向滚动能力 */
const tileTouchAction = computed(() => (props.tile.type === 'widget' ? 'pan-y' : 'none'))

/** 主屏图块的网格定位（坐标 + 占位跨度）；文件夹内走自动流式排列 */
const cellStyle = computed(() => {
  if (props.zone !== 'screen') return { touchAction: tileTouchAction.value } as const
  const { w, h } = tileSize(props.tile)
  // 紧凑让位预览生效时按预览坐标渲染，否则用图块自身坐标
  const pos = previewPos.value
  const col = pos ? pos.col : props.tile.col ?? 0
  const row = pos ? pos.row : props.tile.row ?? 0
  return {
    gridColumn: `${col + 1} / span ${w}`,
    gridRow: `${row + 1} / span ${h}`,
    order: row * COLS + col,
    touchAction: tileTouchAction.value,
  } as const
})

/** 管理模式点击只切换选中态，阻止快捷方式跳转或文件夹展开 */
function onManagedClick(event: MouseEvent) {
  if (!isManageable.value) return
  event.preventDefault()
  event.stopPropagation()
  ui.toggleManagedTile(props.tile.id)
}

/** 管理模式右键打开批量操作菜单；未选中当前图块时先纳入选择 */
function onManagedMenu(event: MouseEvent) {
  if (!isManageable.value) return
  event.preventDefault()
  event.stopPropagation()
  ui.ensureManagedTile(props.tile.id)
  const selected = [...ui.selectedTileIds]
  const items: MenuItem[] = [
    {
      label: t('screen.menu.deleteItems', { count: selected.length }),
      icon: Trash2,
      danger: true,
      action: () => {
        launcher.removeTiles(selected)
        ui.cleanupManagedSelection()
      },
    },
  ]
  ui.openContextMenu(event, items)
}

</script>

<template>
  <div
    class="relative rounded-2xl transition-[background-color,box-shadow,opacity] duration-150"
    :class="[
      zone === 'screen' ? 'screen-tile' : '',
      zone === 'screen' && tile.type === 'widget' ? 'screen-tile--widget' : '',
      zone === 'screen' && isDragSource ? 'invisible' : '',
      zone === 'folder' && isDragSource ? 'opacity-30' : '',
      isDragSource ? 'pointer-events-none' : '',
      isHoverCell ? 'bg-white/25 ring-2 ring-white/70' : '',
      isResizing ? 'ring-2 ring-white/80' : '',
    ]"
    :style="cellStyle"
    :data-resize-tile="isResizing ? tile.id : undefined"
    :data-drop="zone === 'folder' ? 'cell' : isCompactScreen ? undefined : 'slot'"
    :data-zone="zone === 'folder' ? 'folder' : undefined"
    :data-container="zone === 'folder' ? containerId : undefined"
    :data-index="zone === 'folder' ? index : undefined"
    :data-flip-tile="zone === 'screen' ? tile.id : undefined"
    :data-screen="zone === 'screen' && !isCompactScreen ? containerId : undefined"
    :data-col="zone === 'screen' && !isCompactScreen ? tile.col : undefined"
    :data-row="zone === 'screen' && !isCompactScreen ? tile.row : undefined"
    @pointerdown="onPointerdown"
    @click.capture="onManagedClick"
    @contextmenu.capture="onManagedMenu"
  >
    <span
      v-if="isManageable"
      class="pointer-events-none absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border text-[13px] font-bold leading-none shadow-sm"
      :class="
        isSelected
          ? 'border-sky-200 bg-sky-500 text-white'
          : 'border-white/80 bg-black/20 text-transparent backdrop-blur'
      "
    >
      ✓
    </span>
    <ShortcutTile v-if="tile.type === 'shortcut'" :shortcut="tile" :in-folder="zone === 'folder'" />
    <FolderTile v-else-if="tile.type === 'folder'" :folder="tile" />
    <ClockWidget v-else-if="tile.type === 'widget' && tile.widgetType === 'clock'" :tile-id="tile.id" />
    <CustomWidgetHost v-else-if="tile.type === 'widget' && tile.widgetType === 'custom'" :tile="tile" />
    <TodoWidget v-else :tile-id="tile.id" />
    <ResizeHandle v-if="isResizing" @resize-start="onHandlePointerdown" />
  </div>
</template>
