<script setup lang="ts">
/**
 * ClockWidget —— 时钟小组件（时间 / 秒表 / 计时器）
 *
 * 按 config.type 分发渲染三种共享内容组件（详情弹窗复用同一批组件）。
 * 支持多尺寸（1×1 / 2×2 / 3×2 / 4×2）：缩到 1×1 时退化为应用图标，
 * 点击打开该图块当前类型的详情弹窗，右键仍可调整尺寸 / 移除。
 * 计时器到时（config.timer.finished）时循环响铃 + 图块脉冲高亮，
 * 直到用户在计时器内容里点击停止；刷新页面后由本组件恢复响铃。
 */
import { computed } from 'vue'
import { Clock as ClockIcon, Expand, Maximize2, Settings2, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { tileSize } from '@/utils/grid'
import { defaultClockConfig } from '@/utils/clock'
import { useClockAlarm } from '@/composables/useClockAlarm'
import WidgetShell from '../WidgetShell.vue'
import ClockTimeContent from './ClockTimeContent.vue'
import ClockStopwatchContent from './ClockStopwatchContent.vue'
import ClockTimerContent from './ClockTimerContent.vue'
import type { ClockConfig, MenuItem, TileSize } from '@/types'

const props = defineProps<{
  tileId: string
  /** 商店详情预览用：强制以指定格数尺寸渲染（不依赖真实图块） */
  previewSize?: TileSize
  /** 商店预览用：直接指定配置（不查找真实图块，也不会触发响铃） */
  previewConfig?: ClockConfig
}>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

/** 本小组件图块（用于读取自定义尺寸与配置） */
const tile = computed(() => {
  for (const screen of launcher.screens) {
    const found = screen.tiles.find((item) => item.id === props.tileId)
    if (found) return found
  }
  return undefined
})

/** 当前生效的时钟配置（预览优先，找不到图块时回落默认时间型） */
const config = computed<ClockConfig>(() => {
  if (props.previewConfig) return props.previewConfig
  const found = tile.value
  if (found && found.type === 'widget' && found.config) return found.config
  return defaultClockConfig('time')
})

/** 缩到 1×1 时退化为普通应用图标：点击打开时钟详情弹窗 */
const isIcon = computed(() => {
  const size = props.previewSize ?? (tile.value ? tileSize(tile.value) : undefined)
  return !!size && size.w === 1 && size.h === 1
})

/* ---------- 到时响铃：finished 期间循环播放，直到用户停止 / 图块卸载 ---------- */

const alarmActive = computed(() => config.value.timer.finished)
useClockAlarm(() => alarmActive.value)

function openDetail() {
  ui.openModal({ type: 'clock-detail', tileId: props.tileId })
}

function openTypePicker() {
  ui.openModal({ type: 'clock-type-picker', tileId: props.tileId })
}

/** 注入 WidgetShell 右键菜单的「切换类型」项（卡片与 1×1 图标形态共用） */
const typeMenuItems = computed<MenuItem[]>(() => [
  { label: t('clock.switchType'), icon: Settings2, action: openTypePicker },
])

/** 图标形态的右键菜单（切换类型 + 与 WidgetShell 一致的调整尺寸 / 移除） */
function onIconMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    ...typeMenuItems.value,
    { label: t('screen.menu.resizeTile'), icon: Expand, action: () => ui.enterTileResize(props.tileId) },
    { label: t('widgets.remove'), icon: Trash2, danger: true, action: () => launcher.removeTile(props.tileId) },
  ])
}
</script>

<template>
  <!-- 1×1 图标形态：外观与快捷方式一致，点击打开详情弹窗；
       商店预览（previewSize）时改用主题色，避免白色玻璃样式在浅色预览底上看不清 -->
  <button
    v-if="isIcon"
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :title="t('clock.title')"
    @click="openDetail"
    @contextmenu="onIconMenu"
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-2xl border shadow-md transition-transform duration-150 group-hover:scale-105"
      :class="[
        previewSize
          ? 'theme-card-icon-bg theme-border'
          : 'border-white/40 bg-white/40 shadow-black/20 backdrop-blur-xl',
        alarmActive ? 'clock-alarm' : '',
      ]"
    >
      <ClockIcon class="h-8 w-8" :class="previewSize ? 'theme-text' : 'text-white drop-shadow'" />
    </div>
    <span
      class="max-w-full truncate px-1 text-xs"
      :class="previewSize ? 'theme-text' : 'text-white drop-shadow'"
    >{{ t('clock.title') }}</span>
  </button>

  <div v-else class="h-full w-full rounded-3xl" :class="alarmActive ? 'clock-alarm' : ''">
    <WidgetShell :tile-id="tileId" :title="t(`clock.types.${config.type}`)" :menu-items="typeMenuItems">
      <template #actions>
        <button
          class="theme-subtle-button cursor-pointer rounded p-1 transition-colors"
          :title="t('widgets.expand')"
          @click="openDetail"
        >
          <Maximize2 class="h-3.5 w-3.5" />
        </button>
      </template>

      <ClockTimeContent v-if="config.type === 'time'" />
      <ClockStopwatchContent v-else-if="config.type === 'stopwatch'" :state="config.stopwatch" />
      <ClockTimerContent v-else :state="config.timer" />
    </WidgetShell>
  </div>
</template>
