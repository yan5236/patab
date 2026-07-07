<script setup lang="ts">
/**
 * ClockDisplay —— 顶部大号数字时钟（HH:MM:SS）
 * 时间制式（12/24 小时）与日期显示跟随设置；等宽数字避免跳动
 */
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import { useLauncherStore } from '@/stores/launcher'

const now = useNow()
const launcher = useLauncherStore()

/** 格式化中文年月日与星期，避免依赖浏览器 locale 输出细节 */
function formatDateText(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

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

const dateText = computed(() => formatDateText(now.value))
</script>

<template>
  <div class="flex flex-col items-center justify-center text-white drop-shadow-lg">
    <div class="flex items-end justify-center gap-2">
      <span v-if="meridiem" class="pb-2 text-xl font-medium opacity-90">{{ meridiem }}</span>
      <span class="tabular-nums text-7xl font-semibold tracking-tight">{{ timeText }}</span>
    </div>
    <span v-if="launcher.settings.showDate" class="mt-1 text-base font-medium opacity-90">
      {{ dateText }}
    </span>
  </div>
</template>
