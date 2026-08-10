/** 自定义组件 IndexedDB 的固定数据库名称，避免与现有轻量 launcher 状态混用。 */
export const CUSTOM_COMPONENT_DATABASE_NAME = 'patab-custom-components'

/** 开发会话 ID 的安全边界，数据库名不得包含路径、控制字符或任意用户文本。 */
const DEV_DATABASE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

let customComponentDatabaseName = CUSTOM_COMPONENT_DATABASE_NAME
let customComponentDatabaseNameLocked = false

/** 为真实 PaTab 开发宿主生成会话隔离的 IndexedDB 名称。 */
export function createCustomComponentDevDatabaseName(sessionId: string): string {
  if (!DEV_DATABASE_SESSION_ID_PATTERN.test(sessionId)) throw new Error('开发会话 ID 无效')
  return `patab-widget-dev-components:${sessionId}`
}

/**
 * 在任何 Repository 打开连接前配置一次开发数据库名。
 *
 * 已打开或已配置后拒绝切换，避免一个页面中的事务跨两个组件仓库产生不一致状态。
 */
export function configureCustomComponentDevDatabase(sessionId: string): void {
  if (customComponentDatabaseNameLocked || customComponentDatabaseName !== CUSTOM_COMPONENT_DATABASE_NAME) {
    throw new Error('自定义组件数据库环境已经初始化')
  }
  customComponentDatabaseName = createCustomComponentDevDatabaseName(sessionId)
}

/** 自定义组件 IndexedDB 当前唯一已发布的 Schema 版本。 */
export const CUSTOM_COMPONENT_DATABASE_VERSION = 1

/** v1 的组件元数据表名。 */
export const CUSTOM_COMPONENT_STORE_COMPONENTS = 'components'

/** v1 的组件版本元数据表名。 */
export const CUSTOM_COMPONENT_STORE_VERSIONS = 'versions'

/** v1 的已验证包文件表名。 */
export const CUSTOM_COMPONENT_STORE_FILES = 'files'

/** v1 的活动实例私有数据表名。 */
export const CUSTOM_COMPONENT_STORE_INSTANCE_DATA = 'instanceData'

/** v1 的升级暂存实例数据表名。 */
export const CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA = 'stagedInstanceData'

/** v1 的实例运行健康记录表名。 */
export const CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH = 'runtimeHealth'

/** 自定义组件 v1 全部 Object Store 的名字联合类型。 */
export type CustomComponentStoreName =
  | typeof CUSTOM_COMPONENT_STORE_COMPONENTS
  | typeof CUSTOM_COMPONENT_STORE_VERSIONS
  | typeof CUSTOM_COMPONENT_STORE_FILES
  | typeof CUSTOM_COMPONENT_STORE_INSTANCE_DATA
  | typeof CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA
  | typeof CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH

/** 每个 v1 Object Store 的主键路径，供建表与契约测试共用，避免两处定义漂移。 */
export const CUSTOM_COMPONENT_STORE_KEY_PATHS: Readonly<Record<CustomComponentStoreName, string | readonly string[]>> = {
  [CUSTOM_COMPONENT_STORE_COMPONENTS]: 'componentId',
  [CUSTOM_COMPONENT_STORE_VERSIONS]: ['componentId', 'version'],
  [CUSTOM_COMPONENT_STORE_FILES]: ['componentId', 'version', 'path'],
  [CUSTOM_COMPONENT_STORE_INSTANCE_DATA]: ['componentId', 'instanceId', 'key'],
  [CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA]: ['updateId', 'instanceId', 'key'],
  [CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH]: ['componentId', 'instanceId'],
}

/** 单个 Object Store 的最小建表描述，不承载任何 Repository 读写职责。 */
interface CustomComponentStoreDefinition {
  readonly name: CustomComponentStoreName
  readonly keyPath: string | readonly string[]
}

/** v1 固定建表清单；后续版本只能在升级事务内追加或迁移。 */
export const CUSTOM_COMPONENT_STORE_DEFINITIONS: readonly CustomComponentStoreDefinition[] = [
  { name: CUSTOM_COMPONENT_STORE_COMPONENTS, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.components },
  { name: CUSTOM_COMPONENT_STORE_VERSIONS, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.versions },
  { name: CUSTOM_COMPONENT_STORE_FILES, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.files },
  { name: CUSTOM_COMPONENT_STORE_INSTANCE_DATA, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.instanceData },
  { name: CUSTOM_COMPONENT_STORE_STAGED_INSTANCE_DATA, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.stagedInstanceData },
  { name: CUSTOM_COMPONENT_STORE_RUNTIME_HEALTH, keyPath: CUSTOM_COMPONENT_STORE_KEY_PATHS.runtimeHealth },
]

/**
 * 取得浏览器原生 IndexedDB 工厂；服务端或不支持 IndexedDB 的环境必须显式失败，不能静默改用内存存储。
 */
function getDefaultDatabaseFactory(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw new Error('当前运行环境不支持 IndexedDB')
  }

  return indexedDB
}

/**
 * 在升级事务中创建 v1 缺失的 Object Store；通过存在性检查使同版本恢复性打开不会重复建表。
 */
export function upgradeCustomComponentDatabase(database: IDBDatabase): void {
  for (const definition of CUSTOM_COMPONENT_STORE_DEFINITIONS) {
    if (database.objectStoreNames.contains(definition.name)) {
      continue
    }

    database.createObjectStore(definition.name, {
      keyPath: typeof definition.keyPath === 'string' ? definition.keyPath : [...definition.keyPath],
    })
  }
}

/**
 * 注册版本变化时的关闭行为，避免旧页面长期持有连接而阻塞后续 Schema 升级。
 */
function closeDatabaseOnVersionChange(database: IDBDatabase): void {
  database.addEventListener('versionchange', () => {
    database.close()
  }, { once: true })
}

/**
 * 打开或初始化固定的 v1 Schema；调用方只获得已建表的连接，不在此层执行组件、文件或实例数据操作。
 */
export function openCustomComponentDatabase(
  databaseFactory: IDBFactory = getDefaultDatabaseFactory(),
): Promise<IDBDatabase> {
  customComponentDatabaseNameLocked = true
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    let settled = false

    /** 只结算一次失败结果，blocked 之后即使浏览器最终打开连接也必须立即关闭该连接。 */
    const rejectOnce = (reason: unknown) => {
      if (settled) {
        return
      }

      settled = true
      reject(reason)
    }

    try {
      request = databaseFactory.open(customComponentDatabaseName, CUSTOM_COMPONENT_DATABASE_VERSION)
    } catch (error) {
      rejectOnce(error)
      return
    }

    request.onupgradeneeded = () => {
      upgradeCustomComponentDatabase(request.result)
    }

    request.onblocked = () => {
      rejectOnce(new Error('自定义组件数据库升级被现有连接阻塞'))
    }

    request.onerror = () => {
      rejectOnce(request.error ?? new Error('自定义组件数据库打开失败'))
    }

    request.onsuccess = () => {
      const database = request.result
      closeDatabaseOnVersionChange(database)

      if (settled) {
        database.close()
        return
      }

      settled = true
      resolve(database)
    }
  })
}
