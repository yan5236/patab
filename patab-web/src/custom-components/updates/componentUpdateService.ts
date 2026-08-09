import type { PatabWidgetManifestV1, WidgetPermission } from '@patab/widget-sdk'
import type { WidgetIntegrityDocument, WidgetSignatureDocument } from '@patab/widget-package'

import type {
  StagedSandboxRuntimeHandle,
  StartStagedSandboxSurfaceRequest,
} from '@/custom-components/runtime/sandboxRuntime'
import { getInstalledComponent } from '@/custom-components/repository/componentPackageRepository'

import { commitStagedComponentUpdate } from './componentUpdateCommitRepository'
import {
  discardStagedComponentUpdate,
  stageComponentUpdate,
} from './stagedComponentUpdateRepository'

/** 更新服务只依赖 Runtime 已有的受限 staged 启动入口，不创建第二套 iframe/会话实现。 */
export interface ComponentUpdateRuntime {
  readonly startStagedUpdateSurface: (
    request: StartStagedSandboxSurfaceRequest,
  ) => Promise<StagedSandboxRuntimeHandle>
}

/** 更新执行需要的已审查包、用户确认 grant 与现有 launcher 实例引用。 */
export interface ExecuteComponentUpdateInput {
  readonly updateId: string
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signature?: WidgetSignatureDocument
  readonly files: readonly { readonly path: string; readonly content: Blob | string }[]
  readonly grantedPermissions: readonly WidgetPermission[]
  readonly grantedNetworkOrigins: readonly string[]
  /** 仅由 launcher 轻量引用收集的全部现有实例；空私有数据实例也必须接受 health 握手。 */
  readonly instanceIds: readonly string[]
}

/** 更新服务外部可注入的页面 Runtime 和离屏容器工厂，测试无需真实 DOM 或 iframe。 */
export interface ComponentUpdateServiceOptions {
  readonly runtime: ComponentUpdateRuntime
  readonly createOffscreenContainer?: () => { readonly element: HTMLElement; readonly dispose: () => void }
}

/** 更新各阶段归并出的安全失败码；不包含组件 HTML、私有数据、端口或浏览器异常。 */
export type ComponentUpdateServiceErrorCode =
  | 'UPDATE_MIGRATION_FAILED'
  | 'UPDATE_HEALTH_FAILED'
  | 'UPDATE_COMMIT_FAILED'

/** 表示 staged 更新失败；调用方只能按稳定阶段码恢复审查页或目录。 */
export class ComponentUpdateServiceError extends Error {
  /** 创建安全的更新执行错误，组件 ID 仅用于 Store 局部状态而不直接渲染。 */
  constructor(readonly code: ComponentUpdateServiceErrorCode, readonly componentId: string) {
    super('组件更新未完成，当前版本保持可用。')
    this.name = 'ComponentUpdateServiceError'
  }
}

/** 创建不与组件 ID 混淆的随机 staged 标识；缺少安全随机源时拒绝在写库前开始更新。 */
export function createComponentUpdateId(componentId: string): string {
  if (!globalThis.crypto?.randomUUID) throw new ComponentUpdateServiceError('UPDATE_COMMIT_FAILED', componentId)
  return globalThis.crypto.randomUUID()
}

/** 校验并去重 launcher 提供的实例 ID，避免异常持久化引用扩大 migration/health 执行次数。 */
function collectInstanceIds(instanceIds: readonly string[]): readonly string[] {
  const unique = new Set<string>()
  for (const instanceId of instanceIds) {
    if (typeof instanceId === 'string' && instanceId.length > 0 && instanceId.length <= 128 && !/[\u0000-\u001f]/.test(instanceId)) {
      unique.add(instanceId)
    }
  }
  return [...unique]
}

/** 创建不可见且不参与页面布局的临时容器；每次更新结束后无条件移除整棵 staged iframe。 */
function createDefaultOffscreenContainer(): { readonly element: HTMLElement; readonly dispose: () => void } {
  if (!globalThis.document?.body) throw new ComponentUpdateServiceError('UPDATE_HEALTH_FAILED', '')
  const element = document.createElement('div')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText = 'position:fixed;inline-size:1px;block-size:1px;overflow:hidden;opacity:0;pointer-events:none;inset:-9999px;'
  document.body.append(element)
  return { element, dispose: () => element.remove() }
}

/** 在单个实例运行迁移并保证 iframe 即使完成或失败也立即销毁。 */
async function runMigration(
  runtime: ComponentUpdateRuntime,
  input: ExecuteComponentUpdateInput,
  instanceId: string,
  container: HTMLElement,
  oldVersion: string,
): Promise<void> {
  const handle = await runtime.startStagedUpdateSurface({
    componentId: input.manifest.id,
    instanceId,
    updateId: input.updateId,
    surface: 'migration',
    container,
    oldVersion,
  })
  handle.destroy()
}

/** 对单个实例离屏启动 staged widget 并在握手完成后立刻清理，健康检查不改变活动版本。 */
async function runHealthCheck(
  runtime: ComponentUpdateRuntime,
  input: ExecuteComponentUpdateInput,
  instanceId: string,
  container: HTMLElement,
  oldVersion: string,
): Promise<void> {
  const handle = await runtime.startStagedUpdateSurface({
    componentId: input.manifest.id,
    instanceId,
    updateId: input.updateId,
    surface: 'widget',
    container,
    oldVersion,
  })
  handle.destroy()
}

/**
 * 执行 staged 更新的固定时序：快照、受限 migration、全部实例健康握手、单事务提交。
 *
 * 任一阶段异常都会删除本 updateId 的 staged 包与数据；旧 activeVersion、旧 grant 和活动实例
 * 数据未在提交前修改，提交事务失败同样会回滚，因此调用者始终可继续使用上一成功版本。
 */
export async function executeComponentUpdate(
  input: ExecuteComponentUpdateInput,
  options: ComponentUpdateServiceOptions,
): Promise<void> {
  const instanceIds = collectInstanceIds(input.instanceIds)
  await stageComponentUpdate({
    updateId: input.updateId,
    manifest: input.manifest,
    integrity: input.integrity,
    ...(input.signature ? { signature: input.signature } : {}),
    files: input.files,
  })
  let container: { readonly element: HTMLElement; readonly dispose: () => void } | undefined
  try {
    container = (options.createOffscreenContainer ?? createDefaultOffscreenContainer)()
    const stagedVersion = input.manifest.version
    const oldVersion = (await getInstalledComponent(input.manifest.id))?.activeVersion
    if (!oldVersion || oldVersion === stagedVersion) throw new ComponentUpdateServiceError('UPDATE_COMMIT_FAILED', input.manifest.id)

    if (input.manifest.surfaces.migration) {
      try {
        for (const instanceId of instanceIds) await runMigration(options.runtime, input, instanceId, container.element, oldVersion)
      } catch {
        throw new ComponentUpdateServiceError('UPDATE_MIGRATION_FAILED', input.manifest.id)
      }
    }
    try {
      for (const instanceId of instanceIds) await runHealthCheck(options.runtime, input, instanceId, container.element, oldVersion)
    } catch {
      throw new ComponentUpdateServiceError('UPDATE_HEALTH_FAILED', input.manifest.id)
    }
    try {
      await commitStagedComponentUpdate({
        updateId: input.updateId,
        componentId: input.manifest.id,
        grantedPermissions: input.grantedPermissions,
        grantedNetworkOrigins: input.grantedNetworkOrigins,
      })
    } catch {
      throw new ComponentUpdateServiceError('UPDATE_COMMIT_FAILED', input.manifest.id)
    }
  } catch (error) {
    await discardStagedComponentUpdate(input.updateId, input.manifest.id).catch(() => undefined)
    throw error
  } finally {
    container?.dispose()
  }
}
