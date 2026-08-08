<script setup lang="ts">
/**
 * ClockStopwatchContent —— 时钟小组件「秒表」类型内容
 * 0.01 秒精度（mm:ss.cs，满 1 小时加小时前缀）；运行中可暂停 / 计次，
 * 暂停后可继续 / 归零。运行状态持久化在图块 config 上，刷新后按时间戳续走。
 * 显示值只由时间戳重算（运行中约 40ms 刷新一次），不存亚秒级瞬时值。
 * 图块与详情弹窗共用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Flag, Pause, Play, RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { formatStopwatchMs } from '@/utils/clock'
import type { StopwatchState } from '@/types'

const props = defineProps<{
  /** 秒表运行状态（图块 config 的一部分，直接原地修改即可持久化） */
  state: StopwatchState
}>()

const { t } = useI18n()

/** 显示用的当前时间戳，仅运行中按 ~40ms 间隔刷新 */
const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined

function startTick() {
  stopTick()
  nowMs.value = Date.now()
  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 40)
}

function stopTick() {
  clearInterval(tickTimer)
  tickTimer = undefined
}

/** 当前总耗时：累计值 + 本轮已走时（暂停时只取累计值） */
const elapsedMs = computed(() => {
  const base = props.state.accumulatedMs
  if (props.state.running && props.state.startedAt !== null) {
    return base + Math.max(0, nowMs.value - props.state.startedAt)
  }
  return base
})

const display = computed(() => formatStopwatchMs(elapsedMs.value))

function startOrResume() {
  props.state.startedAt = Date.now()
  props.state.running = true
}

function pause() {
  if (props.state.startedAt !== null) {
    props.state.accumulatedMs += Math.max(0, Date.now() - props.state.startedAt)
  }
  props.state.startedAt = null
  props.state.running = false
}

/** 运行中：计次（最新在最前，delta 为与上一次计次的差值）；暂停时：归零并清空计次 */
function flagOrReset() {
  if (props.state.running) {
    const total = elapsedMs.value
    const delta = total - (props.state.laps[0]?.total ?? 0)
    props.state.laps.unshift({ total, delta })
    return
  }
  props.state.accumulatedMs = 0
  props.state.startedAt = null
  props.state.laps = []
}

watch(
  () => props.state.running,
  (running) => (running ? startTick() : stopTick()),
)

onMounted(() => {
  if (props.state.running) startTick()
})
onBeforeUnmount(stopTick)
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center justify-center gap-3 pt-1">
      <span class="theme-text tabular-nums text-2xl font-semibold tracking-tight">{{ display }}</span>
      <div class="flex items-center gap-1">
        <button
          v-if="state.running"
          class="theme-subtle-button cursor-pointer rounded-lg p-1.5 transition-colors"
          :title="t('clock.pause')"
          @click="pause"
        >
          <Pause class="h-4 w-4" />
        </button>
        <button
          v-else
          class="theme-subtle-button cursor-pointer rounded-lg p-1.5 transition-colors"
          :title="state.accumulatedMs > 0 ? t('clock.resume') : t('clock.start')"
          @click="startOrResume"
        >
          <Play class="h-4 w-4" />
        </button>
        <button
          class="theme-subtle-button cursor-pointer rounded-lg p-1.5 transition-colors"
          :title="state.running ? t('clock.lap') : t('clock.reset')"
          :disabled="!state.running && state.accumulatedMs === 0 && state.laps.length === 0"
          @click="flagOrReset"
        >
          <Flag v-if="state.running" class="h-4 w-4" />
          <RotateCcw v-else class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 计次列表（最新在最前） -->
    <div v-if="state.laps.length > 0" class="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
      <div
        v-for="(lap, index) in state.laps"
        :key="state.laps.length - index"
        class="theme-surface flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
      >
        <span class="theme-faint shrink-0">#{{ state.laps.length - index }}</span>
        <span class="theme-text min-w-0 flex-1 truncate tabular-nums">{{ formatStopwatchMs(lap.total) }}</span>
        <span class="theme-muted shrink-0 tabular-nums">+{{ formatStopwatchMs(lap.delta) }}</span>
      </div>
    </div>
  </div>
</template>
