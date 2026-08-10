import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  beginCustomComponentBoot,
  completeCustomComponentBoot,
  exitCustomComponentSafeMode,
  recoverInterruptedCustomComponentBoot,
  type CustomComponentSafetyState,
  type CustomComponentSafetyStorage,
} from '@/custom-components/safety/customComponentSafetyState'
import { getCustomComponentSafetyStorageKey } from './launcherStorageEnvironment'

/** 仅在浏览器中提供 localStorage；测试或不可用环境会安全退化为内存状态。 */
function getSafetyStorage(): CustomComponentSafetyStorage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined
    const storageKey = getCustomComponentSafetyStorageKey()
    return {
      getItem: () => localStorage.getItem(storageKey),
      setItem: (_key, value) => localStorage.setItem(storageKey, value),
    }
  } catch {
    return undefined
  }
}

/**
 * 自定义组件全局启动安全状态门面。
 *
 * App 在创建子图块前恢复该状态；图块仅登记其初始启动，Runtime 仍是唯一创建 sandbox iframe 的位置。
 */
export const useCustomComponentSafetyStore = defineStore('custom-component-safety', () => {
  const storage = getSafetyStorage()
  const state = ref<CustomComponentSafetyState>({ bootPending: false, consecutiveIncompleteBoots: 0, globalSafeMode: false })
  let acceptingInitialStarts = false
  let pendingInitialStarts = 0
  let initialRegistrationFinished = false

  const globalSafeMode = computed(() => state.value.globalSafeMode)

  /** 在 App setup 同步恢复遗留 pending，并在安全模式外写入本次启动标记。 */
  function beginInitialBoot(): void {
    state.value = recoverInterruptedCustomComponentBoot(storage)
    acceptingInitialStarts = !state.value.globalSafeMode
    pendingInitialStarts = 0
    initialRegistrationFinished = false
    if (acceptingInitialStarts) state.value = beginCustomComponentBoot(storage)
  }

  /** 由初始可执行图块在调用 Runtime 前登记，避免父组件过早清除全局 pending。 */
  function registerInitialStart(): boolean {
    if (!acceptingInitialStarts) return false
    pendingInitialStarts += 1
    return true
  }

  /** 由 Runtime 成功、超时或隔离失败后结算一次登记；失败同样代表本次不会再阻断启动。 */
  function settleInitialStart(): void {
    if (!acceptingInitialStarts) return
    pendingInitialStarts = Math.max(0, pendingInitialStarts - 1)
    completeIfReady()
  }

  /** App 挂载后结束初始图块登记，若没有未结算启动立即清除 pending。 */
  function finishInitialRegistration(): void {
    initialRegistrationFinished = true
    completeIfReady()
  }

  /** 用户明确退出安全模式；后续实例仍须逐个手动重新启用。 */
  function exitSafeMode(): void {
    state.value = exitCustomComponentSafeMode(storage)
    acceptingInitialStarts = false
  }

  /** 只在初始登记结束且全部实例已完成/隔离时清除 pending。 */
  function completeIfReady(): void {
    if (!acceptingInitialStarts || !initialRegistrationFinished || pendingInitialStarts !== 0) return
    state.value = completeCustomComponentBoot(storage)
    acceptingInitialStarts = false
  }

  return {
    state,
    globalSafeMode,
    beginInitialBoot,
    registerInitialStart,
    settleInitialStart,
    finishInitialRegistration,
    exitSafeMode,
  }
})
