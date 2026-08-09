import type { WidgetBrokerMethod, WidgetBrokerSession, WidgetPermissionSource } from '@/custom-components/runtime/capabilityBroker'
import { WidgetBrokerMethodError } from '@/custom-components/runtime/capabilityBroker'

import { WidgetNetworkAdapterError, type WidgetNetworkAdapter } from './networkAdapters'
import { normalizeWidgetNetworkRequest } from './networkPolicy'

/** 判断当前活动 Repository grant 是否仍允许精确网络来源；未提供网络查询器时默认拒绝。 */
async function hasNetworkOriginPermission(
  permissions: WidgetPermissionSource,
  session: WidgetBrokerSession,
  origin: `https://${string}`,
): Promise<boolean> {
  return permissions.hasNetworkOrigin ? permissions.hasNetworkOrigin(session, origin) : false
}

/**
 * 创建 network.fetch 的 Broker 方法表。
 *
 * DTO 清洗、Repository grant 和 MV3 host permission 分别在策略、权限源和适配器层完成；
 * 此处只编排固定顺序，绝不记录 URL、Authorization、正文或 fetch 原始异常。
 */
export function createWidgetNetworkBrokerMethods(
  permissions: WidgetPermissionSource,
  adapter: WidgetNetworkAdapter,
): Readonly<Record<string, WidgetBrokerMethod>> {
  return {
    'network.fetch': {
      kind: 'network',
      validateParams: (params) => {
        const result = normalizeWidgetNetworkRequest(params)
        return result.valid ? undefined : result.error
      },
      async invoke(params, session) {
        const result = normalizeWidgetNetworkRequest(params)
        if (!result.valid) throw new WidgetBrokerMethodError(result.error)
        if (!await hasNetworkOriginPermission(permissions, session, result.request.origin)) {
          throw new WidgetBrokerMethodError({ code: 'ORIGIN_NOT_ALLOWED', message: '网络目标不属于当前组件已授权来源。' })
        }
        try {
          return await adapter.execute(result.request)
        } catch (error) {
          if (error instanceof WidgetNetworkAdapterError) {
            throw new WidgetBrokerMethodError(error.error)
          }
          throw new WidgetBrokerMethodError({ code: 'INVALID_REQUEST', message: '网络请求未能完成。' })
        }
      },
    },
  }
}
