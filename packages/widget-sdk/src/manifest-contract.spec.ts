import type { ErrorObject } from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

import type { LocalizedText, PatabWidgetManifestV1 } from './manifest.js'
import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from './manifest-v1.schema.js'

const validateManifestV1 = new Ajv2020({ allErrors: true, strict: false }).compile(PATAB_WIDGET_MANIFEST_V1_SCHEMA)

/**
 * 创建完整的最小有效 Manifest 测试样本，集中表达 API v1 的公开字段而不触发任何第三方运行时代码。
 */
function createValidManifest(): PatabWidgetManifestV1 {
  return {
    schemaVersion: 1,
    apiVersion: '1',
    id: 'com.example.weather',
    version: '1.0.0',
    name: {
      default: 'Weather',
      'zh-CN': '天气',
      'en-US': 'Weather',
    },
    description: { default: '天气信息' },
    developer: { default: 'PaTab 示例开发者' },
    surfaces: {
      widget: {
        entry: 'surfaces/widget.html',
        title: { default: '天气' },
      },
    },
    sizes: [{ w: 2, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    variants: [{
      id: 'current',
      name: { default: '当前天气' },
      description: { default: '显示当前天气' },
      icon: 'assets/variant-current.png',
      supportedSizes: [{ w: 2, h: 2 }],
    }],
    defaultVariant: 'current',
    permissions: {
      required: ['todos.read'],
      optional: ['todos.create'],
    },
    network: [{
      origin: 'https://api.example.com',
      required: true,
      reason: { default: '获取天气数据' },
    }],
    assets: {
      icon: 'assets/icon.png',
      screenshots: ['assets/screenshots/weather.png'],
    },
    publisher: { publicKey: 'base64-public-key' },
  }
}

/**
 * 依据 LocalizedText 的公开回退规则选择当前语言文本，测试宿主与 CLI 都应遵守的 default 回退语义。
 */
function resolveLocalizedText(text: LocalizedText, locale: 'zh-CN' | 'en-US'): string {
  return text[locale] ?? text.default
}

/**
 * 将 Ajv 的首个错误转换为可断言的 JSON Pointer 字段路径；required 错误会补上缺失字段名以保持定位可操作。
 */
function getFirstSchemaErrorPath(errors: ErrorObject[] | null | undefined): string {
  const firstError = errors?.[0]
  if (!firstError) throw new Error('预期 JSON Schema 校验失败，但 Ajv 未返回错误。')

  if (firstError.keyword === 'required') {
    const missingProperty = (firstError.params as { readonly missingProperty?: unknown }).missingProperty
    if (typeof missingProperty === 'string') {
      return `${firstError.instancePath}/${missingProperty}`
    }
  }

  return firstError.instancePath || '/'
}

/**
 * 覆盖 Manifest v1 的正反例、Ajv 可执行 Schema、版本约束、权限目录和中英文元数据回退，而不创建任何宿主运行时。
 */
describe('Manifest v1 可执行公共契约', () => {
  /**
   * 验证完整正例可被 Draft 2020-12 Ajv 编译器接受，且 zh-CN 优先、缺失语言回退 default 的文本语义保持稳定。
   */
  it('接受完整 Manifest 并遵守中英文元数据回退', () => {
    const manifest = createValidManifest()

    expect(validateManifestV1(manifest)).toBe(true)
    expect(resolveLocalizedText(manifest.name, 'zh-CN')).toBe('天气')
    expect(resolveLocalizedText(manifest.description, 'en-US')).toBe('天气信息')
  })

  /**
   * 验证缺失必需 widget surface 时 Ajv 返回精确字段路径，导入 UI 因而可提示开发者而无需执行包内代码。
   */
  it('拒绝缺失 widget surface 并给出明确错误路径', () => {
    const manifest = createValidManifest()
    const invalidManifest = {
      ...manifest,
      surfaces: {
        settings: {
          entry: 'surfaces/settings.html',
          title: { default: '设置' },
        },
      },
    }

    expect(validateManifestV1(invalidManifest)).toBe(false)
    expect(getFirstSchemaErrorPath(validateManifestV1.errors)).toBe('/surfaces/widget')
  })

  /**
   * 验证 Schema 以精确 JSON Pointer 标识不兼容 API 主版本和未知必需权限，保持 CLI 与导入端可复用同一失败证据。
   */
  it('拒绝不兼容 API 版本和未知必需权限并给出明确错误路径', () => {
    const invalidApiVersion = {
      ...createValidManifest(),
      apiVersion: '2',
    }
    const unknownPermission = {
      ...createValidManifest(),
      permissions: {
        required: ['calendar.read'],
      },
    }

    expect(validateManifestV1(invalidApiVersion)).toBe(false)
    expect(getFirstSchemaErrorPath(validateManifestV1.errors)).toBe('/apiVersion')
    expect(validateManifestV1(unknownPermission)).toBe(false)
    expect(getFirstSchemaErrorPath(validateManifestV1.errors)).toBe('/permissions/required/0')
  })

  /**
   * 验证 Schema 拒绝不在四档固定尺寸集合内的对象，并保留数组元素级错误路径供后续公共契约报告使用。
   */
  it('拒绝不支持的图块尺寸并给出明确错误路径', () => {
    const invalidSize = {
      ...createValidManifest(),
      sizes: [{ w: 1, h: 2 }],
    }

    expect(validateManifestV1(invalidSize)).toBe(false)
    expect(getFirstSchemaErrorPath(validateManifestV1.errors)).toBe('/sizes/0/h')
  })
})
