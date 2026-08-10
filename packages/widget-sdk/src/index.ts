import type { WidgetSdkMetadata } from './types.js'

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
export { validatePatabWidgetManifestV1 } from './manifestValidation.js'
export type {
  WidgetManifestValidationFailure,
  WidgetManifestValidationResult,
  WidgetManifestValidationSuccess,
} from './manifestValidation.js'
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
export { WidgetApiRequestError, WidgetClient, WidgetClientError, connectPatabWidgetClient } from './client.js'
export type { WidgetClientConnectOptions, WidgetClientErrorCode, WidgetClientOptions } from './client.js'
export { createWidgetApi, onWidgetThemeChanged } from './api.js'
export type {
  WidgetApi,
  WidgetChannelApi,
  WidgetNetworkApi,
  WidgetPermissionSet,
  WidgetStorageApi,
  WidgetTodosApi,
  WidgetUiApi,
} from './api.js'
export { createWidgetMockError, createWidgetMockHost } from './testing.js'
export type { WidgetMockHost, WidgetMockNetworkHandler, WidgetMockOptions } from './testing.js'
export {
  WIDGET_DEV_HOST_PROTOCOL_VERSION,
  validateWidgetDevSessionDescriptor,
} from './devHost.js'
export type {
  WidgetDevSessionDescriptor,
  WidgetDevSessionValidationFailure,
  WidgetDevSessionValidationResult,
  WidgetDevSessionValidationSuccess,
} from './devHost.js'
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
  WidgetStorageKeysResult,
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

/**
 * 提供 SDK 自身的固定公开元数据，供开发工具在不接触宿主内部实现的前提下识别兼容 API 主版本。
 */
export const WIDGET_SDK_METADATA: WidgetSdkMetadata = Object.freeze({
  packageName: '@patab/widget-sdk',
  sdkVersion: '1.0.0',
  supportedApiMajor: 1,
})
