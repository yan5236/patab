import { CUSTOM_COMPONENT_SAFETY_STORAGE_KEY } from '@/custom-components/safety/customComponentSafetyState'

/** 正式 PaTab launcher 状态的固定键；开发宿主不得读取或覆盖。 */
export const DEFAULT_LAUNCHER_STORAGE_KEY = 'patab:v1'

/** 开发会话 ID 的安全字符边界，禁止把控制字符或分隔符带入存储键。 */
const DEV_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

let launcherStorageKey = DEFAULT_LAUNCHER_STORAGE_KEY
let launcherStorageKeyLocked = false
let customComponentSafetyStorageKey = CUSTOM_COMPONENT_SAFETY_STORAGE_KEY

/** 为开发会话生成与正式状态隔离的 launcher 存储键。 */
export function createLauncherDevStorageKey(sessionId: string): string {
  if (!DEV_SESSION_ID_PATTERN.test(sessionId)) throw new Error('开发会话 ID 无效')
  return `patab-widget-dev:${sessionId}:launcher:v1`
}

/** 为开发会话生成与正式组件启动安全状态隔离的存储键。 */
export function createCustomComponentSafetyDevStorageKey(sessionId: string): string {
  if (!DEV_SESSION_ID_PATTERN.test(sessionId)) throw new Error('开发会话 ID 无效')
  return `patab-widget-dev:${sessionId}:custom-components:safety:v1`
}

/**
 * 在创建 launcher Store 前配置一次开发会话键。
 *
 * 键一旦被读取即锁定，防止运行中切换命名空间造成一个 Store 同时写入两套用户状态。
 */
export function configureLauncherDevStorage(sessionId: string): void {
  if (launcherStorageKeyLocked || launcherStorageKey !== DEFAULT_LAUNCHER_STORAGE_KEY) {
    throw new Error('launcher 存储环境已经初始化')
  }
  launcherStorageKey = createLauncherDevStorageKey(sessionId)
  customComponentSafetyStorageKey = createCustomComponentSafetyDevStorageKey(sessionId)
}

/** 返回当前进程固定的 launcher 存储键，并阻止后续重新配置。 */
export function getLauncherStorageKey(): string {
  launcherStorageKeyLocked = true
  return launcherStorageKey
}

/** 返回与 launcher 使用同一开发会话隔离的组件启动安全状态键。 */
export function getCustomComponentSafetyStorageKey(): string {
  return customComponentSafetyStorageKey
}
