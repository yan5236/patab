import type { WidgetPermission } from '@patab/widget-sdk'

import {
  assertComponentGrants,
  ComponentPackageRepositoryError,
  type InstalledComponentFileRecord,
  type InstalledComponentRecord,
  type InstalledComponentVersionRecord,
} from '@/custom-components/repository/componentPackageRepository'
import {
  CUSTOM_COMPONENT_STORE_COMPONENTS,
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from '@/custom-components/repository/customComponentDatabase'
import type { InstanceStorageRecord } from '@/custom-components/repository/instanceStorageRepository'

import {
  StagedComponentUpdateRepositoryError,
  type StagedInstanceStorageRecord,
} from './stagedComponentUpdateRepository'

/** staged 更新最终提交所需的固定标识与已审查 grant 快照。 */
export interface CommitStagedComponentUpdateInput {
  readonly updateId: string
  readonly componentId: string
  readonly grantedPermissions: readonly WidgetPermission[]
  readonly grantedNetworkOrigins: readonly string[]
}

/** 仅供测试在写请求入队前模拟事务异常，生产调用不传入该选项。 */
export interface CommitStagedComponentUpdateOptions {
  readonly beforeWrite?: () => void
}

/** 构造组件某个版本文件的复合键范围，供仅保留一个 rollback 包时删除过期文件。 */
function createVersionFileRange(componentId: string, version: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, version, ''], [componentId, version, '\uffff'])
}

/** 构造一个组件全部版本范围，保证提交不扫描其他组件的历史包。 */
function createComponentVersionRange(componentId: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, ''], [componentId, '\uffff'])
}

/** 构造活动实例数据范围，最终切换只替换目标组件的原子快照。 */
function createComponentInstanceRange(componentId: string): IDBKeyRange {
  return IDBKeyRange.bound([componentId, '', ''], [componentId, '\uffff', '\uffff'])
}

/** 构造指定 staged update 的快照范围，不会删除其他组件尚未恢复的 staged 数据。 */
function createStagedUpdateRange(updateId: string): IDBKeyRange {
  return IDBKeyRange.bound([updateId, '', ''], [updateId, '\uffff', '\uffff'])
}

/** 统一创建提交事务失败，禁止把 DOMException 或 storage 值传出更新边界。 */
function commitFailure(componentId: string): StagedComponentUpdateRepositoryError {
  return new StagedComponentUpdateRepositoryError('UPDATE_STAGE_WRITE_FAILED', '组件更新提交失败，当前活动版本保持不变。', componentId)
}

/**
 * 在同一 IndexedDB 事务切换 activeVersion、完整 staged 数据快照与 grant，并保留唯一上一成功版本。
 *
 * 所有读取和写入均位于一个 readwrite 事务：旧 active data 仅在 staged version、快照和 grant
 * 全部通过验证后才被替换；任一个 request 失败会 abort，随后更新服务删除 staged 内容而旧版本
 * 文件、授权与活动数据仍可继续使用。
 */
export async function commitStagedComponentUpdate(
  input: CommitStagedComponentUpdateInput,
  options: CommitStagedComponentUpdateOptions = {},
): Promise<void> {
  if (!input.updateId || !input.componentId) {
    throw new StagedComponentUpdateRepositoryError('UPDATE_STAGE_INPUT_INVALID', '组件更新提交标识无效。', input.componentId)
  }
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
      let failure: Error | undefined
      let settled = false

      /** 使用唯一 abort 出口确保版本、文件、数据和 grant 不会出现部分提交。 */
      const fail = (error: Error = commitFailure(input.componentId)): void => {
        if (settled) return
        failure ??= error
        try { transaction.abort() } catch { /* 由 onabort/oncomplete 统一结算。 */ }
      }
      const observe = (request: IDBRequest): void => {
        request.addEventListener('error', () => fail(), { once: true })
      }
      transaction.oncomplete = () => { if (!settled) { settled = true; resolve() } }
      transaction.onabort = () => { if (!settled) { settled = true; reject(failure ?? commitFailure(input.componentId)) } }
      transaction.onerror = () => undefined

      const componentRequest = components.get(input.componentId)
      componentRequest.onerror = () => fail()
      componentRequest.onsuccess = () => {
        const component = componentRequest.result as InstalledComponentRecord | undefined
        if (!component) {
          fail(new StagedComponentUpdateRepositoryError('COMPONENT_NOT_INSTALLED', '组件尚未安装，不能提交更新。', input.componentId))
          return
        }
        const versionsRequest = versions.getAll(createComponentVersionRange(input.componentId))
        versionsRequest.onerror = () => fail()
        versionsRequest.onsuccess = () => {
          const records = versionsRequest.result as InstalledComponentVersionRecord[]
          const previousActive = records.find((record) => record.version === component.activeVersion && record.isActive)
          const staged = records.find((record) => record.stagedUpdateId === input.updateId)
          if (!previousActive || !staged || staged.replacesVersion !== component.activeVersion || staged.isActive) {
            fail()
            return
          }
          try {
            assertComponentGrants(staged.manifest, input)
          } catch (error) {
            fail(error instanceof ComponentPackageRepositoryError ? error : commitFailure(input.componentId))
            return
          }

          const stagedDataRequest = stagedInstanceData.getAll(createStagedUpdateRange(input.updateId))
          stagedDataRequest.onerror = () => fail()
          stagedDataRequest.onsuccess = () => {
            const snapshots = stagedDataRequest.result as StagedInstanceStorageRecord[]
            if (snapshots.some((snapshot) => snapshot.componentId !== input.componentId)) {
              fail()
              return
            }
            try {
              options.beforeWrite?.()
              const oldRollbacks = records.filter((record) => record.isRollback && record.version !== previousActive.version)
              for (const rollback of oldRollbacks) {
                observe(versions.delete([input.componentId, rollback.version]))
                observe(files.delete(createVersionFileRange(input.componentId, rollback.version)))
              }
              observe(versions.put({ ...previousActive, isActive: false, isRollback: true }))
              observe(versions.put({
                ...staged,
                isActive: true,
                isRollback: false,
                stagedUpdateId: undefined,
                replacesVersion: undefined,
              } satisfies InstalledComponentVersionRecord))
              observe(components.put({
                ...component,
                activeVersion: staged.version,
                grantedPermissions: [...input.grantedPermissions],
                grantedNetworkOrigins: [...input.grantedNetworkOrigins],
              } satisfies InstalledComponentRecord))
              observe(instanceData.delete(createComponentInstanceRange(input.componentId)))
              for (const snapshot of snapshots) {
                observe(instanceData.put({
                  componentId: input.componentId,
                  instanceId: snapshot.instanceId,
                  key: snapshot.key,
                  value: snapshot.value,
                  serializedBytes: snapshot.serializedBytes,
                  updatedAt: snapshot.updatedAt,
                } satisfies InstanceStorageRecord))
              }
              observe(stagedInstanceData.delete(createStagedUpdateRange(input.updateId)))
            } catch {
              fail()
            }
          }
        }
      }
    })
  } finally {
    database.close()
  }
}
