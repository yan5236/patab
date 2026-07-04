<script setup lang="ts">
/**
 * ClockDisplay —— 顶部大号数字时钟（HH:MM:SS）
 * 时间制式（12/24 小时）跟随设置；等宽数字避免跳动
 */
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import { useLauncherStore } from '@/stores/launcher'

const now = useNow()
const launcher = useLauncherStore()

const timeText = computed(() => {
  const date = now.value
  const hour12 = launcher.settings.hour12
  let hours = date.getHours()
  if (hour12) hours = hours % 12 || 12
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})

/** 12 小时制时显示上/下午角标 */
const meridiem = computed(() => {
  if (!launcher.settings.hour12) return ''
  return now.value.getHours() < 12 ? '上午' : '下午'
})
</script>

<template>
  <div class="flex items-end justify-center gap-2 text-white drop-shadow-lg">
    <span v-if="meridiem" class="pb-2 text-xl font-medium opacity-90">{{ meridiem }}</span>
    <span class="tabular-nums text-7xl font-semibold tracking-tight">{{ timeText }}</span>
  </div>
</template>
