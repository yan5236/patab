/**
 * useClockAlarm —— 计时器到时的循环响铃
 *
 * 监听 finished 源：为 true 期间循环播放合成铃音（startAlarmLoop），
 * 变回 false 或组件卸载时停止。磁贴（持久配置）与详情弹窗（临时状态）共用，
 * 各自监听自己的状态源，互不干扰。
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { startAlarmLoop } from '@/utils/sound'

export function useClockAlarm(finished: () => boolean) {
  let stopAlarm: (() => void) | undefined

  function sync(value: boolean) {
    if (value && !stopAlarm) {
      stopAlarm = startAlarmLoop()
    } else if (!value && stopAlarm) {
      stopAlarm()
      stopAlarm = undefined
    }
  }

  watch(finished, sync)
  onMounted(() => sync(finished()))
  onBeforeUnmount(() => {
    stopAlarm?.()
    stopAlarm = undefined
  })
}
