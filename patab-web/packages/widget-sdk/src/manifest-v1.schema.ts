/**
 * 定义可序列化的 PaTab Widget Manifest v1 JSON Schema；实际的跨字段、权限目录和归档文件校验由后续专用层执行。
 */
export const PATAB_WIDGET_MANIFEST_V1_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://patab.nanhaiblog.top/schemas/widget-manifest-v1.json',
  title: 'PaTab Widget Manifest v1',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'apiVersion',
    'id',
    'version',
    'name',
    'description',
    'developer',
    'surfaces',
    'sizes',
    'defaultSize',
    'assets',
  ],
  properties: {
    schemaVersion: { const: 1 },
    apiVersion: { const: '1' },
    id: {
      type: 'string',
      maxLength: 128,
      pattern: '^[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)+$',
    },
    version: {
      type: 'string',
      pattern:
        '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$',
    },
    name: { $ref: '#/$defs/localizedText' },
    description: { $ref: '#/$defs/localizedText' },
    developer: { $ref: '#/$defs/localizedText' },
    surfaces: {
      type: 'object',
      minProperties: 1,
      required: ['widget'],
      propertyNames: { $ref: '#/$defs/surfaceName' },
      additionalProperties: { $ref: '#/$defs/surfaceDeclaration' },
    },
    sizes: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { $ref: '#/$defs/tileSize' },
    },
    defaultSize: { $ref: '#/$defs/tileSize' },
    variants: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/variantDeclaration' },
    },
    defaultVariant: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    permissions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        required: { $ref: '#/$defs/permissionList' },
        optional: { $ref: '#/$defs/permissionList' },
      },
    },
    network: {
      type: 'array',
      items: { $ref: '#/$defs/networkDeclaration' },
    },
    assets: { $ref: '#/$defs/assets' },
    publisher: { $ref: '#/$defs/publisher' },
  },
  $defs: {
    localizedText: {
      type: 'object',
      additionalProperties: false,
      required: ['default'],
      properties: {
        default: { type: 'string', minLength: 1, maxLength: 4096 },
        'zh-CN': { type: 'string', minLength: 1, maxLength: 4096 },
        'en-US': { type: 'string', minLength: 1, maxLength: 4096 },
      },
    },
    surfaceName: {
      type: 'string',
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      maxLength: 64,
    },
    surfaceDeclaration: {
      type: 'object',
      additionalProperties: false,
      required: ['entry', 'title'],
      properties: {
        entry: {
          type: 'string',
          pattern: '^surfaces/[a-z0-9]+(?:-[a-z0-9]+)*\\.html$',
        },
        title: { $ref: '#/$defs/localizedText' },
        modalSize: { enum: ['small', 'medium', 'large'] },
      },
    },
    tileSize: {
      type: 'object',
      additionalProperties: false,
      required: ['w', 'h'],
      properties: {
        w: { type: 'integer' },
        h: { type: 'integer' },
      },
      oneOf: [
        { properties: { w: { const: 1 }, h: { const: 1 } } },
        { properties: { w: { const: 2 }, h: { const: 2 } } },
        { properties: { w: { const: 3 }, h: { const: 2 } } },
        { properties: { w: { const: 4 }, h: { const: 2 } } },
      ],
    },
    variantDeclaration: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'description', 'icon', 'supportedSizes'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128 },
        name: { $ref: '#/$defs/localizedText' },
        description: { $ref: '#/$defs/localizedText' },
        icon: { $ref: '#/$defs/assetPath' },
        supportedSizes: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/tileSize' },
        },
      },
    },
    permissionList: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
        enum: WIDGET_PERMISSIONS,
      },
    },
    networkDeclaration: {
      type: 'object',
      additionalProperties: false,
      required: ['origin', 'required', 'reason'],
      properties: {
        origin: {
          type: 'string',
          pattern: '^https://[^/?#]+$',
          maxLength: 2048,
        },
        required: { type: 'boolean' },
        reason: { $ref: '#/$defs/localizedText' },
      },
    },
    assetPath: {
      type: 'string',
      minLength: 8,
      pattern: '^assets/.+$',
    },
    assets: {
      type: 'object',
      additionalProperties: false,
      required: ['icon'],
      properties: {
        icon: { $ref: '#/$defs/assetPath' },
        screenshots: {
          type: 'array',
          maxItems: 5,
          uniqueItems: true,
          items: { $ref: '#/$defs/assetPath' },
        },
      },
    },
    publisher: {
      type: 'object',
      additionalProperties: false,
      required: ['publicKey'],
      properties: {
        publicKey: { type: 'string', minLength: 1, maxLength: 16384 },
      },
    },
  },
} as const
import { WIDGET_PERMISSIONS } from './permissions.js'
