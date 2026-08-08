<script setup lang="ts">
/**
 * ClockDetailModal —— 时钟小组件专属弹窗（1×1 图标 / 磁贴展开按钮点开）
 *
 * 顶部 Tabs 只是「临时使用」：切换 Tab 只改弹窗内展示的板块，不改变磁贴类型
 * （类型切换的唯一入口是右键菜单的「切换类型」）。
 * - 磁贴自身类型对应的 Tab：直接读写磁贴的持久化状态（与磁贴联动），带「当前」标识；
 * - 其余两个 Tab：使用弹窗本地临时状态（不写入 store、不持久化），
 *   本次弹窗会话内保留，关闭弹窗即丢弃；临时计时器到时同样循环响铃 + 高亮。
 * 内容与磁贴完全共用同一批组件（内容组件只接收 state 对象，不感知来源）。
 */
import { computed, reactive, ref, watch } from 'vue'
import { Clock as ClockIcon, Hourglass, Timer } from '@lucide/vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/common/BaseModal.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { CLOCK_TYPES, defaultClockConfig, defaultStopwatchState, defaultTimerState } from '@/utils/clock'
import { useClockAlarm } from '@/composables/useClockAlarm'
import ClockTimeContent from '@/components/widgets/clock/ClockTimeContent.vue'
import ClockStopwatchContent from '@/components/widgets/clock/ClockStopwatchContent.vue'
import ClockTimerContent from '@/components/widgets/clock/ClockTimerContent.vue'
import type { ClockType } from '@/types'

const props = defineProps<{
  tileId: string
}>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

const icons: Record<ClockType, Component> = {
  time: ClockIcon,
  stopwatch: Timer,
  timer: Hourglass,
}

/** 目标图块（被删除时自动关闭弹窗） */
const tile = computed(() => {
  for (const screen of launcher.screens) {
    const found = screen.tiles.find((item) => item.id === props.tileId)
    if (found?.type === 'widget' && found.widgetType === 'clock') return found
  }
  return undefined
})

const config = computed(() => tile.value?.config ?? defaultClockConfig('time'))

watch(tile, (value) => {
  if (!value) ui.closeModal()
})

/** 当前展示的板块（弹窗本地状态，初始为磁贴当前类型；切换不影响磁贴） */
const activeType = ref<ClockType>(config.value.type)

/** 非磁贴类型板块的临时运行状态：仅存在于本次弹窗会话，关闭即丢弃 */
const tempStopwatch = reactive(defaultStopwatchState())
const tempTimer = reactive(defaultTimerState())

/** 秒表板块展示用的状态：磁贴本身是秒表时用持久化状态，否则用临时状态 */
const shownStopwatch = computed(() =>
  activeType.value === 'stopwatch' && config.value.type === 'stopwatch'
    ? config.value.stopwatch
    : tempStopwatch,
)

/** 计时器板块展示用的状态：磁贴本身是计时器时用持久化状态，否则用临时状态 */
const shownTimer = computed(() =>
  activeType.value === 'timer' && config.value.type === 'timer'
    ? config.value.timer
    : tempTimer,
)

/** 临时计时器到时也循环响铃（磁贴自身的响铃由 ClockWidget 负责，互不干扰） */
useClockAlarm(() => tempTimer.finished)
</script>

<template>
  <BaseModal :title="t('clock.title')" @close="ui.closeModal()">
    <!-- 类型 Tabs：与 TodoModal 侧栏同一套选中态 token；「当前」标识磁贴本身的类型 -->
    <div class="theme-control mb-3 flex gap-1 rounded-xl p-1">
      <button
        v-for="clockType in CLOCK_TYPES"
        :key="clockType"
        type="button"
        class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors"
        :class="activeType === clockType ? 'theme-tab-active shadow-sm' : 'theme-tab-idle'"
        @click="activeType = clockType"
      >
        <component :is="icons[clockType]" class="h-4 w-4" />
        {{ t(`clock.types.${clockType}`) }}
        <span
          v-if="config.type === clockType"
          class="theme-faint text-[10px] font-normal"
        >{{ t('clock.current') }}</span>
      </button>
    </div>

    <div
      class="h-56 rounded-2xl"
      :class="activeType === 'timer' && shownTimer.finished ? 'clock-alarm' : ''"
    >
      <ClockTimeContent v-if="activeType === 'time'" />
      <ClockStopwatchContent v-else-if="activeType === 'stopwatch'" :state="shownStopwatch" />
      <ClockTimerContent v-else :state="shownTimer" />
    </div>

    <template #footer>
      <button
        class="theme-subtle-button cursor-pointer rounded-xl px-4 py-2 text-sm transition-colors"
        @click="ui.closeModal()"
      >
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>
</template>
