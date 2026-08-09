import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'
import type { WidgetIntegrityDocument, WidgetSignatureDocument } from '@patab/widget-package'

import {
  CUSTOM_COMPONENT_STORE_COMPONENTS,
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from '../repository/customComponentDatabase'
import type {
  InstalledComponentFileRecord,
  InstalledComponentRecord,
  InstalledComponentVersionRecord,
} from '../repository/componentPackageRepository'
import type { InstanceStorageRecord } from '../repository/instanceStorageRepository'

import {
  decideComponentUpdate,
  type ComponentUpdateRejectionCode,
} from './componentUpdatePolicy'

/** 单个已审查文件在更新暂存时需要保留的路径与静态内容。 */
interface StagedPackageFileInput {
  readonly path: string
  readonly content: Blob | string
}

/** 写入 staged 包与全量实例数据快照的输入；权限差异与最终切换由后续阶段拥有。 */
export interface StageComponentUpdateInput {
  readonly updateId: string
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signature?: WidgetSignatureDocument
  readonly files: readonly StagedPackageFileInput[]
  readonly stagedAt?: number
}

/** stagedInstanceData 表内复制活动实例数据时使用的记录形状。 */
export interface StagedInstanceStorageRecord {
  readonly updateId: string
  readonly componentId: string
  readonly instanceId: string
  readonly key: string
  readonly value: unknown
  readonly serializedBytes: number
  readonly updatedAt: number
}

/** 暂存更新 Repository 向上层返回的稳定错误码。 */
export type StagedComponentUpdateRepositoryErrorCode =
  | ComponentUpdateRejectionCode
  | 'COMPONENT_NOT_INSTALLED'
  | 'UPDATE_ALREADY_STAGED'
  | 'UPDATE_STAGE_INPUT_INVALID'
  | 'UPDATE_STAGE_WRITE_FAILED'

/**
 * 表示 staged 更新事务的安全失败；错误只保留稳定码和组件标识，绝不暴露 IndexedDB 原始异常或 package 正文。
 */
export class StagedComponentUpdateRepositoryError extends Error {
  /** 创建可供 Store 映射的稳定 staged 更新错误。 */
  constructor(
    readonly code: StagedComponentUpdateRepositoryErrorCode,
    message: string,
    readonly componentId?: string,
  ) {
    super(message)
    this.name = 'StagedComponentUpdateRepositoryError'
  }
}

/**
 * 验证阶段 9 输入的最小形状，避免绕过 ZIP 静态审查的调用把无效路径或空 updateId 写入已发布 v1 Schema。
 */
function assertStageInput(input: StageComponentUpdateInput): void {
  if (!input.updateId || input.updateId.length > 128 || /[\u0000-\u001f]/.test(input.updateId)) {
    throw new StagedComponentUpdateRepositoryError('UPDATE_STAGE_INPUT_INVALID', '组件更新暂存标识无效。', input.manifest.id)
  }
  if (!input.manifest.id || !input.manifest.version || input.files.length === 0) {
    throw new StagedComponentUpdateRepositoryError('UPDATE_STAGE_INPUT_INVALID', '组件更新暂存输入不完整。', input.manifest.id)
  }

  const paths = new Set<string>()
  for (const file of input.files) {
    if (
      !file.path
      || file.path.includes('\\')
      || file.path.includes('\0')
      || file.path.startsWith('/')
      || file.path.endsWith('/')
      || file.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      || paths.has(file.path)
      || (typeof file.content !== 'string' && !(file.content instanceof Blob))
    ) {
      throw new StagedComponentUpdateRepositoryError('UPDATE_STAGE_INPUT_INVALID', '组件更新暂存包含无效文件。', input.manifest.id)
    }
    paths.add(file.path)
  }
}

/**
 * 构造活动实例数据的限定范围，确保更新只复制目标组件的全部实例而不读取其他组件的私有数据。
 */
function createComponentInstanceDataRange(componentId: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, '', ''], [componentId, '\uffff', '\uffff'])
}

/**
 * 将一次 request 错误归并为同一个事务失败路径，保证 staged 包、文件和快照只会全部提交或全部回滚。
 */
function observeWriteFailure(request: IDBRequest, fail: (error: StagedComponentUpdateRepositoryError) => void, componentId: string): void {
  request.addEventListener('error', () => {
    fail(new StagedComponentUpdateRepositoryError('UPDATE_STAGE_WRITE_FAILED', '组件更新暂存失败，已保留当前活动版本。', componentId))
  }, { once: true })
}

/**
 * 在一个 readwrite 事务中写入高版本 staged 包和所有活动实例数据快照；活动目录与旧版文件不改动，因此中途失败也不会影响当前运行版本。
 */
export async function stageComponentUpdate(input: StageComponentUpdateInput): Promise<void> {
  assertStageInput(input)
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_COMPONENTS,
        CUSTOM_COMPONENT_STORE_VERSIONS,
        CUSTOM_COMPONENT_STORE_FILES,
        CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
        CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
      ], 'readwrite')
      const components = transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS)
      const versions = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS)
      const files = transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES)
      const instanceData = transaction.objectStore(CUSTOM_COMPONENT_STORE_INSTANCE_DATA)
      const stagedInstanceData = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      let failure: StagedComponentUpdateRepositoryError | undefined
      let settled = false

      /** 让所有异步 request 使用一个 abort 出口，避免某个失败请求留下部分 staged 记录。 */
      const fail = (error: StagedComponentUpdateRepositoryError): void => {
        if (settled) return
        failure ??= error
        try {
          transaction.abort()
        } catch {
          // 已结束事务由 onabort/oncomplete 统一结算，不再尝试写入。
        }
      }

      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve()
      }
      transaction.onabort = () => {
        if (settled) return
        settled = true
        reject(failure ?? new StagedComponentUpdateRepositoryError(
          'UPDATE_STAGE_WRITE_FAILED',
          '组件更新暂存失败，已保留当前活动版本。',
          input.manifest.id,
        ))
      }
      transaction.onerror = () => undefined

      const componentRequest = components.get(input.manifest.id)
      componentRequest.onerror = () => fail(new StagedComponentUpdateRepositoryError(
        'UPDATE_STAGE_WRITE_FAILED',
        '组件更新暂存失败，已保留当前活动版本。',
        input.manifest.id,
      ))
      componentRequest.onsuccess = () => {
        const component = componentRequest.result as InstalledComponentRecord | undefined
        if (!component) {
          fail(new StagedComponentUpdateRepositoryError('COMPONENT_NOT_INSTALLED', '组件尚未安装，不能暂存更新。', input.manifest.id))
          return
        }

        const decision = decideComponentUpdate(component, input.manifest)
        if (decision.kind !== 'update') {
          const code = decision.kind === 'reject' ? decision.code : 'COMPONENT_NOT_INSTALLED'
          fail(new StagedComponentUpdateRepositoryError(code, '导入版本不能覆盖当前组件。', input.manifest.id))
          return
        }

        const stagedVersionsRequest = versions.getAll(createComponentVersionRange(input.manifest.id))
        stagedVersionsRequest.onerror = () => fail(new StagedComponentUpdateRepositoryError(
          'UPDATE_STAGE_WRITE_FAILED',
          '组件更新暂存失败，已保留当前活动版本。',
          input.manifest.id,
        ))
        stagedVersionsRequest.onsuccess = () => {
          const existingVersions = stagedVersionsRequest.result as InstalledComponentVersionRecord[]
          const activeVersion = existingVersions.find((record) => (
            record.version === component.activeVersion && record.isActive
          ))
          if (!activeVersion) {
            fail(new StagedComponentUpdateRepositoryError(
              'UPDATE_STAGE_WRITE_FAILED',
              '组件更新暂存失败，当前活动版本不可用。',
              input.manifest.id,
            ))
            return
          }

          const stagedVersion = existingVersions
            .find((record) => record.stagedUpdateId !== undefined)
          if (stagedVersion) {
            fail(new StagedComponentUpdateRepositoryError('UPDATE_ALREADY_STAGED', '组件已有待处理更新，不能覆盖暂存内容。', input.manifest.id))
            return
          }

          const snapshotRequest = instanceData.getAll(createComponentInstanceDataRange(input.manifest.id))
          snapshotRequest.onerror = () => fail(new StagedComponentUpdateRepositoryError(
            'UPDATE_STAGE_WRITE_FAILED',
            '组件更新暂存失败，已保留当前活动版本。',
            input.manifest.id,
          ))
          snapshotRequest.onsuccess = () => {
            const stagedAt = input.stagedAt ?? Date.now()
            const versionRecord: InstalledComponentVersionRecord = {
              componentId: input.manifest.id,
              version: input.manifest.version,
              manifest: input.manifest,
              integrity: input.integrity,
              ...(input.signature ? { signature: input.signature } : {}),
              installSource: 'local-import',
              isActive: false,
              isRollback: false,
              stagedUpdateId: input.updateId,
              replacesVersion: component.activeVersion,
              installedAt: stagedAt,
            }

            try {
              observeWriteFailure(versions.add(versionRecord), fail, input.manifest.id)
              for (const file of input.files) {
                const record: InstalledComponentFileRecord = {
                  componentId: input.manifest.id,
                  version: input.manifest.version,
                  path: file.path,
                  content: file.content,
                }
                observeWriteFailure(files.add(record), fail, input.manifest.id)
              }
              for (const record of snapshotRequest.result as InstanceStorageRecord[]) {
                const snapshot: StagedInstanceStorageRecord = {
                  updateId: input.updateId,
                  componentId: input.manifest.id,
                  instanceId: record.instanceId,
                  key: record.key,
                  value: record.value,
                  serializedBytes: record.serializedBytes,
                  updatedAt: record.updatedAt,
                }
                observeWriteFailure(stagedInstanceData.add(snapshot), fail, input.manifest.id)
              }
            } catch {
              fail(new StagedComponentUpdateRepositoryError(
                'UPDATE_STAGE_WRITE_FAILED',
                '组件更新暂存失败，已保留当前活动版本。',
                input.manifest.id,
              ))
            }
          }
        }
      }
    })
  } finally {
    database.close()
  }
}

/**
 * 构造同一组件所有版本的复合键范围，供启动恢复清理识别未完成更新而不扫描无关组件。
 */
function createComponentVersionRange(componentId: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, ''], [componentId, '\uffff'])
}

/**
 * 在应用启动或中断恢复时原子删除全部未完成 staged 包、文件和快照；活动目录、活动版本与活动实例数据完全不在此事务的删除范围内。
 */
export async function cleanupInterruptedComponentUpdates(): Promise<number> {
  const database = await openCustomComponentDatabase()
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_VERSIONS,
        CUSTOM_COMPONENT_STORE_FILES,
        CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
      ], 'readwrite')
      const versions = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS)
      const files = transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES)
      const stagedInstanceData = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      let cleanupCount = 0
      let settled = false
      let failed = false

      /** 事务写入失败时统一回滚，保证某个 staged 更新不会只删包或只删数据快照。 */
      const fail = (): void => {
        if (settled || failed) return
        failed = true
        try {
          transaction.abort()
        } catch {
          // 已结束事务由事件处理器完成结算。
        }
      }

      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve(cleanupCount)
      }
      transaction.onabort = () => {
        if (settled) return
        settled = true
        reject(new StagedComponentUpdateRepositoryError('UPDATE_STAGE_WRITE_FAILED', '中断更新清理失败，当前活动版本未被修改。'))
      }
      transaction.onerror = () => undefined

      const versionsRequest = versions.getAll()
      versionsRequest.onerror = fail
      versionsRequest.onsuccess = () => {
        const stagedVersions = (versionsRequest.result as InstalledComponentVersionRecord[])
          .filter((record) => record.stagedUpdateId !== undefined)
        cleanupCount = stagedVersions.length
        try {
          for (const record of stagedVersions) {
            const updateId = record.stagedUpdateId
            if (!updateId) continue
            observeWriteFailure(versions.delete([record.componentId, record.version]), () => fail(), record.componentId)
            observeWriteFailure(files.delete(IDBKeyRange.bound(
              [record.componentId, record.version, ''],
              [record.componentId, record.version, '\uffff'],
            )), () => fail(), record.componentId)
            observeWriteFailure(stagedInstanceData.delete(IDBKeyRange.bound(
              [updateId, '', ''],
              [updateId, '\uffff', '\uffff'],
            )), () => fail(), record.componentId)
          }
        } catch {
          fail()
        }
      }
    })
  } finally {
    database.close()
  }
}

/**
 * 丢弃一个已经失败或被用户拒绝的 staged 更新，不触及仍可运行的 active/rollback 包与活动实例数据。
 *
 * 更新服务只会在 migration、健康检查或最终提交失败后调用；所有 staged 文件、版本与快照在同一
 * 事务删除，保证下次启动的恢复清理不必猜测某个 updateId 是否仍可继续。
 */
export async function discardStagedComponentUpdate(updateId: string, componentId: string): Promise<void> {
  if (!updateId || !componentId) {
    throw new StagedComponentUpdateRepositoryError('UPDATE_STAGE_INPUT_INVALID', '组件更新暂存标识无效。', componentId)
  }
  const database = await openCustomComponentDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_VERSIONS,
        CUSTOM_COMPONENT_STORE_FILES,
        CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
      ], 'readwrite')
      const versions = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS)
      const files = transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES)
      const stagedData = transaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
      let settled = false
      const fail = (): void => {
        try { transaction.abort() } catch { /* 由 onabort 统一结算。 */ }
      }
      transaction.oncomplete = () => { if (!settled) { settled = true; resolve() } }
      transaction.onabort = () => {
        if (!settled) {
          settled = true
          reject(new StagedComponentUpdateRepositoryError('UPDATE_STAGE_WRITE_FAILED', '组件更新暂存清理失败，当前活动版本未被修改。', componentId))
        }
      }
      transaction.onerror = () => undefined
      const stagedRequest = versions.getAll(createComponentVersionRange(componentId))
      stagedRequest.onerror = fail
      stagedRequest.onsuccess = () => {
        const stagedVersions = (stagedRequest.result as InstalledComponentVersionRecord[])
          .filter((record) => record.stagedUpdateId === updateId)
        try {
          for (const version of stagedVersions) {
            observeWriteFailure(versions.delete([componentId, version.version]), () => fail(), componentId)
            observeWriteFailure(files.delete(IDBKeyRange.bound(
              [componentId, version.version, ''],
              [componentId, version.version, '\uffff'],
            )), () => fail(), componentId)
          }
          observeWriteFailure(stagedData.delete(IDBKeyRange.bound(
            [updateId, '', ''],
            [updateId, '\uffff', '\uffff'],
          )), () => fail(), componentId)
        } catch {
          fail()
        }
      }
    })
  } finally {
    database.close()
  }
}
