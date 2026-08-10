import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
  WIDGET_DEV_HOST_PROTOCOL_VERSION,
  validateWidgetDevSessionDescriptor,
  type WidgetDevSessionDescriptor,
} from '@patab/widget-sdk/dev-host'

import type { WidgetProject } from '../project.js'
import { WidgetCliError } from '../report.js'

/** 随机会话和实例 ID 的最小熵；不得为了缩短 URL 降低到 128 bit 以下。 */
const DEV_SESSION_RANDOM_BYTES = 18

/** CLI 当前内置开发宿主的版本；发布时必须与宿主构建元数据一致。 */
export const WIDGET_DEV_HOST_VERSION = '1.0.0'

/** 一次 CLI 开发会话的身份、公开描述与不可猜测资源命名空间。 */
export interface WidgetDevSession {
  readonly token: string
  readonly descriptor: WidgetDevSessionDescriptor
  readonly publicPathPrefix: string
}

/** 创建会话所需的纯输入；随机源可替换以进行确定性测试。 */
export interface CreateWidgetDevSessionInput {
  readonly project: WidgetProject
  readonly hostVersion?: string
  readonly revision?: number
  readonly randomBytes?: (size: number) => Uint8Array
}

/** 把随机字节编码为不需要 URL 转义的 capability 文本。 */
function encodeRandomId(bytes: Uint8Array): string {
  if (bytes.byteLength < 16) throw new WidgetCliError('BUILD_FAILED', '无法创建安全的组件开发会话。')
  return Buffer.from(bytes).toString('base64url')
}

/** 使用显式随机源创建一个不少于 128 bit 的随机 ID。 */
function createRandomId(source: (size: number) => Uint8Array): string {
  return encodeRandomId(source(DEV_SESSION_RANDOM_BYTES))
}

/**
 * 创建不可变的开发会话描述。
 *
 * token 与资源路径分开生成；descriptor 只含宿主启动所需公开元数据，不包含项目根、源码或 token。
 */
export function createWidgetDevSession(input: CreateWidgetDevSessionInput): WidgetDevSession {
  const source = input.randomBytes ?? randomBytes
  const sessionId = createRandomId(source)
  const token = createRandomId(source)
  const instanceId = createRandomId(source)
  const publicPathPrefix = `/__patab_dev__/sessions/${sessionId}`
  const surfacePaths = Object.fromEntries(
    Object.keys(input.project.manifest.surfaces)
      .sort()
      .map((surface) => [surface, `${publicPathPrefix}/surfaces/${surface}`]),
  )
  const descriptor: WidgetDevSessionDescriptor = {
    protocolVersion: WIDGET_DEV_HOST_PROTOCOL_VERSION,
    sessionId,
    hostVersion: input.hostVersion ?? WIDGET_DEV_HOST_VERSION,
    revision: input.revision ?? 1,
    component: {
      manifest: structuredClone(input.project.manifest),
      surfacePaths,
    },
    initialInstance: {
      instanceId,
      size: { ...input.project.manifest.defaultSize },
      ...(input.project.manifest.defaultVariant ? { variantId: input.project.manifest.defaultVariant } : {}),
    },
    seedVersion: 1,
  }
  if (!validateWidgetDevSessionDescriptor(descriptor).valid) {
    throw new WidgetCliError('BUILD_FAILED', '无法创建有效的组件开发会话。')
  }
  return Object.freeze({ token, descriptor, publicPathPrefix })
}

/**
 * 生成默认浏览器使用的开发宿主 URL。
 *
 * token 仅放在 fragment，HTTP 请求和 Referer 不会携带；调用方不得打印该完整 URL。
 */
export function createWidgetDevHostUrl(origin: string, session: WidgetDevSession): URL {
  let url: URL
  try {
    url = new URL('/__patab_dev__/', origin)
  } catch {
    throw new WidgetCliError('BUILD_FAILED', '组件开发宿主地址无效。')
  }
  url.hash = `session=${encodeURIComponent(session.token)}`
  return url
}

/** 使用定长比较验证 Bearer token，认证失败不暴露 header 或会话内容。 */
export function authenticateWidgetDevSession(
  authorizationHeader: string | undefined,
  session: WidgetDevSession,
): boolean {
  if (!authorizationHeader?.startsWith('Bearer ')) return false
  const candidate = Buffer.from(authorizationHeader.slice('Bearer '.length), 'utf8')
  const expected = Buffer.from(session.token, 'utf8')
  return candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected)
}
