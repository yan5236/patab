import { describe, expect, it } from 'vitest'

import { WIDGET_SDK_METADATA } from './index.js'
import { WIDGET_ERROR_CODES } from './errors.js'
import type { PatabWidgetManifestV1 } from './manifest.js'
import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from './manifest-v1.schema.js'
import {
  WIDGET_RPC_API_VERSION,
  WIDGET_RPC_PROTOCOL,
  evaluateWidgetApiCompatibility,
  type WidgetContext,
  type WidgetEvent,
  type WidgetRequest,
  type WidgetResponse,
} from './rpc.js'

/**
 * 组织 SDK 入口元数据的最小回归场景，防止后续公共契约扩展时意外改变独立包的兼容标识。
 */
describe('SDK 入口元数据', () => {
  /**
   * 验证骨架入口公开独立 SemVer 与 API 主版本，供后续 CLI 和宿主在执行第三方代码前进行兼容性判断。
   */
  it('公开包名、SemVer 版本与 API 主版本', () => {
    expect(WIDGET_SDK_METADATA).toEqual({
      packageName: '@patab/widget-sdk',
      sdkVersion: '1.0.0',
      supportedApiMajor: 1,
    })
  })
})

/**
 * 组织 Manifest v1 公开契约的聚焦测试，保证后续校验器可依赖同一份静态类型和 JSON Schema。
 */
describe('Manifest v1 契约', () => {
  /**
   * 验证代表性 Manifest 能同时表达本地化、surface、尺寸、variants、权限、网络、资源和发布者元数据。
   */
  it('提供完整的公开静态类型形状', () => {
    const manifest: PatabWidgetManifestV1 = {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.weather',
      version: '1.0.0',
      name: { default: '天气', 'en-US': 'Weather' },
      description: { default: '显示天气信息' },
      developer: { default: 'PaTab 示例开发者' },
      surfaces: {
        widget: {
          entry: 'surfaces/widget.html',
          title: { default: '天气' },
        },
        settings: {
          entry: 'surfaces/settings.html',
          title: { default: '设置' },
          modalSize: 'medium',
        },
      },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      variants: [
        {
          id: 'current',
          name: { default: '当前天气' },
          description: { default: '显示当前天气' },
          icon: 'assets/variant-current.png',
          supportedSizes: [{ w: 2, h: 2 }],
        },
      ],
      defaultVariant: 'current',
      permissions: {
        required: ['todos.read'],
        optional: ['todos.create'],
      },
      network: [
        {
          origin: 'https://api.example.com',
          required: true,
          reason: { default: '获取天气数据' },
        },
      ],
      assets: {
        icon: 'assets/icon.png',
        screenshots: ['assets/screenshots/main.png'],
      },
      publisher: { publicKey: 'base64-public-key' },
    }

    expect(manifest.surfaces.widget.entry).toBe('surfaces/widget.html')
    expect(manifest.variants?.[0]?.supportedSizes).toEqual([{ w: 2, h: 2 }])
  })

  /**
   * 验证 JSON Schema 固定 API 主版本、必填静态字段与安全的路径、网络和资源约束，而不在 SDK 骨架阶段实现运行时校验器。
   */
  it('公开可序列化的 JSON Schema 约束', () => {
    const serializedSchema = JSON.parse(JSON.stringify(PATAB_WIDGET_MANIFEST_V1_SCHEMA)) as typeof PATAB_WIDGET_MANIFEST_V1_SCHEMA

    expect(serializedSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(serializedSchema.properties.apiVersion).toEqual({ const: '1' })
    expect(serializedSchema.properties.surfaces.required).toEqual(['widget'])
    expect(serializedSchema.$defs.tileSize.oneOf).toHaveLength(4)
    expect(serializedSchema.$defs.assets.properties.screenshots.maxItems).toBe(5)
    expect(serializedSchema.$defs.networkDeclaration.properties.origin.pattern).toBe('^https://[^/?#]+$')
  })
})

/**
 * 组织 API v1 RPC DTO 与版本兼容性的聚焦测试，确保公开协议不需要访问真实 MessageChannel 或宿主运行时。
 */
describe('API v1 RPC 契约', () => {
  /**
   * 验证请求、成功响应、失败响应、事件和上下文都能使用纯公开 DTO 表达，且不夹带宿主服务对象。
   */
  it('提供实例隔离的请求、响应、事件与上下文类型', () => {
    const context: WidgetContext = {
      componentId: 'com.example.weather',
      instanceId: 'instance-1',
      componentVersion: '1.0.0',
      apiVersion: 1,
      surface: 'widget',
      size: { w: 2, h: 2 },
      locale: 'zh-CN',
      theme: 'dark',
      reducedMotion: false,
      visible: true,
      permissions: {
        granted: ['todos.read'],
        networkOrigins: ['https://api.example.com'],
      },
    }
    const request: WidgetRequest<{ readonly includeCompleted: boolean }> = {
      protocol: WIDGET_RPC_PROTOCOL,
      apiVersion: WIDGET_RPC_API_VERSION,
      sessionId: 'session-1',
      requestId: 'request-1',
      method: 'context.get',
      params: { includeCompleted: false },
    }
    const response: WidgetResponse<WidgetContext> = {
      requestId: request.requestId,
      ok: true,
      result: context,
    }
    const event: WidgetEvent<{ readonly visible: boolean }, 'visibilityChanged'> = {
      protocol: WIDGET_RPC_PROTOCOL,
      apiVersion: WIDGET_RPC_API_VERSION,
      sessionId: request.sessionId,
      event: 'visibilityChanged',
      payload: { visible: true },
    }
    const failedResponse: WidgetResponse = {
      requestId: 'request-2',
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: '未获得所需权限。',
      },
    }

    expect(response.ok && response.result?.instanceId).toBe('instance-1')
    expect(event.payload.visible).toBe(true)
    expect(!failedResponse.ok && failedResponse.error.code).toBe('PERMISSION_DENIED')
  })

  /**
   * 验证 Manifest 的字符串主版本与 RPC 数字主版本共享同一兼容性结果，并以固定错误码表达不兼容。
   */
  it('统一判断 API 主版本兼容性', () => {
    expect(evaluateWidgetApiCompatibility('1')).toEqual({
      compatible: true,
      requestedApiVersion: 1,
      supportedApiVersion: 1,
    })
    expect(evaluateWidgetApiCompatibility(2)).toMatchObject({
      compatible: false,
      requestedApiVersion: 2,
      supportedApiVersion: 1,
      error: { code: 'API_INCOMPATIBLE' },
    })
  })

  /**
   * 验证稳定错误码同时覆盖权限、参数、配额、网络和协议版本等跨边界失败情形。
   */
  it('公开稳定错误码目录', () => {
    expect(WIDGET_ERROR_CODES).toEqual(expect.arrayContaining([
      'API_INCOMPATIBLE',
      'INVALID_ARGUMENT',
      'ORIGIN_NOT_ALLOWED',
      'PERMISSION_DENIED',
      'QUOTA_EXCEEDED',
      'RESPONSE_TOO_LARGE',
      'SURFACE_NOT_DECLARED',
    ]))
  })
})
