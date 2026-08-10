import { describe, expect, it } from 'vitest'

import type { PatabWidgetManifestV1 } from './manifest.js'
import {
  WIDGET_DEV_HOST_PROTOCOL_VERSION,
  validateWidgetDevSessionDescriptor,
  type WidgetDevSessionDescriptor,
} from './devHost.js'

/** 创建每个测试独占的合法开发会话描述，避免异常场景共享可变嵌套对象。 */
function createDescriptor(): WidgetDevSessionDescriptor {
  const manifest: PatabWidgetManifestV1 = {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.dev-host',
    version: '1.0.0',
    name: { default: '开发组件' },
    description: { default: '开发宿主契约测试' },
    developer: { default: 'PaTab' },
    surfaces: {
      widget: { entry: 'surfaces/widget.html', title: { default: '开发组件' } },
      settings: { entry: 'surfaces/settings.html', title: { default: '设置' } },
    },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    variants: [{
      id: 'default',
      name: { default: '默认' },
      description: { default: '默认类型' },
      icon: 'assets/variant.png',
      supportedSizes: [{ w: 2, h: 2 }],
    }],
    defaultVariant: 'default',
    assets: { icon: 'assets/icon.png' },
  }
  return {
    protocolVersion: WIDGET_DEV_HOST_PROTOCOL_VERSION,
    sessionId: 'session_1234567890',
    hostVersion: '1.0.0',
    revision: 1,
    component: {
      manifest,
      surfacePaths: {
        widget: '/__patab_dev__/sessions/session_1234567890/surfaces/widget',
        settings: '/__patab_dev__/sessions/session_1234567890/surfaces/settings',
      },
    },
    initialInstance: {
      instanceId: 'instance_12345678',
      size: { w: 2, h: 2 },
      variantId: 'default',
    },
    seedVersion: 1,
  }
}

describe('开发宿主会话描述', () => {
  /** 验证合法描述被深复制，调用方后续修改输入不会穿透校验结果。 */
  it('接受合法描述并返回隔离副本', () => {
    const input = createDescriptor()
    const result = validateWidgetDevSessionDescriptor(input)

    expect(result).toMatchObject({ valid: true })
    if (!result.valid) return
    expect(result.value).toEqual(input)
    expect(result.value).not.toBe(input)
    expect(result.value.component.manifest).not.toBe(input.component.manifest)
  })

  /** 验证协议版本和未知根字段不会被静默忽略。 */
  it('拒绝不兼容协议与未知字段', () => {
    expect(validateWidgetDevSessionDescriptor({ ...createDescriptor(), protocolVersion: 2 })).toEqual({
      valid: false,
      path: '/protocolVersion',
    })
    expect(validateWidgetDevSessionDescriptor({ ...createDescriptor(), token: 'secret' })).toEqual({
      valid: false,
      path: '/',
    })
  })

  /** 验证 surface 路径必须与 Manifest 完全对应且停留在随机会话命名空间。 */
  it('拒绝缺失、重复和越界 surface 路径', () => {
    const descriptor = createDescriptor()
    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      component: { ...descriptor.component, surfacePaths: { widget: descriptor.component.surfacePaths.widget } },
    })).toEqual({ valid: false, path: '/component/surfacePaths' })

    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      component: {
        ...descriptor.component,
        surfacePaths: { widget: 'C:\\secret\\widget.html', settings: '/../../settings.html' },
      },
    })).toEqual({ valid: false, path: '/component/surfacePaths/settings' })

    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      component: {
        ...descriptor.component,
        surfacePaths: {
          widget: descriptor.component.surfacePaths.widget,
          settings: descriptor.component.surfacePaths.widget,
        },
      },
    })).toEqual({ valid: false, path: '/component/surfacePaths' })
  })

  /** 验证实例尺寸和 variant 必须来自 Manifest 默认值，避免宿主首次状态产生歧义。 */
  it('拒绝非默认实例状态', () => {
    const descriptor = createDescriptor()
    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      initialInstance: { ...descriptor.initialInstance, size: { w: 1, h: 1 } },
    })).toEqual({ valid: false, path: '/initialInstance/size' })
    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      initialInstance: { ...descriptor.initialInstance, variantId: 'other' },
    })).toEqual({ valid: false, path: '/initialInstance/variantId' })
  })

  /** 验证 Manifest Schema 错误只以嵌套 JSON Pointer 对外表达。 */
  it('拒绝非法 Manifest 并返回公开路径', () => {
    const descriptor = createDescriptor()
    expect(validateWidgetDevSessionDescriptor({
      ...descriptor,
      component: { ...descriptor.component, manifest: { ...descriptor.component.manifest, apiVersion: '2' } },
    })).toEqual({ valid: false, path: '/component/manifest/apiVersion' })
  })
})
