import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from '@patab/widget-sdk/schema'

/** 官方脚手架支持的框架模板；运行格式仍由 patab-widget 最终产物校验决定。 */
export type WidgetTemplate = 'vanilla-ts' | 'vue-ts'

/** 脚手架创建所需的最小输入；target 必须是不存在的目录，避免覆盖用户项目。 */
export interface CreateWidgetProjectOptions {
  readonly targetDirectory: string
  readonly name: string
  readonly template: WidgetTemplate
}

/** 脚手架成功后返回的相对安全摘要，调用方可据此提示下一步而无需打印完整文件清单。 */
export interface CreatedWidgetProject {
  readonly targetDirectory: string
  readonly template: WidgetTemplate
}

/** 透明 1×1 PNG，既可作为脚手架图标也可作为截图占位，且满足共享图片格式和尺寸校验。 */
const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/7wAAAABJRU5ErkJggg==', 'base64')

/** 将用户显示名收窄为稳定 package/component ID 片段，不允许路径、控制符或 npm 不支持的空名进入模板。 */
function normalizeWidgetSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug || slug.length > 48) throw new Error('组件名称必须是 1 到 48 个字符的可用标识。')
  return slug
}

/** 生成官方模板共享 Manifest，完整声明 widget/detail/settings、variants、主题/API 入口和可选待办只读权限。 */
function createManifest(slug: string, displayName: string): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    apiVersion: '1',
    id: `com.example.${slug}`,
    version: '0.1.0',
    name: { default: displayName, 'zh-CN': displayName, 'en-US': displayName },
    description: { default: 'PaTab 官方脚手架组件示例。', 'zh-CN': 'PaTab 官方脚手架组件示例。', 'en-US': 'PaTab starter widget.' },
    developer: { default: '你的团队', 'zh-CN': '你的团队', 'en-US': 'Your team' },
    surfaces: {
      widget: { entry: 'surfaces/widget.html', title: { default: '组件', 'zh-CN': '组件', 'en-US': 'Widget' } },
      detail: { entry: 'surfaces/detail.html', title: { default: '详情', 'zh-CN': '详情', 'en-US': 'Detail' }, modalSize: 'medium' },
      settings: { entry: 'surfaces/settings.html', title: { default: '设置', 'zh-CN': '设置', 'en-US': 'Settings' }, modalSize: 'small' },
    },
    sizes: [{ w: 2, h: 2 }, { w: 3, h: 2 }],
    defaultSize: { w: 2, h: 2 },
    variants: [
      { id: 'compact', name: { default: '紧凑', 'zh-CN': '紧凑', 'en-US': 'Compact' }, description: { default: '紧凑显示', 'zh-CN': '紧凑显示', 'en-US': 'Compact display' }, icon: 'assets/icon.png', supportedSizes: [{ w: 2, h: 2 }] },
      { id: 'expanded', name: { default: '展开', 'zh-CN': '展开', 'en-US': 'Expanded' }, description: { default: '更多信息', 'zh-CN': '更多信息', 'en-US': 'More information' }, icon: 'assets/icon.png', supportedSizes: [{ w: 3, h: 2 }] },
    ],
    defaultVariant: 'compact',
    permissions: { optional: ['todos.read'] },
    assets: { icon: 'assets/icon.png', screenshots: ['assets/screenshots/preview.png'] },
  }, null, 2)}\n`
}

/** 生成 template 的 package.json；默认 private 避免尚未确认 npm 名称时误发布占用或冲突的公共名称。 */
function createPackageJson(slug: string, template: WidgetTemplate): string {
  const dependencies = template === 'vue-ts' ? { '@patab/widget-sdk': '^1.0.0', vue: '^3.5.38' } : { '@patab/widget-sdk': '^1.0.0' }
  const devDependencies = template === 'vue-ts'
    ? { '@patab/widget-cli': '^1.0.0', '@vitejs/plugin-vue': '^6.0.7', typescript: '~6.0.0', vite: '^8.0.16', vitest: '^4.1.9' }
    : { '@patab/widget-cli': '^1.0.0', typescript: '~6.0.0', vite: '^8.0.16', vitest: '^4.1.9' }
  return `${JSON.stringify({
    name: `${slug}-patab-widget`,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '^22.18.0 || >=24.12.0' },
    scripts: { dev: 'patab-widget dev', check: 'patab-widget check', build: 'patab-widget build', pack: 'patab-widget pack', 'type-check': 'tsc --noEmit', test: 'vitest run' },
    dependencies,
    devDependencies,
  }, null, 2)}\n`
}

/** 生成同一 surface 的 Vanilla HTML 入口；三个 surface 均独立构建，避免 modal 代码强制进入 widget 常驻包。 */
function createVanillaSurfaceHtml(surface: string): string {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${surface}</title></head><body><main id="app"></main><script type="module" src="./${surface}.ts"></script></body></html>\n`
}

/** 生成 Vanilla surface 源码，覆盖 context、主题、variants、存储、待办读取与 detail/settings 的宿主控制。 */
function createVanillaSurfaceSource(surface: string): string {
  return `import '@patab/widget-sdk/theme.css'\nimport { connectPatabWidgetClient, createWidgetApi, type WidgetThemeChangedEvent } from '@patab/widget-sdk'\n\n/** 启动 ${surface} surface，并只通过 SDK 调用宿主能力。 */\nasync function start(): Promise<void> {\n  const client = await connectPatabWidgetClient()\n  const api = createWidgetApi(client)\n  const context = await api.context.get()\n  const root = document.querySelector<HTMLElement>('#app')\n  if (!root) return\n  root.className = 'pt-card'\n  root.innerHTML = '<h1 class="pt-title">' + context.surface + '</h1><p class="pt-muted">' + (context.variantId ?? 'default') + '</p><button class="pt-button">保存示例</button>'\n  root.querySelector('button')?.addEventListener('click', () => { void api.storage.set('lastSurface', context.surface) })\n  api.on<WidgetThemeChangedEvent>('themeChanged', (event) => document.documentElement.dataset.theme = event.theme)\n  if (context.permissions.granted.includes('todos.read')) void api.todos.list().catch(() => undefined)\n}\n\nvoid start()\n`
}

/** 生成 Vue 所需的 Vite 配置，使用 runtime-only Vue SFC 构建，最终产物仍由 CLI 内联并拒绝开发客户端。 */
function createVueViteConfig(): string {
  return `import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n/** 配置 Vue 官方插件；patab-widget 只校验最终自包含 HTML，不限制其它 Vite 插件。 */\nexport default defineConfig({ plugins: [vue()] })\n`
}

/** 生成 Vue surface 源码，三个 surface 各自挂载独立 App 以满足多入口隔离构建。 */
function createVueSurfaceSource(surface: string): string {
  return `import { createApp } from 'vue'\nimport '@patab/widget-sdk/theme.css'\nimport App from './${surface}.vue'\n\n/** 挂载 ${surface} Vue surface；App 内只调用公开 SDK。 */\ncreateApp(App).mount('#app')\n`
}

/** 生成 Vue SFC，覆盖 context、variants、主题、存储、待办权限和宿主 surface 操作。 */
function createVueComponent(surface: string): string {
  return `<script setup lang="ts">\nimport { onMounted, ref } from 'vue'\nimport { connectPatabWidgetClient, createWidgetApi, type WidgetContext } from '@patab/widget-sdk'\n\nconst context = ref<WidgetContext>()\nconst api = ref<ReturnType<typeof createWidgetApi>>()\n\n/** 连接 SDK 并读取公开 context，主题变化仍由宿主 token 注入。 */\nonMounted(async () => {\n  const client = await connectPatabWidgetClient()\n  api.value = createWidgetApi(client)\n  context.value = await api.value.context.get()\n  if (context.value.permissions.granted.includes('todos.read')) void api.value.todos.list().catch(() => undefined)\n})\n\n/** 将当前 surface 写入实例私有存储，不直接访问 localStorage。 */\nfunction save(): void {\n  if (api.value && context.value) void api.value.storage.set('lastSurface', context.value.surface)\n}\n</script>\n\n<template><main class="pt-card"><h1 class="pt-title">{{ context?.surface ?? '${surface}' }}</h1><p class="pt-muted">{{ context?.variantId ?? 'default' }}</p><button class="pt-button" @click="save">保存示例</button></main></template>\n`
}

/** 把给定内容安全写入新项目目录；所有父目录由调用方统一创建，避免模板覆盖现有文件。 */
async function writeTemplateFile(root: string, relativePath: string, content: string | Uint8Array): Promise<void> {
  const outputPath = resolve(root, relativePath)
  if (!outputPath.startsWith(`${root}/`) && !outputPath.startsWith(`${root}\\`)) throw new Error('模板路径越出目标目录。')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, content, { flag: 'wx' })
}

/**
 * 创建完整官方组件项目。
 *
 * 输出包含 Manifest/Schema、三个 surface、图标截图、测试和标准脚本；模板只写入新目录，绝不安装依赖或改动现有项目。
 */
export async function createWidgetProject(options: CreateWidgetProjectOptions): Promise<CreatedWidgetProject> {
  const targetDirectory = resolve(options.targetDirectory)
  const slug = normalizeWidgetSlug(options.name)
  try {
    await access(targetDirectory)
    throw new Error('目标目录已存在。')
  } catch (error) {
    if (error instanceof Error && error.message === '目标目录已存在。') throw error
  }
  await mkdir(targetDirectory, { recursive: true })
  const commonFiles: ReadonlyArray<readonly [string, string | Uint8Array]> = [
    ['patab.manifest.json', createManifest(slug, options.name.trim())],
    ['schema/patab.manifest.schema.json', `${JSON.stringify(PATAB_WIDGET_MANIFEST_V1_SCHEMA, null, 2)}\n`],
    ['package.json', createPackageJson(slug, options.template)],
    ['tsconfig.json', '{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"bundler","strict":true,"noEmit":true},"include":["src"]}\n'],
    ['src/env.d.ts', "/// <reference types=\"vite/client\" />\ndeclare module '*.vue' { import type { Component } from 'vue'; const component: Component; export default component }\n"],
    ['src/widget.spec.ts', "import { expect, it } from 'vitest'\nimport { createWidgetMockHost } from '@patab/widget-sdk/testing'\n\n/** 验证组件可以通过公开 SDK Mock 读取实例存储。 */\nit('读取 Mock 存储', async () => { const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } }); await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' }); host.close() })\n"],
    ['assets/icon.png', PLACEHOLDER_PNG],
    ['assets/screenshots/preview.png', PLACEHOLDER_PNG],
  ]
  for (const [path, content] of commonFiles) await writeTemplateFile(targetDirectory, path, content)
  for (const surface of ['widget', 'detail', 'settings']) {
    await writeTemplateFile(targetDirectory, `src/surfaces/${surface}.html`, createVanillaSurfaceHtml(surface))
    await writeTemplateFile(targetDirectory, `src/surfaces/${surface}.ts`, options.template === 'vanilla-ts' ? createVanillaSurfaceSource(surface) : createVueSurfaceSource(surface))
    if (options.template === 'vue-ts') await writeTemplateFile(targetDirectory, `src/surfaces/${surface}.vue`, createVueComponent(surface))
  }
  if (options.template === 'vue-ts') await writeTemplateFile(targetDirectory, 'vite.config.ts', createVueViteConfig())
  return { targetDirectory, template: options.template }
}
