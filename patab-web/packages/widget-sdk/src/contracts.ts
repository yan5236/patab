/**
 * 重新导出已稳定的 SDK 元数据和 Manifest 契约；RPC DTO 仍由独立任务补充，避免提前固定未审查的接口。
 */
export { WIDGET_ERROR_CODES } from './errors.js'
export type { WidgetApiError, WidgetErrorCode } from './errors.js'
export {
  WIDGET_PERMISSIONS,
  WIDGET_TODO_PERMISSIONS,
  validateWidgetPermissionDeclarations,
} from './permissions.js'
export type { WidgetPermission, WidgetPermissionDeclarations } from './permissions.js'
export type {
  LocalizedText,
  PatabWidgetManifestV1,
  SurfaceEntryPath,
  WidgetAssetPath,
  WidgetAssets,
  WidgetModalSize,
  WidgetNetworkDeclaration,
  WidgetPublisher,
  WidgetSurfaceDeclaration,
  WidgetSurfaceDeclarations,
  WidgetTileSize,
  WidgetVariantDeclaration,
} from './manifest.js'
export {
  WIDGET_NETWORK_CONCURRENCY_MAX,
  WIDGET_NETWORK_FORBIDDEN_REQUEST_HEADER_NAMES,
  WIDGET_NETWORK_HEADER_COUNT_MAX,
  WIDGET_NETWORK_HEADER_NAME_MAX_LENGTH,
  WIDGET_NETWORK_HEADER_VALUE_MAX_BYTES,
  WIDGET_NETWORK_HTTP_METHODS,
  WIDGET_NETWORK_REQUEST_BODY_MAX_BYTES,
  WIDGET_NETWORK_RESPONSE_BODY_MAX_BYTES,
  WIDGET_NETWORK_RESPONSE_HEADER_ALLOWLIST,
  WIDGET_NETWORK_TIMEOUT_MS,
  WIDGET_NETWORK_URL_MAX_LENGTH,
  validateWidgetNetworkRequest,
  validateWidgetNetworkResponse,
} from './network.js'
export type {
  WidgetNetworkHeaders,
  WidgetNetworkHttpMethod,
  WidgetNetworkRequest,
  WidgetNetworkResponse,
} from './network.js'
export { WIDGET_RPC_API_VERSION, WIDGET_RPC_PROTOCOL, evaluateWidgetApiCompatibility } from './rpc.js'
export type {
  WidgetApiCompatibility,
  WidgetContext,
  WidgetChannelMessageEvent,
  WidgetChannelPublishParams,
  WidgetConfirmParams,
  WidgetConfirmResult,
  WidgetEvent,
  WidgetEventName,
  WidgetFailureResponse,
  WidgetJsonValue,
  WidgetLocaleChangedEvent,
  WidgetOpenExternalParams,
  WidgetOpenExternalResult,
  WidgetOpenSurfaceParams,
  WidgetOpenVariantPickerParams,
  WidgetPermissionSnapshot,
  WidgetRequest,
  WidgetResponse,
  WidgetSizeChangedEvent,
  WidgetStorageChangedEvent,
  WidgetStorageGetParams,
  WidgetStorageGetResult,
  WidgetStorageRemoveParams,
  WidgetStorageRemoveResult,
  WidgetStorageSetParams,
  WidgetSuccessResponse,
  WidgetThemeChangedEvent,
  WidgetThemeTokenName,
  WidgetThemeTokens,
  WidgetToastParams,
  WidgetVariantChangedEvent,
  WidgetVisibilityChangedEvent,
} from './rpc.js'
export {
  WIDGET_TODO_CURSOR_MAX_LENGTH,
  WIDGET_TODO_ID_MAX_LENGTH,
  WIDGET_TODO_PAGE_LIMIT_MAX,
  WIDGET_TODO_TEXT_MAX_LENGTH,
  validateWidgetTodoCreateInput,
  validateWidgetTodoDeleteInput,
  validateWidgetTodoListRequest,
  validateWidgetTodoUpdateInput,
} from './todos.js'
export type {
  WidgetTodo,
  WidgetTodoChangedEvent,
  WidgetTodoCreateInput,
  WidgetTodoDeleteInput,
  WidgetTodoListRequest,
  WidgetTodoListResponse,
  WidgetTodoUpdateInput,
} from './todos.js'
export type { WidgetSdkApiVersion, WidgetSdkMetadata } from './types.js'
export {
  createWidgetContractValidationFailure,
  createWidgetContractValidationSuccess,
} from './validation.js'
export type {
  WidgetContractValidationFailure,
  WidgetContractValidationResult,
  WidgetContractValidationSuccess,
} from './validation.js'
