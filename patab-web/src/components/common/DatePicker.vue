<script setup lang="ts">
/**
 * DatePicker —— 轻量日期选择器
 *
 * 触发器显示“MM-DD”或占位文案；点击后弹出月历浮层，无外部依赖。
 * v-model 绑定本地日期字符串（YYYY-MM-DD），避免时区偏差。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Calendar } from '@lucide/vue'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const viewDate = ref(new Date())
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

const POPOVER_WIDTH = 256

function updatePosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  let left = rect.left
  if (left + POPOVER_WIDTH > window.innerWidth) {
    left = window.innerWidth - POPOVER_WIDTH - 16
  }
  popoverStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${Math.max(8, left)}px`,
  }
}

watch(open, (val) => {
  if (val) nextTick(updatePosition)
})

/** 今天本地日期字符串 */
const todayIso = ref(toLocalIso(new Date()))

watch(
  () => props.modelValue,
  (value) => {
    if (value) viewDate.value = parseLocalDate(value)
  },
  { immediate: true },
)

const displayValue = computed(() => {
  if (!props.modelValue) return props.placeholder ?? '选择日期'
  const [, m, d] = props.modelValue.split('-')
  return `${m}-${d}`
})

const yearMonthLabel = computed(() => {
  return `${viewDate.value.getFullYear()}年 ${viewDate.value.getMonth() + 1}月`
})

const days = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const start = new Date(firstDay)
  start.setDate(start.getDate() - firstDay.getDay())

  const result: { date: Date; current: boolean; selected: boolean; today: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const iso = toLocalIso(date)
    result.push({
      date,
      current: date.getMonth() === month,
      selected: iso === props.modelValue,
      today: iso === todayIso.value,
    })
  }
  return result
})

/** 本地日期 → YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
function toLocalIso(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** YYYY-MM-DD → 本地 Date */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y!, m! - 1, d)
}

function select(date: Date) {
  emit('update:modelValue', toLocalIso(date))
  open.value = false
}

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1)
}

function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1)
}

function clear() {
  emit('update:modelValue', '')
  open.value = false
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) open.value = false
}
</script>

<template>
  <div class="relative inline-block">
    <button
      ref="triggerRef"
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-lg bg-white/50 px-2.5 text-sm text-neutral-700 transition-colors hover:bg-white/70"
      :class="!modelValue ? 'text-neutral-500' : ''"
      @click="open = !open"
    >
      <Calendar class="h-4 w-4 text-neutral-400" />
      <span>{{ displayValue }}</span>
    </button>

    <Transition name="picker">
      <div
        v-if="open"
        class="fixed z-[100] w-64 rounded-2xl border border-white/50 bg-white/90 p-3 shadow-lg backdrop-blur-md"
        :style="popoverStyle"
        @click="onBackdropClick"
      >
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            class="rounded p-1 text-neutral-500 hover:bg-black/5"
            @click.stop="prevMonth"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="text-sm font-medium text-neutral-800">{{ yearMonthLabel }}</span>
          <button
            type="button"
            class="rounded p-1 text-neutral-500 hover:bg-black/5"
            @click.stop="nextMonth"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <div class="grid grid-cols-7 gap-0.5 text-center text-[10px] text-neutral-400">
          <span>日</span>
          <span>一</span>
          <span>二</span>
          <span>三</span>
          <span>四</span>
          <span>五</span>
          <span>六</span>
        </div>

        <div class="mt-1 grid grid-cols-7 gap-0.5">
          <button
            v-for="day in days"
            :key="day.date.toISOString()"
            type="button"
            class="relative aspect-square rounded-lg text-xs transition-colors"
            :class="[
              !day.current ? 'text-neutral-300' : 'text-neutral-700 hover:bg-sky-100',
              day.selected ? 'bg-sky-500 text-white hover:bg-sky-600' : '',
              day.today && !day.selected ? 'font-semibold text-sky-600 ring-1 ring-sky-400/60' : '',
            ]"
            @click.stop="select(day.date)"
          >
            {{ day.date.getDate() }}
          </button>
        </div>

        <div class="mt-2 flex justify-end">
          <button
            type="button"
            class="text-xs text-neutral-500 hover:text-neutral-700"
            @click.stop="clear"
          >
            清除
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.picker-enter-active,
.picker-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
