<script setup lang="ts">
/**
 * ClockTimerContent —— 时钟小组件「计时器」类型内容
 * 空闲时输入时 / 分 / 秒（最大 99:59:59）并开始；运行中显示倒计时，可暂停 / 继续 / 重置；
 * 到时后进入 finished 状态（循环响铃与图块高亮由 ClockWidget 负责），点击停止回到空闲。
 * 运行状态持久化在图块 config 上：刷新后按 endsAt 重算，页面关闭期间到时会在打开时立即响铃。
 * 图块与详情弹窗共用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pause, Play, RotateCcw, Square } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { clampTimerPart, formatCountdownMs, timerPartsToMs } from '@/utils/clock'
import type { TimerState } from '@/types'

const props = defineProps<{
  /** 计时器运行状态（图块 config 的一部分，直接原地修改即可持久化） */
  state: TimerState
}>()

const { t } = useI18n()

/** 空闲输入（小时 0-99，分 / 秒 0-59），开始时换算为毫秒 */
const hours = ref(0)
const minutes = ref(0)
const seconds = ref(0)

function syncInputs() {
  const total = Math.floor(props.state.durationMs / 1000)
  hours.value = Math.floor(total / 3600)
  minutes.value = Math.floor(total / 60) % 60
  seconds.value = total % 60
}

/** 已开始（运行 / 暂停 / 到时）与否；未开始显示输入态 */
const started = computed(
  () =>
    props.state.running ||
    props.state.finished ||
    props.state.remainingMs < props.state.durationMs,
)

/** 显示用的当前时间戳，仅运行中按 250ms 间隔刷新 */
const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined

/** 剩余毫秒：运行中按 endsAt 重算，暂停 / 到时取存下的剩余值 */
const remainingMs = computed(() => {
  if (props.state.running && props.state.endsAt !== null) {
    return Math.max(0, props.state.endsAt - nowMs.value)
  }
  return props.state.remainingMs
})

const display = computed(() => formatCountdownMs(remainingMs.value))

function startTick() {
  stopTick()
  nowMs.value = Date.now()
  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
    checkFinish()
  }, 250)
}

function stopTick() {
  clearInterval(tickTimer)
  tickTimer = undefined
}

/** 运行中且已过结束时间：归零并进入响铃状态（页面关闭期间到时也会在这里补上） */
function checkFinish() {
  if (!props.state.running || props.state.endsAt === null) return
  if (Date.now() < props.state.endsAt) return
  props.state.running = false
  props.state.endsAt = null
  props.state.remainingMs = 0
  props.state.finished = true
}

function start() {
  const total = timerPartsToMs(hours.value, minutes.value, seconds.value)
  if (total <= 0) return
  props.state.durationMs = total
  props.state.remainingMs = total
  props.state.endsAt = Date.now() + total
  props.state.running = true
  props.state.finished = false
}

function pause() {
  if (props.state.endsAt !== null) {
    props.state.remainingMs = Math.max(0, props.state.endsAt - Date.now())
  }
  props.state.endsAt = null
  props.state.running = false
}

function resume() {
  props.state.endsAt = Date.now() + props.state.remainingMs
  props.state.running = true
}

/** 回到空闲输入态（保留上次设定的时长） */
function backToIdle() {
  props.state.running = false
  props.state.finished = false
  props.state.endsAt = null
  props.state.remainingMs = props.state.durationMs
  syncInputs()
}

function clampInputs() {
  hours.value = clampTimerPart(hours.value, 99)
  minutes.value = clampTimerPart(minutes.value, 59)
  seconds.value = clampTimerPart(seconds.value, 59)
}

watch(
  () => props.state.running,
  (running) => (running ? startTick() : stopTick()),
)

onMounted(() => {
  syncInputs()
  checkFinish()
  if (props.state.running) startTick()
})
onBeforeUnmount(stopTick)
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-2">
    <!-- 空闲：时长输入 + 开始 -->
    <template v-if="!started">
      <div class="flex items-center justify-center gap-1.5">
        <input
          v-model.number="hours"
          type="number"
          min="0"
          max="99"
          class="theme-input h-8 w-12 rounded-lg px-1 text-center text-sm outline-none"
          :aria-label="t('clock.hours')"
          @change="clampInputs"
        >
        <span class="theme-muted text-xs">{{ t('clock.hours') }}</span>
        <input
          v-model.number="minutes"
          type="number"
          min="0"
          max="59"
          class="theme-input h-8 w-12 rounded-lg px-1 text-center text-sm outline-none"
          :aria-label="t('clock.minutes')"
          @change="clampInputs"
        >
        <span class="theme-muted text-xs">{{ t('clock.minutes') }}</span>
        <input
          v-model.number="seconds"
          type="number"
          min="0"
          max="59"
          class="theme-input h-8 w-12 rounded-lg px-1 text-center text-sm outline-none"
          :aria-label="t('clock.seconds')"
          @change="clampInputs"
        >
        <span class="theme-muted text-xs">{{ t('clock.seconds') }}</span>
      </div>
      <button
        class="theme-subtle-button flex cursor-pointer items-center gap-1 rounded-xl px-3 py-1.5 text-sm transition-colors"
        :title="t('clock.start')"
        @click="start"
      >
        <Play class="h-4 w-4" />
        {{ t('clock.start') }}
      </button>
    </template>

    <!-- 到时：醒目提示 + 停止（停止后回到空闲） -->
    <template v-else-if="state.finished">
      <span class="theme-text tabular-nums text-2xl font-semibold tracking-tight">00:00</span>
      <span class="text-sm font-medium text-amber-500">{{ t('clock.timerDone') }}</span>
      <button
        class="flex cursor-pointer items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
        :title="t('clock.stop')"
        @click="backToIdle"
      >
        <Square class="h-4 w-4" />
        {{ t('clock.stop') }}
      </button>
    </template>

    <!-- 运行 / 暂停：倒计时 + 控制按钮 -->
    <template v-else>
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
          :title="t('clock.resume')"
          @click="resume"
        >
          <Play class="h-4 w-4" />
        </button>
        <button
          class="theme-subtle-button cursor-pointer rounded-lg p-1.5 transition-colors"
          :title="t('clock.reset')"
          @click="backToIdle"
        >
          <RotateCcw class="h-4 w-4" />
        </button>
      </div>
    </template>
  </div>
</template>
