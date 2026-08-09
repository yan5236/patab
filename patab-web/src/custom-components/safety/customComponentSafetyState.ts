/** 自定义组件快速启动状态独立于 IndexedDB，确保页面在创建任一 iframe 前即可判断是否应进入安全模式。 */
export const CUSTOM_COMPONENT_SAFETY_STORAGE_KEY = 'patab:custom-components:safety:v1'

/** 安全状态只保存恢复所需的非敏感布尔与计数，不记录组件 HTML、私有数据或浏览器异常。 */
export interface CustomComponentSafetyState {
  readonly bootPending: boolean
  readonly consecutiveIncompleteBoots: number
  readonly globalSafeMode: boolean
  readonly lastBootStartedAt?: number
}

/** 可替换的最小 storage 接口，供浏览器实现与无 DOM 的单元测试共用。 */
export interface CustomComponentSafetyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 将损坏或旧格式 localStorage 值安全归一化，任何错误都回退为空状态而非阻断 PaTab 主界面。 */
function normalizeSafetyState(value: unknown): CustomComponentSafetyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { bootPending: false, consecutiveIncompleteBoots: 0, globalSafeMode: false }
  }
  const candidate = value as Record<string, unknown>
  const consecutiveIncompleteBoots = typeof candidate.consecutiveIncompleteBoots === 'number'
    && Number.isInteger(candidate.consecutiveIncompleteBoots)
    && candidate.consecutiveIncompleteBoots >= 0
    ? Math.min(candidate.consecutiveIncompleteBoots, 3)
    : 0
  return {
    bootPending: candidate.bootPending === true,
    consecutiveIncompleteBoots,
    globalSafeMode: candidate.globalSafeMode === true,
    ...(typeof candidate.lastBootStartedAt === 'number' && Number.isFinite(candidate.lastBootStartedAt)
      ? { lastBootStartedAt: candidate.lastBootStartedAt }
      : {}),
  }
}

/** 读取状态时隔离 localStorage 不可用、JSON 损坏和配额异常，核心宿主界面始终可继续加载。 */
export function readCustomComponentSafetyState(storage: CustomComponentSafetyStorage | undefined): CustomComponentSafetyState {
  if (!storage) return { bootPending: false, consecutiveIncompleteBoots: 0, globalSafeMode: false }
  try {
    const serialized = storage.getItem(CUSTOM_COMPONENT_SAFETY_STORAGE_KEY)
    return normalizeSafetyState(serialized ? JSON.parse(serialized) : undefined)
  } catch {
    return { bootPending: false, consecutiveIncompleteBoots: 0, globalSafeMode: false }
  }
}

/** 持久化已归一化安全状态；写入失败时仍返回内存状态，避免 storage 配额问题导致白屏。 */
function writeCustomComponentSafetyState(
  storage: CustomComponentSafetyStorage | undefined,
  state: CustomComponentSafetyState,
): CustomComponentSafetyState {
  try {
    storage?.setItem(CUSTOM_COMPONENT_SAFETY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 安全模式在本次会话仍生效；下一次启动会再次尽力读取持久状态。
  }
  return state
}

/**
 * 恢复上次页面留下的 pending 标记。
 *
 * 发现未清理标记时先增加连续未完成次数，再在第三次时开启全局安全模式；恢复过程不会创建或执行
 * 第三方 iframe，因此即使组件曾阻塞渲染器，PaTab 核心界面仍可先可用。
 */
export function recoverInterruptedCustomComponentBoot(
  storage: CustomComponentSafetyStorage | undefined,
): CustomComponentSafetyState {
  const current = readCustomComponentSafetyState(storage)
  if (!current.bootPending) return current
  const consecutiveIncompleteBoots = Math.min(current.consecutiveIncompleteBoots + 1, 3)
  return writeCustomComponentSafetyState(storage, {
    bootPending: false,
    consecutiveIncompleteBoots,
    globalSafeMode: current.globalSafeMode || consecutiveIncompleteBoots >= 3,
    ...(current.lastBootStartedAt ? { lastBootStartedAt: current.lastBootStartedAt } : {}),
  })
}

/** 在第三方实例开始启动前写入 pending，崩溃或死循环时下个会话可据此禁止再次执行。 */
export function beginCustomComponentBoot(
  storage: CustomComponentSafetyStorage | undefined,
  now: number = Date.now(),
): CustomComponentSafetyState {
  const current = readCustomComponentSafetyState(storage)
  if (current.globalSafeMode) return current
  return writeCustomComponentSafetyState(storage, {
    ...current,
    bootPending: true,
    lastBootStartedAt: now,
  })
}

/** 所有初始实例已经健康握手或被隔离后清除 pending，并重置连续未完成计数。 */
export function completeCustomComponentBoot(
  storage: CustomComponentSafetyStorage | undefined,
): CustomComponentSafetyState {
  const current = readCustomComponentSafetyState(storage)
  return writeCustomComponentSafetyState(storage, {
    bootPending: false,
    consecutiveIncompleteBoots: 0,
    globalSafeMode: current.globalSafeMode,
    ...(current.lastBootStartedAt ? { lastBootStartedAt: current.lastBootStartedAt } : {}),
  })
}

/** 用户从管理界面显式退出安全模式时清除崩溃累计；不会自动重新启用任何实例。 */
export function exitCustomComponentSafeMode(
  storage: CustomComponentSafetyStorage | undefined,
): CustomComponentSafetyState {
  return writeCustomComponentSafetyState(storage, {
    bootPending: false,
    consecutiveIncompleteBoots: 0,
    globalSafeMode: false,
  })
}
