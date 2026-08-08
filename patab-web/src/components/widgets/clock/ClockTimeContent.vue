<script setup lang="ts">
/**
 * ClockTimeContent —— 时钟小组件「时间」类型内容
 * 大号实时时钟，12/24 小时制与日期显示跟随全局设置（与顶栏时钟一致）；
 * 等宽数字避免跳动。图块与详情弹窗共用。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/useNow'
import { useLauncherStore } from '@/stores/launcher'

const now = useNow()
const launcher = useLauncherStore()
const { t, tm } = useI18n()

/** 按当前界面语言格式化日期，避免依赖浏览器 locale 输出细节 */
function formatDateText(date: Date): string {
  const weekdays = tm('topbar.weekdays') as string[]
  return t('topbar.date', {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: weekdays[date.getDay()],
  })
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
  return now.value.getHours() < 12 ? t('topbar.am') : t('topbar.pm')
})

const dateText = computed(() => formatDateText(now.value))
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-1">
    <div class="flex items-end justify-center gap-1.5">
      <span v-if="meridiem" class="theme-muted pb-1 text-sm font-medium">{{ meridiem }}</span>
      <span class="theme-text tabular-nums text-4xl font-semibold tracking-tight">{{ timeText }}</span>
    </div>
    <span v-if="launcher.settings.showDate" class="theme-muted text-xs font-medium">
      {{ dateText }}
    </span>
  </div>
</template>
