import {
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  type WidgetContext,
} from '@patab/widget-sdk'

import { createWidgetContextCapability } from '@/custom-components/capabilities/context'
import { createWidgetStorageBrokerMethods } from '@/custom-components/capabilities/storage'
import {
  getStagedInstanceStorageValue,
  listStagedInstanceStorageKeys,
  removeStagedInstanceStorageValue,
  setStagedInstanceStorageValue,
} from '@/custom-components/updates/stagedInstanceStorageRepository'
import {
  getInstalledComponent,
  type InstalledComponentFileRecord,
  type InstalledComponentVersionRecord,
} from '@/custom-components/repository/componentPackageRepository'
import {
  CUSTOM_COMPONENT_STORE_FILES,
  CUSTOM_COMPONENT_STORE_VERSIONS,
  openCustomComponentDatabase,
} from '@/custom-components/repository/customComponentDatabase'

import {
  WidgetCapabilityBroker,
  type WidgetBrokerDiagnostic,
  type WidgetBrokerMethod,
  type WidgetBrokerSession,
  type WidgetPermissionSource,
} from './capabilityBroker'
import { type SandboxAdapter, type SandboxMountHandle } from './sandboxAdapter'
import { SandboxAdapterError } from './protocol'
import { prepareSandboxSurfaceHtml } from './surfaceHtml'
import { createWidgetThemeStyle, getWidgetThemeTokens } from './widgetTheme'

/** staged migration 与健康检查共享的固定总时限。 */
export const STAGED_SANDBOX_TIMEOUT_MS = 5_000

/** 受限 staged surface 的启动输入；版本和 updateId 都由更新服务固定，第三方不能通过 RPC 篡改。 */
export interface StartStagedSandboxSurfaceRequest {
  readonly componentId: string
  readonly instanceId: string
  readonly updateId: string
  readonly surface: 'migration' | 'widget'
  readonly container: HTMLElement
  readonly oldVersion: string
}

/** staged 临时 surface 的最小销毁句柄；不会进入页面 Runtime 活跃 session 集合。 */
export interface StagedSandboxRuntimeHandle {
  readonly frameElement: HTMLIFrameElement
  destroy(): void
}

/** staged sandbox 的安全失败码；上层统一映射为既有 Runtime 公开错误。 */
export class StagedSandboxRuntimeError extends Error {
  /** 创建不携带 HTML、端口、DOMException 或私有 storage 的暂存启动失败。 */
  constructor(readonly code: 'INSTANCE_DISABLED' | 'SURFACE_NOT_DECLARED' | 'TIMEOUT') {
    super('组件更新暂存环境无法启动。')
    this.name = 'StagedSandboxRuntimeError'
  }
}

/** 运行时传入的唯一适配器与可观察诊断，不重复创建 Broker 会话协议。 */
export interface StagedSandboxRunnerOptions {
  readonly adapter: SandboxAdapter
  readonly createSessionToken: () => string
  readonly onDiagnostic?: (diagnostic: WidgetBrokerDiagnostic) => void
}

/** staged session 的权限源恒为拒绝；受限 surface 方法表也不会注册 UI/todos/network/channel/external。 */
const deniedPermissionSource: WidgetPermissionSource = {
  hasPermission: async () => false,
  hasNetworkOrigin: async () => false,
}

/** 读取文档可公开的最小上下文；暂存运行不订阅生命周期，防止临时 iframe 留下全局监听。 */
function readStagedContextDefaults(): Pick<WidgetContext, 'locale' | 'theme' | 'reducedMotion' | 'visible'> {
  const root = globalThis.document?.documentElement
  return {
    locale: root?.lang === 'en-US' ? 'en-US' : 'zh-CN',
    theme: root?.dataset.theme === 'dark' ? 'dark' : 'light',
    reducedMotion: globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    visible: true,
  }
}

/** 读取指定 updateId 对应的 staged 版本与静态 surface 文件，绝不从活动版本路径回退。 */
async function readStagedSurface(
  componentId: string,
  updateId: string,
  surface: 'migration' | 'widget',
): Promise<{ readonly version: InstalledComponentVersionRecord; readonly file: InstalledComponentFileRecord } | undefined> {
  const database = await openCustomComponentDatabase()
  let version: InstalledComponentVersionRecord | undefined
  try {
    const transaction = database.transaction(CUSTOM_COMPONENT_STORE_VERSIONS, 'readonly')
    version = await new Promise<InstalledComponentVersionRecord | undefined>((resolve, reject) => {
      const request = transaction.objectStore(CUSTOM_COMPONENT_STORE_VERSIONS).getAll(IDBKeyRange.bound([componentId, ''], [componentId, '\uffff']))
      request.onsuccess = () => resolve((request.result as InstalledComponentVersionRecord[])
        .find((record) => record.stagedUpdateId === updateId))
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
  if (!version) return undefined
  const declaration = version.manifest.surfaces[surface]
  if (!declaration) return undefined
  const fileDatabase = await openCustomComponentDatabase()
  try {
    const transaction = fileDatabase.transaction(CUSTOM_COMPONENT_STORE_FILES, 'readonly')
    const file = await new Promise<InstalledComponentFileRecord | undefined>((resolve, reject) => {
      const request = transaction.objectStore(CUSTOM_COMPONENT_STORE_FILES).get([componentId, version.version, declaration.entry])
      request.onsuccess = () => resolve(request.result as InstalledComponentFileRecord | undefined)
      request.onerror = () => reject(request.error)
    })
    return file ? { version, file } : undefined
  } finally {
    fileDatabase.close()
  }
}

/** 创建只绑定到指定 updateId 的 staged storage Broker，调用方不能改写活动 instanceData。 */
function createStagedStorageMethods(updateId: string) {
  return createWidgetStorageBrokerMethods({
    get: (scope, key) => getStagedInstanceStorageValue({ updateId, ...scope }, key),
    keys: (scope) => listStagedInstanceStorageKeys({ updateId, ...scope }),
    set: (scope, key, value) => setStagedInstanceStorageValue({ updateId, ...scope }, key, value),
    remove: (scope, key) => removeStagedInstanceStorageValue({ updateId, ...scope }, key),
  })
}

/** 将 migration 唯一完成信号注册为 Broker 方法；除完成确认外不会开放任何额外能力。 */
function createMigrationMethods(
  resolve: () => void,
  request: StartStagedSandboxSurfaceRequest,
  newVersion: string,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'migration.getContext': {
      validateParams: (params) => params && typeof params === 'object' && !Array.isArray(params) && Object.keys(params).length === 0
        ? undefined
        : { code: 'INVALID_ARGUMENT', message: '迁移上下文参数无效。', path: 'params' },
      invoke: () => ({ oldVersion: request.oldVersion, newVersion, instanceId: request.instanceId }),
    },
    'migration.complete': {
      validateParams: (params) => params && typeof params === 'object' && !Array.isArray(params) && Object.keys(params).length === 0
        ? undefined
        : { code: 'INVALID_ARGUMENT', message: '迁移完成参数无效。', path: 'params' },
      invoke: () => {
        resolve()
        return undefined
      },
    },
  }
}

/** 以不泄露 IDB/浏览器细节的方式等待迁移显式完成，并把超时统一归为固定错误。 */
function waitForMigrationCompletion(remainingMs: number, completion: Promise<void>): Promise<void> {
  if (remainingMs <= 0) return Promise.reject(new StagedSandboxRuntimeError('TIMEOUT'))
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new StagedSandboxRuntimeError('TIMEOUT')), remainingMs)
    void completion.then(() => {
      globalThis.clearTimeout(timer)
      resolve()
    }, () => {
      globalThis.clearTimeout(timer)
      reject(new StagedSandboxRuntimeError('INSTANCE_DISABLED'))
    })
  })
}

/**
 * 启动单次 staged migration 或离屏 widget 健康检查。
 *
 * 此函数复用生产 Adapter、CSP、MessageChannel 和 Broker；区别仅在于读取 staged 文件，
 * 方法表只包含 context/storage（以及 migration 的内部完成信号），所以临时版本没有 UI、
 * todos、network、channel 或外链能力，也不会被登记为活动 Runtime session。
 */
export async function startStagedSandboxSurface(
  request: StartStagedSandboxSurfaceRequest,
  options: StagedSandboxRunnerOptions,
): Promise<StagedSandboxRuntimeHandle> {
  if (!request.componentId || !request.instanceId || !request.updateId || !request.oldVersion) {
    throw new StagedSandboxRuntimeError('INSTANCE_DISABLED')
  }
  const startedAt = Date.now()
  const [component, staged] = await Promise.all([
    getInstalledComponent(request.componentId),
    readStagedSurface(request.componentId, request.updateId, request.surface),
  ])
  if (!component || !staged) {
    throw new StagedSandboxRuntimeError(request.surface === 'migration' ? 'SURFACE_NOT_DECLARED' : 'INSTANCE_DISABLED')
  }
  if (component.activeVersion !== request.oldVersion || staged.version.replacesVersion !== request.oldVersion || typeof staged.file.content !== 'string') {
    throw new StagedSandboxRuntimeError('INSTANCE_DISABLED')
  }

  const session: WidgetBrokerSession = {
    componentId: request.componentId,
    componentVersion: staged.version.version,
    instanceId: request.instanceId,
    sessionId: options.createSessionToken(),
  }
  const defaults = readStagedContextDefaults()
  const context = createWidgetContextCapability({
    componentId: session.componentId,
    instanceId: session.instanceId,
    componentVersion: session.componentVersion,
    apiVersion: WIDGET_RPC_API_VERSION,
    surface: request.surface,
    size: { ...staged.version.manifest.defaultSize },
    ...(staged.version.manifest.defaultVariant ? { variantId: staged.version.manifest.defaultVariant } : {}),
    ...defaults,
    permissions: { granted: [], networkOrigins: [] },
  })
  let preparedHtml: string
  try {
    preparedHtml = prepareSandboxSurfaceHtml(staged.file.content, { hostThemeStyle: createWidgetThemeStyle(getWidgetThemeTokens()) })
  } catch {
    throw new StagedSandboxRuntimeError('INSTANCE_DISABLED')
  }

  let mountHandle: SandboxMountHandle
  try {
    const remainingHandshakeMs = STAGED_SANDBOX_TIMEOUT_MS - (Date.now() - startedAt)
    if (remainingHandshakeMs <= 0) throw new StagedSandboxRuntimeError('TIMEOUT')
    mountHandle = await options.adapter.mount({
      container: request.container,
      surfaceHtml: preparedHtml,
      sessionToken: session.sessionId,
      handshakeTimeoutMs: remainingHandshakeMs,
    })
  } catch (error) {
    if (error instanceof SandboxAdapterError && error.code === 'handshake-timeout') throw new StagedSandboxRuntimeError('TIMEOUT')
    throw new StagedSandboxRuntimeError('INSTANCE_DISABLED')
  }

  let broker: WidgetCapabilityBroker | undefined
  let destroyed = false
  const handle: StagedSandboxRuntimeHandle = {
    frameElement: mountHandle.frameElement,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      broker?.destroy()
      mountHandle.destroy()
    },
  }
  let completeMigration: (() => void) | undefined
  const migrationCompletion = request.surface === 'migration'
    ? new Promise<void>((resolve) => { completeMigration = resolve })
    : undefined
  broker = new WidgetCapabilityBroker({
    port: mountHandle.port,
    session,
    permissions: deniedPermissionSource,
    methods: {
      ...context.methods,
      ...createStagedStorageMethods(request.updateId),
      ...(completeMigration ? createMigrationMethods(completeMigration, request, staged.version.version) : {}),
    },
    onDiagnostic: options.onDiagnostic,
    onFlood: handle.destroy,
  })
  if (migrationCompletion) {
    try {
      await waitForMigrationCompletion(STAGED_SANDBOX_TIMEOUT_MS - (Date.now() - startedAt), migrationCompletion)
    } catch (error) {
      handle.destroy()
      throw error
    }
  }
  return handle
}
