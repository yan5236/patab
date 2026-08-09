import {
  CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
  openCustomComponentDatabase,
} from './customComponentDatabase'

/** 单个实例在 24 小时内允许的连续运行失败次数；达到该值后宿主必须停用该引用。 */
export const RUNTIME_HEALTH_FAILURE_LIMIT = 3

/** 运行失败的滚动统计窗口，窗口外的旧失败不会影响新的启动尝试。 */
export const RUNTIME_HEALTH_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1_000

/** 只保存不含私有数据、HTML 或浏览器异常的失败类别。 */
export type RuntimeFailureReason = 'handshake-failed' | 'handshake-timeout' | 'protocol-flood' | 'startup-incomplete'

/** runtimeHealth 表中单个组件实例的持久化健康摘要。 */
export interface RuntimeHealthRecord {
  readonly componentId: string
  readonly instanceId: string
  readonly consecutiveFailures: number
  readonly firstFailedAt: number
  readonly lastFailedAt: number
  readonly lastErrorCode: RuntimeFailureReason
  readonly disabledReason?: RuntimeFailureReason
}

/** 记录一次运行失败后返回的最小状态，供 Runtime 与宿主图块共同决定是否停用。 */
export interface RuntimeHealthFailureResult {
  readonly record: RuntimeHealthRecord
  readonly autoDisabled: boolean
}

/** 将 IndexedDB 读取 request 转换为 Promise；仅用于事务外只读路径。 */
function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

/** 判断组件与实例标识是否可安全组成 runtimeHealth 的复合主键。 */
function isValidScope(componentId: string, instanceId: string): boolean {
  return !!componentId
    && !!instanceId
    && !componentId.includes('\0')
    && !instanceId.includes('\0')
}

/** 把跨出 24 小时窗口的历史失败清零，确保连续计数不会永久累积。 */
function createFailureRecord(
  componentId: string,
  instanceId: string,
  reason: RuntimeFailureReason,
  now: number,
  previous: RuntimeHealthRecord | undefined,
): RuntimeHealthRecord {
  const continuesWindow = previous !== undefined && now - previous.lastFailedAt <= RUNTIME_HEALTH_FAILURE_WINDOW_MS
  const consecutiveFailures = continuesWindow ? previous.consecutiveFailures + 1 : 1
  const disabledReason = consecutiveFailures >= RUNTIME_HEALTH_FAILURE_LIMIT ? reason : undefined
  return {
    componentId,
    instanceId,
    consecutiveFailures,
    firstFailedAt: continuesWindow ? previous.firstFailedAt : now,
    lastFailedAt: now,
    lastErrorCode: reason,
    ...(disabledReason ? { disabledReason } : {}),
  }
}

/** 读取实例健康摘要；不存在时返回 undefined，使缺失记录等同从未失败。 */
export async function getRuntimeHealth(
  componentId: string,
  instanceId: string,
): Promise<RuntimeHealthRecord | undefined> {
  if (!isValidScope(componentId, instanceId)) return undefined
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH, 'readonly')
    return await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).get([
      componentId,
      instanceId,
    ])) as RuntimeHealthRecord | undefined
  } finally {
    database.close()
  }
}

/**
 * 原子记录一次启动或协议失败。
 *
 * 每次写入先在同一 readwrite 事务读取旧摘要，再依据 24 小时窗口更新连续计数；任何读取或写入失败
 * 都不会保留半条记录。达到三次时只持久化稳定原因，调用方再同步停用 launcher 轻量引用。
 */
export async function recordRuntimeFailure(
  componentId: string,
  instanceId: string,
  reason: RuntimeFailureReason,
  now: number = Date.now(),
): Promise<RuntimeHealthFailureResult> {
  if (!isValidScope(componentId, instanceId)) throw new Error('组件实例健康范围无效')
  const database = await openCustomComponentDatabase()
  try {
    return await new Promise<RuntimeHealthFailureResult>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH)
      let result: RuntimeHealthFailureResult | undefined
      let failed = false

      /** 统一回滚当前健康写入，避免局部失败被误当成一次真实启动失败。 */
      const fail = (): void => {
        if (failed) return
        failed = true
        try {
          transaction.abort()
        } catch {
          // 已经结束的事务会由既有事件处理，不泄露底层错误。
        }
      }

      transaction.oncomplete = () => result ? resolve(result) : reject(new Error('组件健康记录未提交'))
      transaction.onabort = () => reject(new Error('组件健康记录写入失败'))
      transaction.onerror = () => undefined

      const current = store.get([componentId, instanceId])
      current.onerror = fail
      current.onsuccess = () => {
        const record = createFailureRecord(componentId, instanceId, reason, now, current.result as RuntimeHealthRecord | undefined)
        result = { record, autoDisabled: record.disabledReason !== undefined }
        const write = store.put(record)
        write.onerror = fail
      }
    })
  } finally {
    database.close()
  }
}

/**
 * 清除实例健康摘要。
 *
 * 成功握手与用户明确“重新启用”都复用此入口，因而新的连续失败窗口从零开始；删除失败不会影响
 * launcher 当前停用标记，调用方必须在成功后才恢复实例执行。
 */
export async function clearRuntimeHealth(componentId: string, instanceId: string): Promise<void> {
  if (!isValidScope(componentId, instanceId)) return
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH, 'readwrite')
      const request = transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).delete([componentId, instanceId])
      request.onerror = () => {
        try {
          transaction.abort()
        } catch {
          // onabort 统一结算。
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(new Error('组件健康记录清理失败'))
      transaction.onerror = () => undefined
    })
  } finally {
    database.close()
  }
}

/**
 * 在一次成功握手后按失败类别选择性清除摘要。
 *
 * 握手失败表示当前启动从未进入可执行状态，因此下一次成功握手可以恢复；协议洪泛已经发生在已运行
 * surface 内，不能被下一次短暂握手掩盖，必须继续累计直至用户明确重新启用或窗口过期。
 */
export async function clearHandshakeFailureAfterHealthyStart(componentId: string, instanceId: string): Promise<void> {
  if (!isValidScope(componentId, instanceId)) return
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH, 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH)
      const current = store.get([componentId, instanceId])
      let failed = false

      /** 读取或删除健康摘要失败时中止同一事务，避免调用方把不确定状态视为已恢复。 */
      const fail = (): void => {
        if (failed) return
        failed = true
        try {
          transaction.abort()
        } catch {
          // 事务已完成时由 oncomplete/onabort 统一结算。
        }
      }

      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(new Error('组件健康记录清理失败'))
      transaction.onerror = () => undefined
      current.onerror = fail
      current.onsuccess = () => {
        const record = current.result as RuntimeHealthRecord | undefined
        if (record?.lastErrorCode !== 'handshake-failed' && record?.lastErrorCode !== 'handshake-timeout') return
        const deletion = store.delete([componentId, instanceId])
        deletion.onerror = fail
      }
    })
  } finally {
    database.close()
  }
}
