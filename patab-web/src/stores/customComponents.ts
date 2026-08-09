import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type {
  PatabWidgetManifestV1,
  WidgetNetworkDeclaration,
  WidgetPermission,
} from '@patab/widget-sdk'
import type {
  WidgetIntegrityDocument,
  WidgetSignatureDocument,
  WidgetSignatureVerification,
} from '@patab/widget-package'

import {
  type ComponentPackageRepositoryError,
  getActiveComponentVersion,
  getInstalledComponent,
  readActiveComponentFile,
  type InstalledComponentRecord,
  installComponentPackage,
  listInstalledComponents,
} from '@/custom-components/repository/componentPackageRepository'
import {
  clearRuntimeHealth,
  getRuntimeHealth,
  type RuntimeHealthRecord,
} from '@/custom-components/repository/runtimeHealthRepository'
import { decideComponentUpdate } from '@/custom-components/updates/componentUpdatePolicy'
import { createComponentUpdateGrantReview, type ComponentUpdateGrantDiff } from '@/custom-components/updates/componentUpdateGrantPolicy'
import {
  createComponentUpdateId,
  executeComponentUpdate,
  type ComponentUpdateRuntime,
} from '@/custom-components/updates/componentUpdateService'
import { cleanupInterruptedComponentUpdates } from '@/custom-components/updates/stagedComponentUpdateRepository'
import { getCustomComponentRuntime } from '@/custom-components/runtime/runtimeHost'
import {
  containsMv3OriginPermission,
  removeMv3OriginPermission,
  requestMv3OriginPermission,
} from '@/custom-components/capabilities/networkAdapters'
import { detectRuntimeEnvironment } from '@/utils/runtimeEnvironment'
import { createCustomComponentUninstallActions } from './customComponentUninstall'

export type { CustomComponentUninstallState } from './customComponentUninstall'

/** 组件包解析、审查和安装流程在 Store 中可观察的阶段。 */
export type CustomComponentParsingStatus = 'error' | 'idle' | 'installing' | 'parsing' | 'review'

/** 安装前审查所需的已验证静态包快照；其产生过程由文件选择器和 Worker 负责，Store 不读取 ZIP。 */
export interface CustomComponentPackageReview {
  readonly manifest: PatabWidgetManifestV1
  readonly integrity: WidgetIntegrityDocument
  readonly signature?: WidgetSignatureDocument
  readonly signatureVerification: WidgetSignatureVerification
  readonly files: readonly {
    readonly path: string
    readonly content: Blob | string
  }[]
}

/** 供组件商店渲染的已安装第三方目录项，只含经过验证的静态 Manifest 与目录状态。 */
export interface InstalledCustomComponentCatalogEntry {
  readonly component: InstalledComponentRecord
  readonly manifest: PatabWidgetManifestV1
}

/** 组件更新流程的轻量状态；实际 staged 迁移与原子切换由阶段 9 服务实现。 */
export type CustomComponentUpdateState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'awaiting-confirmation'
      readonly componentId: string
      readonly incomingVersion: string
      readonly diff: ComponentUpdateGrantDiff
    }

/** Store 审查或安装前置条件失败时使用的稳定错误码。 */
export type CustomComponentStoreErrorCode =
  | 'PUBLISHER_KEY_CHANGED'
  | 'REQUIRED_PERMISSION_NOT_GRANTED'
  | 'SIGNATURE_NOT_INSTALLABLE'
  | 'UPDATE_VERSION_INVALID'
  | 'UPDATE_VERSION_NOT_HIGHER'
  | 'UPDATE_EXECUTION_FAILED'

/**
 * 表示 Store 拒绝越过安装确认边界的安全错误，禁止以组件包正文或 Repository 原始异常作为 UI 消息。
 */
export class CustomComponentStoreError extends Error {
  /**
   * 创建只含稳定错误码与组件标识的 Store 错误。
   */
  constructor(
    readonly code: CustomComponentStoreErrorCode,
    message: string,
    readonly componentId: string,
  ) {
    super(message)
    this.name = 'CustomComponentStoreError'
  }
}

/**
 * 从审查结果初始化所有声明权限为未授权，确保 required 和 optional 都必须由用户流程显式决定。
 */
function createPermissionGrants(review: CustomComponentPackageReview): Partial<Record<WidgetPermission, boolean>> {
  const grants: Partial<Record<WidgetPermission, boolean>> = {}
  for (const permission of review.manifest.permissions?.required ?? []) {
    grants[permission] = false
  }
  for (const permission of review.manifest.permissions?.optional ?? []) {
    grants[permission] = false
  }
  return grants
}

/**
 * 从审查结果初始化所有网络来源为未授权，使必需来源也必须在安装前经用户明确确认。
 */
function createNetworkGrants(review: CustomComponentPackageReview): Record<string, boolean> {
  return Object.fromEntries((review.manifest.network ?? []).map(({ origin }) => [origin, false]))
}

/**
 * 判断给定权限是否已在当前审查 Manifest 的 required 或 optional 集合中声明，拒绝 UI 外部注入的授权。
 */
function isDeclaredPermission(review: CustomComponentPackageReview, permission: WidgetPermission): boolean {
  const permissions = review.manifest.permissions
  return (permissions?.required ?? []).includes(permission)
    || (permissions?.optional ?? []).includes(permission)
}

/**
 * 计算审查包的全部 required 权限是否已获批准；optional 拒绝不会阻止安装。
 */
function areRequiredPermissionsGranted(
  review: CustomComponentPackageReview,
  grants: Partial<Record<WidgetPermission, boolean>>,
): boolean {
  return (review.manifest.permissions?.required ?? []).every((permission) => grants[permission] === true)
}

/**
 * 计算 Manifest 声明的全部必需网络来源是否已经获准，避免仅确认待办权限就绕过联网确认。
 */
function areRequiredNetworkOriginsGranted(
  review: CustomComponentPackageReview,
  grants: Readonly<Record<string, boolean>>,
): boolean {
  return (review.manifest.network ?? []).every((network) => !network.required || grants[network.origin] === true)
}

/**
 * 按 Manifest 声明顺序收集本次会被持久化的授权，避免未声明权限因陈旧 UI 状态进入 Repository。
 */
function collectGrantedPermissions(
  review: CustomComponentPackageReview,
  grants: Partial<Record<WidgetPermission, boolean>>,
): readonly WidgetPermission[] {
  return [...(review.manifest.permissions?.required ?? []), ...(review.manifest.permissions?.optional ?? [])]
    .filter((permission) => grants[permission] === true)
}

/**
 * 按 Manifest 原有顺序收集本次获准的网络来源，禁止陈旧 UI 状态把未声明来源写入组件目录。
 */
function collectGrantedNetworkOrigins(
  review: CustomComponentPackageReview,
  grants: Readonly<Record<string, boolean>>,
): readonly string[] {
  return (review.manifest.network ?? [])
    .filter((network) => grants[network.origin] === true)
    .map((network) => network.origin)
}

/**
 * 自定义组件 Store 门面：只编排 UI 可观察状态与 Repository 调用，组件不得自行读取 IndexedDB 或解析 ZIP。
 */
export const useCustomComponentStore = defineStore('custom-components', () => {
  const installedComponents = ref<readonly InstalledComponentRecord[]>([])
  const installedCatalog = ref<readonly InstalledCustomComponentCatalogEntry[]>([])
  const installedComponentsLoaded = ref(false)
  const parsingStatus = ref<CustomComponentParsingStatus>('idle')
  const parsingSourceName = ref<string>()
  const parsingErrorCode = ref<string>()
  const parsingErrorPath = ref<string>()
  const review = ref<CustomComponentPackageReview>()
  const permissionGrants = ref<Partial<Record<WidgetPermission, boolean>>>({})
  const networkGrants = ref<Record<string, boolean>>({})
  const updateDiff = ref<ComponentUpdateGrantDiff>()
  const updateState = ref<CustomComponentUpdateState>({ status: 'idle' })

  const canInstallReview = computed(() => review.value
    ? areRequiredPermissionsGranted(review.value, permissionGrants.value)
      && areRequiredNetworkOriginsGranted(review.value, networkGrants.value)
      && review.value.signatureVerification.status !== 'invalid'
      && review.value.signatureVerification.status !== 'publisher-key-changed'
    : false)

  let refreshPromise: Promise<void> | undefined
  const uninstall = createCustomComponentUninstallActions({ refreshInstalledComponents })

  /**
   * 从 Repository 刷新已安装目录；列表只含安全目录元数据，不包含 HTML、Blob、私有数据或权限确认中的临时内容。
   */
  async function refreshInstalledComponents(): Promise<void> {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      const components = await listInstalledComponents()
      const catalog = await Promise.all(components.map(async (component) => {
        const activeVersion = await getActiveComponentVersion(component.componentId)
        return activeVersion ? { component, manifest: activeVersion.manifest } : undefined
      }))
      installedComponents.value = components
      installedCatalog.value = catalog.filter((entry): entry is InstalledCustomComponentCatalogEntry => entry !== undefined)
      installedComponentsLoaded.value = true
    })().finally(() => {
      refreshPromise = undefined
    })
    return refreshPromise
  }

  /**
   * 在主屏占位或组件商店首次需要目录时按需恢复中断的 staged 更新再加载目录，避免每个自定义图块单独读取 IndexedDB 或让旧暂存包跨会话残留。
   */
  async function ensureInstalledComponentsLoaded(): Promise<void> {
    if (installedComponentsLoaded.value) return
    await cleanupInterruptedComponentUpdates()
    await refreshInstalledComponents()
  }

  /**
   * 从活动已验证包读取一个静态素材并创建短生命周期 Blob URL。
   *
   * 组件只能传入 Manifest 已声明的 assets 路径；surface HTML、任意版本与第三方 URL 都不会
   * 经过此入口。调用方负责在卸载或替换图片时 revokeObjectURL，避免商店/选择器泄漏内存。
   */
  async function createStaticAssetUrl(componentId: string, path: string): Promise<string | undefined> {
    if (!componentId || !/^assets\/[A-Za-z0-9._/-]+$/.test(path)) return undefined
    const file = await readActiveComponentFile(componentId, path).catch(() => undefined)
    if (!file || !(file.content instanceof Blob) || typeof URL.createObjectURL !== 'function') return undefined
    return URL.createObjectURL(file.content)
  }

  /**
   * 进入可取消的解析状态并清除上一个包的临时审查结果，文件 Worker 完成后必须调用 completePackageReview 或 failPackageParsing。
   */
  function startPackageParsing(sourceName: string): void {
    parsingStatus.value = 'parsing'
    parsingSourceName.value = sourceName
    parsingErrorCode.value = undefined
    parsingErrorPath.value = undefined
    review.value = undefined
    permissionGrants.value = {}
    networkGrants.value = {}
  }

  /**
   * 接收 Worker 已完成结构、Manifest、素材、完整性和签名校验后的静态审查快照，绝不在 Store 内执行 package surface。
   */
  function completePackageReview(nextReview: CustomComponentPackageReview): void {
    review.value = nextReview
    permissionGrants.value = createPermissionGrants(nextReview)
    networkGrants.value = createNetworkGrants(nextReview)
    const installed = installedCatalog.value.find((item) => item.component.componentId === nextReview.manifest.id)
    if (installed && decideComponentUpdate(installed.component, nextReview.manifest).kind === 'update') {
      const updateGrantReview = createComponentUpdateGrantReview(installed.component, installed.manifest, nextReview.manifest)
      permissionGrants.value = { ...updateGrantReview.permissionGrants }
      networkGrants.value = { ...updateGrantReview.networkGrants }
      updateDiff.value = updateGrantReview
    } else {
      updateDiff.value = undefined
    }
    updateState.value = { status: 'idle' }
    parsingStatus.value = 'review'
    parsingErrorCode.value = undefined
    parsingErrorPath.value = undefined
  }

  /**
   * 记录安全解析错误码并丢弃临时包内容，避免失败 ZIP 的正文、HTML 或二进制资产在 UI 状态中残留。
   */
  function failPackageParsing(errorCode: string, errorPath?: string): void {
    review.value = undefined
    permissionGrants.value = {}
    networkGrants.value = {}
    parsingStatus.value = 'error'
    parsingErrorCode.value = errorCode
    parsingErrorPath.value = errorPath
  }

  /**
   * 取消当前解析或审查，恢复空闲状态且不触碰已安装目录、实例引用或已有权限数据。
   */
  function cancelPackageParsing(): void {
    review.value = undefined
    permissionGrants.value = {}
    networkGrants.value = {}
    parsingStatus.value = 'idle'
    parsingSourceName.value = undefined
    parsingErrorCode.value = undefined
    parsingErrorPath.value = undefined
    updateState.value = { status: 'idle' }
    updateDiff.value = undefined
  }

  /**
   * 对当前审查包的已声明权限记录用户决定；未声明权限一律返回 false，不得由 UI 越权写入授权集合。
   */
  function setPermissionGrant(permission: WidgetPermission, granted: boolean): boolean {
    if (!review.value || !isDeclaredPermission(review.value, permission)) return false
    permissionGrants.value = { ...permissionGrants.value, [permission]: granted }
    return true
  }

  /**
   * 对当前审查包的已声明网络来源记录用户决定；非精确声明的来源一律不能进入授权快照。
   */
  function setNetworkGrant(network: WidgetNetworkDeclaration, granted: boolean): boolean {
    if (!review.value || !(review.value.manifest.network ?? []).some(({ origin }) => origin === network.origin)) return false
    networkGrants.value = { ...networkGrants.value, [network.origin]: granted }
    return true
  }

  /**
   * 在组件商店复选框的用户手势中同步扩展 host permission，再写入审查授权状态。
   *
   * 网页版只记录用户确认；扩展版的浏览器气泡拒绝、API 缺失或撤销失败都会保持原授权，
   * 从而不会把 Pinia 勾选状态误当成 Chrome 已授予来源。
   */
  async function confirmNetworkGrant(network: WidgetNetworkDeclaration, granted: boolean): Promise<boolean> {
    if (!review.value || !(review.value.manifest.network ?? []).some(({ origin }) => origin === network.origin)) return false
    if (detectRuntimeEnvironment() === 'extension') {
      const browserResult = granted
        ? await requestMv3OriginPermission(network.origin)
        : await removeMv3OriginPermission(network.origin)
      if (!browserResult) return false
    }
    return setNetworkGrant(network, granted)
  }

  /** 验证扩展端已获准的审查来源仍由 Chrome 持有，防止用户在安装前刚撤销授权仍写入 Repository。 */
  async function verifyMv3NetworkGrants(review: CustomComponentPackageReview): Promise<boolean> {
    if (detectRuntimeEnvironment() !== 'extension') return true
    const origins = collectGrantedNetworkOrigins(review, networkGrants.value)
    const granted = await Promise.all(origins.map((origin) => containsMv3OriginPermission(origin as `https://${string}`)))
    return granted.every(Boolean)
  }

  /**
   * 先按同组件身份与 SemVer 分流到首次安装或更新确认；仅首次安装在必需授权确认后写 Repository，提交成功前不修改已安装目录。
   */
  async function installReviewedPackage(options: {
    readonly instanceIds?: readonly string[]
    readonly runtime?: ComponentUpdateRuntime
  } = {}): Promise<'installed' | 'updated' | 'awaiting-update' | undefined> {
    const packageReview = review.value ? toRaw(review.value) : undefined
    if (!packageReview) return
    if (packageReview.signatureVerification.status === 'invalid' || packageReview.signatureVerification.status === 'publisher-key-changed') {
      throw new CustomComponentStoreError(
        'SIGNATURE_NOT_INSTALLABLE',
        '签名状态不允许安装组件。',
        packageReview.manifest.id,
      )
    }

    const installedComponent = await getInstalledComponent(packageReview.manifest.id)
    const updateDecision = decideComponentUpdate(installedComponent, packageReview.manifest)
    if (updateDecision.kind === 'reject') {
      const errorCode: CustomComponentStoreErrorCode = updateDecision.code === 'COMPONENT_ID_MISMATCH'
        ? 'UPDATE_VERSION_INVALID'
        : updateDecision.code
      throw new CustomComponentStoreError(
        errorCode,
        '导入版本不能覆盖当前组件。',
        packageReview.manifest.id,
      )
    }
    if (updateDecision.kind === 'update') {
      const activeVersion = await getActiveComponentVersion(packageReview.manifest.id)
      if (!activeVersion) {
        throw new CustomComponentStoreError('UPDATE_EXECUTION_FAILED', '当前组件活动版本不可用。', packageReview.manifest.id)
      }
      if (updateState.value.status !== 'awaiting-confirmation'
        || updateState.value.componentId !== updateDecision.componentId
        || updateState.value.incomingVersion !== updateDecision.incomingVersion) {
        const updateGrantReview = createComponentUpdateGrantReview(installedComponent!, activeVersion.manifest, packageReview.manifest)
        permissionGrants.value = { ...updateGrantReview.permissionGrants }
        networkGrants.value = { ...updateGrantReview.networkGrants }
        updateDiff.value = updateGrantReview
        beginUpdateConfirmation(updateDecision.componentId, updateDecision.incomingVersion, updateGrantReview)
        return 'awaiting-update'
      }
      if (!areRequiredPermissionsGranted(packageReview, permissionGrants.value)
        || !areRequiredNetworkOriginsGranted(packageReview, networkGrants.value)) {
        throw new CustomComponentStoreError(
          'REQUIRED_PERMISSION_NOT_GRANTED',
          '新增必需能力尚未全部获准，不能更新组件。',
          packageReview.manifest.id,
        )
      }
      if (!await verifyMv3NetworkGrants(packageReview)) {
        throw new CustomComponentStoreError(
          'REQUIRED_PERMISSION_NOT_GRANTED',
          '浏览器网络来源授权已撤销，不能更新组件。',
          packageReview.manifest.id,
        )
      }
      parsingStatus.value = 'installing'
      try {
        await executeComponentUpdate({
          updateId: createComponentUpdateId(packageReview.manifest.id),
          manifest: packageReview.manifest,
          integrity: packageReview.integrity,
          ...(packageReview.signature ? { signature: packageReview.signature } : {}),
          files: packageReview.files,
          grantedPermissions: collectGrantedPermissions(packageReview, permissionGrants.value),
          grantedNetworkOrigins: collectGrantedNetworkOrigins(packageReview, networkGrants.value),
          instanceIds: options.instanceIds ?? [],
        }, { runtime: options.runtime ?? getCustomComponentRuntime() })
        await refreshInstalledComponents()
        cancelPackageParsing()
        return 'updated'
      } catch (error) {
        parsingStatus.value = 'review'
        parsingErrorCode.value = error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'UPDATE_EXECUTION_FAILED'
        throw error
      }
    }

    if (!areRequiredPermissionsGranted(packageReview, permissionGrants.value)) {
      throw new CustomComponentStoreError(
        'REQUIRED_PERMISSION_NOT_GRANTED',
        '必须权限尚未全部获准，不能安装组件。',
        packageReview.manifest.id,
      )
    }
    if (!areRequiredNetworkOriginsGranted(packageReview, networkGrants.value)) {
      throw new CustomComponentStoreError(
        'REQUIRED_PERMISSION_NOT_GRANTED',
        '必须网络来源尚未全部获准，不能安装组件。',
        packageReview.manifest.id,
      )
    }
    if (!await verifyMv3NetworkGrants(packageReview)) {
      throw new CustomComponentStoreError(
        'REQUIRED_PERMISSION_NOT_GRANTED',
        '浏览器网络来源授权已撤销，不能安装组件。',
        packageReview.manifest.id,
      )
    }
    parsingStatus.value = 'installing'
    try {
      await installComponentPackage({
        manifest: packageReview.manifest,
        integrity: packageReview.integrity,
        ...(packageReview.signature ? { signature: packageReview.signature } : {}),
        grantedPermissions: collectGrantedPermissions(packageReview, permissionGrants.value),
        grantedNetworkOrigins: collectGrantedNetworkOrigins(packageReview, networkGrants.value),
        files: packageReview.files,
      })
      await refreshInstalledComponents()
      cancelPackageParsing()
      return 'installed'
    } catch (error) {
      parsingStatus.value = 'review'
      parsingErrorCode.value = error instanceof CustomComponentStoreError || error instanceof Error
        ? (error as ComponentPackageRepositoryError | CustomComponentStoreError).code ?? 'INSTALL_FAILED'
        : 'INSTALL_FAILED'
      throw error
    }
  }

  /**
   * 标记一个已通过静态审查的同组件新版本等待更新确认；真实 staged 包、迁移和回滚由更新服务接管。
   */
  function beginUpdateConfirmation(
    componentId: string,
    incomingVersion: string,
    diff: ComponentUpdateGrantDiff = { newPermissions: [], newNetworkOrigins: [] },
  ): void {
    updateState.value = { status: 'awaiting-confirmation', componentId, incomingVersion, diff }
  }

  /**
   * 清除更新确认状态，不对 Repository 执行写操作，因而拒绝更新始终保持当前活动版本和授权。
   */
  function cancelUpdateConfirmation(): void {
    updateState.value = { status: 'idle' }
  }

  /** 读取实例脱敏健康摘要，供占位与管理 UI 展示停用原因而不暴露私有数据。 */
  async function getInstanceRuntimeHealth(componentId: string, instanceId: string): Promise<RuntimeHealthRecord | undefined> {
    return getRuntimeHealth(componentId, instanceId).catch(() => undefined)
  }

  /**
   * 用户手动重新启用前清除连续失败计数。
   *
   * 删除成功才允许调用方移除 launcher disabled 标记，避免健康记录清理失败后立刻重启一个仍应隔离的实例。
   */
  async function resetInstanceRuntimeHealth(componentId: string, instanceId: string): Promise<boolean> {
    try {
      await clearRuntimeHealth(componentId, instanceId)
      return true
    } catch {
      return false
    }
  }

  return {
    installedComponents,
    installedCatalog,
    installedComponentsLoaded,
    parsingStatus,
    parsingSourceName,
    parsingErrorCode,
    parsingErrorPath,
    review,
    permissionGrants,
    networkGrants,
    canInstallReview,
    updateState,
    updateDiff,
    ...uninstall,
    refreshInstalledComponents,
    ensureInstalledComponentsLoaded,
    createStaticAssetUrl,
    startPackageParsing,
    completePackageReview,
    failPackageParsing,
    cancelPackageParsing,
    setPermissionGrant,
    setNetworkGrant,
    confirmNetworkGrant,
    installReviewedPackage,
    beginUpdateConfirmation,
    cancelUpdateConfirmation,
    getInstanceRuntimeHealth,
    resetInstanceRuntimeHealth,
  }
})
