/**
 * 统一导出浏览器与 Node 都可使用的 fflate ZIP 原语。
 *
 * 后续中央目录检查、浏览器 Worker、确定性打包与 CLI 都只能从此私有共享包
 * 使用这一套归档库，避免引入第二套 ZIP 实现后产生路径、元数据和错误语义分歧。
 */
export {
  AsyncUnzipInflate,
  Unzip,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
} from 'fflate'

export type {
  UnzipFile,
  UnzipInflate,
  ZipInputFile,
  ZipOptions,
  Zippable,
  ZippableFile,
} from 'fflate'

export {
  DEFAULT_ZIP_CENTRAL_DIRECTORY_LIMITS,
  ZIP_ARCHIVE_MAX_BYTES,
  ZIP_COMPRESSION_RATIO_MAX,
  ZIP_DECLARED_UNCOMPRESSED_MAX_BYTES,
  ZIP_ENTRY_MAX_COUNT,
  ZIP_ENTRY_UNCOMPRESSED_MAX_BYTES,
  ZipCentralDirectoryError,
  inspectZipCentralDirectory,
} from './centralDirectory.js'

export {
  CanonicalJsonError,
  canonicalizeJson,
  canonicalizeJsonToBytes,
} from './canonicalJson.js'

export type {
  CanonicalJsonErrorCode,
  CanonicalJsonPrimitive,
  CanonicalJsonValue,
} from './canonicalJson.js'

export {
  INTEGRITY_DOCUMENT_PATH,
  INTEGRITY_HASH_ALGORITHM,
  INTEGRITY_SCHEMA_VERSION,
  SIGNATURE_DOCUMENT_PATH,
  IntegrityError,
  createIntegrityDocument,
  parseIntegrityDocument,
  serializeIntegrityDocument,
  serializeIntegrityDocumentToBytes,
  sha256Hex,
  verifyIntegrityDocument,
} from './integrity.js'

export type {
  IntegrityErrorCode,
  IntegrityFileContent,
  IntegrityFileDigest,
  WidgetIntegrityDocument,
} from './integrity.js'

export {
  WIDGET_ED25519_SIGNATURE_BYTES,
  WIDGET_SIGNATURE_ALGORITHM,
  WIDGET_SIGNATURE_SCHEMA_VERSION,
  WidgetSignatureError,
  createWidgetSignaturePayload,
  encodeWidgetSignatureBase64,
  parseWidgetSignatureDocument,
  verifyWidgetSignature,
} from './signature.js'

export type {
  WidgetSignatureDocument,
  WidgetSignatureErrorCode,
  WidgetSignatureVerification,
  WidgetSignatureVerificationStatus,
} from './signature.js'

export {
  BrowserUnzipWorkerError,
  executeBrowserUnzipWorkerRequest,
  installBrowserUnzipWorker,
  unzipBrowserArchiveInWorker,
} from './browserUnzipWorker.js'

export type {
  BrowserUnzipWorkerErrorCode,
  BrowserUnzipWorkerFile,
  BrowserUnzipWorkerPort,
  BrowserUnzipWorkerRequest,
  BrowserUnzipWorkerResponse,
  BrowserUnzipWorkerResult,
  BrowserUnzipWorkerErrorResponse,
  BrowserUnzipWorkerSuccessResponse,
} from './browserUnzipWorker.js'

export type {
  ZipCentralDirectoryEntry,
  ZipCentralDirectoryErrorCode,
  ZipCentralDirectoryInspection,
  ZipCentralDirectoryLimits,
} from './centralDirectory.js'

export {
  WIDGET_ICON_MAX_BYTES,
  WIDGET_MANIFEST_FILE_PATH,
  WIDGET_MANIFEST_MAX_BYTES,
  WIDGET_SCREENSHOT_MAX_BYTES,
  WIDGET_SCREENSHOT_MAX_HEIGHT,
  WIDGET_SCREENSHOT_MAX_WIDTH,
  WidgetPackageFileError,
  validateWidgetPackageFiles,
} from './packageFiles.js'

export type {
  ValidatedWidgetPackageFiles,
  ValidatedWidgetStaticAsset,
  WidgetPackageFile,
  WidgetPackageFileErrorCode,
  WidgetStaticImageDecoder,
  WidgetStaticImageDimensions,
  WidgetStaticImageMime,
} from './packageFiles.js'
