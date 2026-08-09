import type {
  PatabWidgetManifestV1,
  WidgetPermission,
} from '@patab/widget-sdk'
import type {
  WidgetIntegrityDocument,
  WidgetSignatureDocument,
} from '@patab/widget-package'

import {
  CUSTOM_COMPONENT_STORE_COMPONENTS,
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from './customComponentDatabase'

/** 已安装组件在仓库中的活动状态；运行时停用状态由后续安全模块管理。 */
export type InstalledComponentStatus = 'active'

/** components 表中代表已安装组件目录的记录。 */
export interface InstalledComponentRecord {
  readonly componentId: string
  readonly activeVersion: string
  readonly publisherPublicKey?: string
  readonly grantedPermissions: readonly WidgetPermission[]
  /** 已获用户确认的精确 HTTPS 网络来源；后续 Broker 只能使用这一快照进行授权。 */
  readonly grantedNetworkOrigins: readonly string[]
  readonly status: InstalledComponentStatus
  readonly installedAt: number
}

/** versions 表中代表单个已验证组件版本的记录。 */
export interface InstalledComponentVersionRecord {
  readonly componentId: string
  readonly version: string
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signature?: WidgetSignatureDocument
  readonly installSource: 'local-import'
  readonly isActive: boolean
  readonly isRollback: boolean
  /** 暂存更新的唯一标识；存在时该版本绝不能被运行时读取或当作回滚版本。 */
  readonly stagedUpdateId?: string
  /** 暂存版本替换的当前活动版本，供后续迁移、健康检查和原子切换保持同一基线。 */
  readonly replacesVersion?: string
  readonly installedAt: number
}

/** files 表中保存的自包含 surface 文本或安装前静态素材 Blob。 */
export interface InstalledComponentFileRecord {
  readonly componentId: string
  readonly version: string
  readonly path: string
  readonly content: Blob | string
}

/** 调用安装事务时提交的已验证包快照，不包含任何待执行的第三方代码。 */
export interface InstallComponentPackageInput {
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signature?: WidgetSignatureDocument
  readonly grantedPermissions: readonly WidgetPermission[]
  /** 安装确认流程中获准的精确 HTTPS 网络来源。 */
  readonly grantedNetworkOrigins?: readonly string[]
  readonly files: readonly {
    readonly path: string
    readonly content: Blob | string
  }[]
  readonly installedAt?: number
}

/** 运行中重新确认后的完整授权快照；调用方必须显式传入全部授权，不能依赖旧版本自动继承。 */
export interface UpdateComponentGrantsInput {
  readonly grantedPermissions: readonly WidgetPermission[]
  readonly grantedNetworkOrigins: readonly string[]
}

/** 组件包 Repository 对外暴露的稳定错误码。 */
export type ComponentPackageRepositoryErrorCode =
  | 'COMPONENT_ALREADY_INSTALLED'
  | 'COMPONENT_PACKAGE_INVALID'
  | 'COMPONENT_PACKAGE_WRITE_FAILED'

/**
 * 表示组件包仓库的安全失败，不携带 IndexedDB 原始异常、文件正文或安装者本地信息。
 */
export class ComponentPackageRepositoryError extends Error {
  /**
   * 创建只含稳定错误码和可选组件标识的 Repository 错误。
   */
  constructor(
    readonly code: ComponentPackageRepositoryErrorCode,
    message: string,
    readonly componentId?: string,
  ) {
    super(message)
    this.name = 'ComponentPackageRepositoryError'
  }
}

/**
 * 将单个 IndexedDB 请求包装为 Promise；此助手只用于只读流程，避免在安装事务中跨任务排队新的写入。
 */
function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

/**
 * 等待 IndexedDB 事务完成或回滚，以确认所有同步排入的写操作原子提交而不是只观察单个 request 成功。
 */
function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务已回滚'))
    transaction.onerror = () => undefined
  })
}

/**
 * 将 IndexedDB 约束错误映射为“已安装”，其余异常统一为不暴露内部细节的写入失败。
 */
function toRepositoryWriteError(error: unknown, componentId: string): ComponentPackageRepositoryError {
  if (error instanceof DOMException && error.name === 'ConstraintError') {
    return new ComponentPackageRepositoryError('COMPONENT_ALREADY_INSTALLED', '组件已经安装，不能重复写入。', componentId)
  }
  return new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '组件包写入失败，已回滚本次安装。', componentId)
}

/**
 * 记录异步写请求的首个原始失败，以便事务最终回滚后仍能保留约束冲突与一般写入失败的稳定映射。
 */
function observeWriteFailure(request: IDBRequest, onFailure: (error: unknown) => void): void {
  request.addEventListener('error', () => {
    onFailure(request.error)
  }, { once: true })
}

/**
 * 验证安装输入只含具有统一相对路径的自包含文件，避免 Repository 成为绕过归档校验的第二入口。
 */
function assertInstallInput(input: InstallComponentPackageInput): void {
  const seenPaths = new Set<string>()
  const networkOrigins = new Set<string>()
  if (!input.manifest.id || !input.manifest.version || input.files.length === 0) {
    throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件包安装输入不完整。', input.manifest.id)
  }

  for (const file of input.files) {
    if (
      !file.path
      || file.path.includes('\\')
      || file.path.includes('\0')
      || file.path.startsWith('/')
      || file.path.endsWith('/')
      || file.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      || seenPaths.has(file.path)
      || (typeof file.content !== 'string' && !(file.content instanceof Blob))
    ) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件包安装输入包含无效文件。', input.manifest.id)
    }
    seenPaths.add(file.path)
  }

  for (const origin of input.grantedNetworkOrigins ?? []) {
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件包安装输入包含无效网络来源。', input.manifest.id)
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin || networkOrigins.has(origin)) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件包安装输入包含无效网络来源。', input.manifest.id)
    }
    networkOrigins.add(origin)
  }
}

/**
 * 从本地已验证包构造 components 表目录记录，使 activeVersion、发布者与授权在同一事务中持久化。
 */
function createComponentRecord(input: InstallComponentPackageInput, installedAt: number): InstalledComponentRecord {
  return {
    componentId: input.manifest.id,
    activeVersion: input.manifest.version,
    ...(input.manifest.publisher?.publicKey ? { publisherPublicKey: input.manifest.publisher.publicKey } : {}),
    grantedPermissions: [...input.grantedPermissions],
    grantedNetworkOrigins: [...(input.grantedNetworkOrigins ?? [])],
    status: 'active',
    installedAt,
  }
}

/**
 * 从安装输入构造唯一活动版本记录；回滚标记只能由后续更新事务设置，首次安装不能预先伪造。
 */
function createVersionRecord(input: InstallComponentPackageInput, installedAt: number): InstalledComponentVersionRecord {
  return {
    componentId: input.manifest.id,
    version: input.manifest.version,
    manifest: input.manifest,
    integrity: input.integrity,
    ...(input.signature ? { signature: input.signature } : {}),
    installSource: 'local-import',
    isActive: true,
    isRollback: false,
    installedAt,
  }
}

/**
 * 按当前活动 Manifest 校验完整授权快照。
 *
 * required 项目不能被撤销，optional 项目只能在当前版本已声明的范围内显式授予，防止更新新增权限自动继承旧授权。
 */
export function assertComponentGrants(
  manifest: PatabWidgetManifestV1,
  input: UpdateComponentGrantsInput,
): void {
  const declaredPermissions = new Set<WidgetPermission>([
    ...(manifest.permissions?.required ?? []),
    ...(manifest.permissions?.optional ?? []),
  ])
  const requiredPermissions = new Set<WidgetPermission>(manifest.permissions?.required ?? [])
  const nextPermissions = new Set<WidgetPermission>()
  for (const permission of input.grantedPermissions) {
    if (!declaredPermissions.has(permission) || nextPermissions.has(permission)) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件权限授权快照无效。', manifest.id)
    }
    nextPermissions.add(permission)
  }
  for (const permission of requiredPermissions) {
    if (!nextPermissions.has(permission)) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件必需权限不能被撤销。', manifest.id)
    }
  }

  const declaredNetworkOrigins = new Map<string, boolean>((manifest.network ?? []).map((network) => [network.origin, network.required]))
  const nextOrigins = new Set<string>()
  for (const origin of input.grantedNetworkOrigins) {
    if (!declaredNetworkOrigins.has(origin) || nextOrigins.has(origin)) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件网络来源授权快照无效。', manifest.id)
    }
    nextOrigins.add(origin)
  }
  for (const [origin, required] of declaredNetworkOrigins) {
    if (required && !nextOrigins.has(origin)) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件必需网络来源不能被撤销。', manifest.id)
    }
  }
}

/**
 * 原子写入首次安装的组件目录、活动版本和全部文件；任意冲突或写入失败都会回滚，绝不留下半安装状态。
 */
export async function installComponentPackage(input: InstallComponentPackageInput): Promise<void> {
  assertInstallInput(input)
  const installedAt = input.installedAt ?? Date.now()
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction([
      CUSTOM_COMPONENT_STORE_COMPONENTS,
      CUSTOM_COMPONENT_STORE_VERSIONS,
      CUSTOM_COMPONENT_STORE_FILES,
    ], 'readwrite')
    const completion = waitForTransaction(transaction)
    let writeFailure: unknown
    const rememberWriteFailure = (error: unknown): void => {
      writeFailure ??= error
    }

    try {
      observeWriteFailure(
        transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS).add(createComponentRecord(input, installedAt)),
        rememberWriteFailure,
      )
      observeWriteFailure(
        transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).add(createVersionRecord(input, installedAt)),
        rememberWriteFailure,
      )
      const filesStore = transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES)
      for (const file of input.files) {
        const record: InstalledComponentFileRecord = {
          componentId: input.manifest.id,
          version: input.manifest.version,
          path: file.path,
          content: file.content,
        }
        observeWriteFailure(filesStore.add(record), rememberWriteFailure)
      }
    } catch (error) {
      transaction.abort()
      throw toRepositoryWriteError(error, input.manifest.id)
    }

    try {
      await completion
    } catch (error) {
      throw toRepositoryWriteError(writeFailure ?? error, input.manifest.id)
    }
  } finally {
    database.close()
  }
}

/**
 * 读取已安装组件目录；缺失时返回 undefined，使缺包占位逻辑保留 launcher 引用而非删除用户状态。
 */
export async function getInstalledComponent(componentId: string): Promise<InstalledComponentRecord | undefined> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_COMPONENTS, 'readonly')
    const record = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS).get(componentId))
    return record as InstalledComponentRecord | undefined
  } finally {
    database.close()
  }
}

/**
 * 原子替换当前活动组件的完整授权快照。
 *
 * 此入口供权限撤销或重新确认使用；它在同一事务中读取活动 Manifest 后校验声明范围，成功后 Broker 的下一次动态查询即可立即观察到新状态。
 */
export async function updateComponentGrants(
  componentId: string,
  input: UpdateComponentGrantsInput,
): Promise<InstalledComponentRecord> {
  if (!componentId) {
    throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件标识无效。')
  }

  const database = await openCustomComponentDatabase()
  try {
    return await new Promise<InstalledComponentRecord>((resolve, reject) => {
      const transaction = database.transaction([
        CUSTOM_COMPONENT_STORE_COMPONENTS,
        CUSTOM_COMPONENT_STORE_VERSIONS,
      ], 'readwrite')
      const components = transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS)
      const versions = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS)
      let nextRecord: InstalledComponentRecord | undefined
      let settled = false

      /** 统一中止授权更新，保证不写入部分权限或来源快照。 */
      const fail = (error: ComponentPackageRepositoryError): void => {
        if (settled) return
        try {
          transaction.abort()
        } catch {
          // onabort 将统一返回稳定错误。
        }
        settled = true
        reject(error)
      }

      transaction.oncomplete = () => {
        if (!settled && nextRecord) {
          settled = true
          resolve(nextRecord)
        }
      }
      transaction.onabort = () => {
        if (!settled) {
          settled = true
          reject(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '组件授权更新失败，未提交本次修改。', componentId))
        }
      }
      transaction.onerror = () => undefined

      const componentRequest = components.get(componentId)
      componentRequest.onerror = () => fail(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '组件授权读取失败。', componentId))
      componentRequest.onsuccess = () => {
        const component = componentRequest.result as InstalledComponentRecord | undefined
        if (!component) {
          fail(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件未安装。', componentId))
          return
        }
        const versionRequest = versions.get([componentId, component.activeVersion])
        versionRequest.onerror = () => fail(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '组件版本读取失败。', componentId))
        versionRequest.onsuccess = () => {
          const version = versionRequest.result as InstalledComponentVersionRecord | undefined
          if (!version) {
            fail(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件活动版本不可用。', componentId))
            return
          }
          try {
            assertComponentGrants(version.manifest, input)
            nextRecord = {
              ...component,
              grantedPermissions: [...input.grantedPermissions],
              grantedNetworkOrigins: [...input.grantedNetworkOrigins],
            }
            const writeRequest = components.put(nextRecord)
            writeRequest.onerror = () => fail(new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '组件授权更新失败。', componentId))
          } catch (error) {
            fail(error instanceof ComponentPackageRepositoryError
              ? error
              : new ComponentPackageRepositoryError('COMPONENT_PACKAGE_INVALID', '组件授权快照无效。', componentId))
          }
        }
      }
    })
  } finally {
    database.close()
  }
}

/**
 * 读取全部已安装组件目录供 Store 构建商店列表；结果按最近安装优先、组件 ID 次序稳定排序，不暴露文件内容。
 */
export async function listInstalledComponents(): Promise<readonly InstalledComponentRecord[]> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_COMPONENTS, 'readonly')
    const records = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_COMPONENTS).getAll()) as InstalledComponentRecord[]
    return records.sort((left, right) => right.installedAt - left.installedAt || left.componentId.localeCompare(right.componentId, 'en-US'))
  } finally {
    database.close()
  }
}

/**
 * 读取组件当前活动版本；目录或版本记录缺失均安全返回 undefined，由上层决定是否展示缺包占位。
 */
export async function getActiveComponentVersion(componentId: string): Promise<InstalledComponentVersionRecord | undefined> {
  const component = await getInstalledComponent(componentId)
  if (!component) return undefined

  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_VERSIONS, 'readonly')
    const record = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).get([componentId, component.activeVersion]))
    return record as InstalledComponentVersionRecord | undefined
  } finally {
    database.close()
  }
}

/**
 * 读取当前活动版本的单个已验证文件；不提供任意版本读取入口，以免运行时绕过活动版本选择。
 */
export async function readActiveComponentFile(componentId: string, path: string): Promise<InstalledComponentFileRecord | undefined> {
  const component = await getInstalledComponent(componentId)
  if (!component) return undefined

  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_FILES, 'readonly')
    const record = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).get([componentId, component.activeVersion, path]))
    return record as InstalledComponentFileRecord | undefined
  } finally {
    database.close()
  }
}

/**
 * 读取最近一个回滚版本；更新模块完成 staged 切换后负责写入其标记，首次安装不会伪造回滚包。
 */
export async function getRollbackComponentVersion(componentId: string): Promise<InstalledComponentVersionRecord | undefined> {
  const database = await openCustomComponentDatabase()
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_VERSIONS, 'readonly')
    const range = IDBKeyRange.bound([componentId, ''], [componentId, '\uffff'])
    const records = await readRequest(transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).getAll(range)) as InstalledComponentVersionRecord[]
    return records
      .filter((record) => record.isRollback)
      .sort((left, right) => right.installedAt - left.installedAt)[0]
  } finally {
    database.close()
  }
}

/**
 * 清理没有对应活动 updateId 的 stagedInstanceData，供中断更新恢复时删除孤立临时快照而不触碰活动实例数据。
 */
export async function cleanupOrphanedStagedInstanceData(activeUpdateIds: ReadonlySet<string>): Promise<number> {
  const database = await openCustomComponentDatabase()
  try {
    const readTransaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readonly')
    const keys = await readRequest(readTransaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA).getAllKeys())
    const orphanedKeys = keys.filter((key) => {
      const updateId = Array.isArray(key) ? key[0] : undefined
      return typeof updateId === 'string' && !activeUpdateIds.has(updateId)
    })
    if (orphanedKeys.length === 0) return 0

    const writeTransaction = database.transaction(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, 'readwrite')
    const completion = waitForTransaction(writeTransaction)
    const store = writeTransaction.objectStore(CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA)
    try {
      for (const key of orphanedKeys) {
        store.delete(key)
      }
    } catch {
      writeTransaction.abort()
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '孤立更新数据清理失败，已回滚。')
    }

    try {
      await completion
      return orphanedKeys.length
    } catch (error) {
      throw new ComponentPackageRepositoryError('COMPONENT_PACKAGE_WRITE_FAILED', '孤立更新数据清理失败，已回滚。')
    }
  } finally {
    database.close()
  }
}
