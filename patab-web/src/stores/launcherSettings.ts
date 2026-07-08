/**
 * launcher 设置业务动作
 *
 * 负责统一写入持久化设置，避免组件绕过 store 修改设置对象。
 */
import type { Ref } from 'vue'
import type { Settings } from '@/types'

/** 创建设置更新动作集合 */
export function createLauncherSettingsActions(settings: Ref<Settings>) {
  /** 合并设置补丁；调用方只传入本次要变更的字段 */
  function updateSettings(patch: Partial<Settings>) {
    Object.assign(settings.value, patch)
  }

  return { updateSettings }
}
