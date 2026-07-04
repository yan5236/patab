/**
 * useNow —— 每秒更新的当前时间 ref（驱动时钟组件）
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useNow() {
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => {
      now.value = new Date()
    }, 1000)
  })

  onBeforeUnmount(() => clearInterval(timer))

  return now
}
