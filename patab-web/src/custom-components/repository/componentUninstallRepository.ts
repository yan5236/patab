import {
  CUSTOM_COMPONENT_STORE_COMPONENTS,
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from './customComponentDatabase'
import type { InstalledComponentVersionRecord } from './componentPackageRepository'
import type { InstanceStorageRecord } from './instanceStorageRepository'

/** 卸载预览仅包含计数与总字节数，绝不把组件 HTML、私有键值或授权细节带到 UI。 */
export interface ComponentUninstallPreview {
  readonly componentId: string
  readonly versionCount: number
  readonly fileCount: number
  readonly instanceDataEntryCount: number
  readonly instanceDataBytes: number
  readonly healthRecordCount: number
  readonly stagedDataEntryCount: number
}

/** 卸载 Repository 只公开稳定失败类别，避免将 IndexedDB 原始异常呈现给用户。 */
export class ComponentUninstallRepositoryError extends Error {
  /** 创建不含包正文、私有值或浏览器异常的卸载失败。 */
  constructor(readonly code: 'COMPONENT_NOT_INSTALLED' | 'COMPONENT_UNINSTALL_FAILED', readonly componentId: string) {
    super('组件卸载未能完成。')
    this.name = 'ComponentUninstallRepositoryError'
  }
}

/** 将 IDB request 转为只读 Promise，预览流程不跨事务排入写入。 */
function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

/** 为组件范围构造版本、文件、私有数据和健康表共同使用的前缀区间。 */
function createComponentRange(componentId: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, ''], [componentId, '\uffff'])
}

/** 为 staged 更新构造完整复合键区间，确保仅删除该组件版本关联的临时快照。 */
function createStagedUpdateRange(updateId: string): IDBKeyRange {
  return IDBKeyRange.bound([updateId, '', ''], [updateId, '\uffff', '\uffff'])
}

/** 判断组件 ID 可用于组成 IndexedDB 前缀键，拒绝空值和控制分隔符。 */
function isValidComponentId(componentId: string): boolean {
  return !!componentId && !componentId.includes('\0')
}

/** 从版本记录提取全部仍可能持有 staged 数据的 updateId，并保证每个范围只删除一次。 */
function collectStagedUpdateIds(versions: readonly InstalledComponentVersionRecord[]): readonly string[] {
  return [...new Set(versions
    .map((version) => version.stagedUpdateId)
    .filter((updateId): updateId is string => typeof updateId === 'string' && updateId.length > 0))]
}

/**
 * 读取卸载前的安全计数快照。
 *
 * 预览完全只读，取消确认不会调用任何删除入口；它仅帮助用户在第二次确认前了解将移除的版本、
 * 私有数据和健康记录规模。
 */
export async function getComponentUninstallPreview(componentId: string): Promise<ComponentUninstallPreview> {
  if (!isValidComponentId(componentId)) throw new ComponentUninstallRepositoryError('COMPONENT_NOT_INSTALLED', componentId)
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction([
      CUSTOM_COMPONENT_STORE_COMPONENTS,
      CUSTOM_COMPONENT_STORE_VERSIONS,
      CUSTOM_COMPONENT_STORE_FILES,
      CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
      CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
    ], 'readonly')
    const components = transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS)
    const component = await readRequest(components.get(componentId))
    if (!component) throw new ComponentUninstallRepositoryError('COMPONENT_NOT_INSTALLED', componentId)
    const range = createComponentRange(componentId)
    const [versions, files, instanceData, health] = await Promise.all([
      readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).getAll(range)) as Promise<InstalledComponentVersionRecord[]>,
      readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).getAllKeys(range)),
      readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).getAll(range)) as Promise<InstanceStorageRecord[]>,
      readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).getAllKeys(range)),
    ])
    const stagedUpdateIds = collectStagedUpdateIds(versions)
    let stagedDataEntryCount = 0
    if (stagedUpdateIds.length > 0) {
      const stagedTransaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readonly')
      const stagedStore = stagedTransaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      const stagedEntries = await Promise.all(stagedUpdateIds.map((updateId) => readRequest(stagedStore.count(createStagedUpdateRange(updateId)))))
      stagedDataEntryCount = stagedEntries.reduce((total, count) => total + count, 0)
    }
    return {
      componentId,
      versionCount: versions.length,
      fileCount: files.length,
      instanceDataEntryCount: instanceData.length,
      instanceDataBytes: instanceData.reduce((total, record) => total + record.serializedBytes, 0),
      healthRecordCount: health.length,
      stagedDataEntryCount,
    }
  } catch (error) {
    if (error instanceof ComponentUninstallRepositoryError) throw error
    throw new ComponentUninstallRepositoryError('COMPONENT_UNINSTALL_FAILED', componentId)
  } finally {
    database.close()
  }
}

/**
 * 原子删除一个组件在 IndexedDB 中的完整持久化足迹。
 *
 * components 目录中承载授权；同一 readwrite 事务同时删除活动/回滚/staged 包文件、实例私有数据、
 * 健康记录和关联 staged 快照。任何 request 失败都会中止全部删除，调用方因此不会提前移除 launcher
 * 引用。成功提交后，外层只需同步销毁 Runtime session 并移除轻量引用。
 */
export async function uninstallComponentPackage(componentId: string): Promise<void> {
  if (!isValidComponentId(componentId)) throw new ComponentUninstallRepositoryError('COMPONENT_NOT_INSTALLED', componentId)
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_COMPONENTS,
        CUSTOM_COMPONENT_STORE_VERSIONS,
        CUSTOM_COMPONENT_STORE_FILES,
        CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
        CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH,
        CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
      ], 'readwrite')
      const components = transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS)
      const versions = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS)
      const range = createComponentRange(componentId)
      let failure: ComponentUninstallRepositoryError | undefined

      /** 一处中止所有 object store 的删除，保持已安装包和数据要么完整保留要么完整移除。 */
      const fail = (code: ComponentUninstallRepositoryError['code'] = 'COMPONENT_UNINSTALL_FAILED'): void => {
        failure ??= new ComponentUninstallRepositoryError(code, componentId)
        try {
          transaction.abort()
        } catch {
          // 已结束事务会由 onabort/oncomplete 统一结算。
        }
      }

      /** 监测任何异步删除请求，避免单个 store 的失败悄然提交其他删除。 */
      const deleteRequest = (request: IDBRequest): void => {
        request.onerror = () => fail()
      }

      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(failure ?? new ComponentUninstallRepositoryError('COMPONENT_UNINSTALL_FAILED', componentId))
      transaction.onerror = () => undefined

      const componentRequest = components.get(componentId)
      componentRequest.onerror = () => fail()
      componentRequest.onsuccess = () => {
        if (!componentRequest.result) {
          fail('COMPONENT_NOT_INSTALLED')
          return
        }
        const versionsRequest = versions.getAll(range)
        versionsRequest.onerror = () => fail()
        versionsRequest.onsuccess = () => {
          const stagedUpdateIds = collectStagedUpdateIds(versionsRequest.result as InstalledComponentVersionRecord[])
          deleteRequest(components.delete(componentId))
          deleteRequest(versions.delete(range))
          deleteRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).delete(range))
          deleteRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA).delete(range))
          deleteRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH).delete(range))
          const staged = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
          for (const updateId of stagedUpdateIds) deleteRequest(staged.delete(createStagedUpdateRange(updateId)))
        }
      }
    })
  } finally {
    database.close()
  }
}
