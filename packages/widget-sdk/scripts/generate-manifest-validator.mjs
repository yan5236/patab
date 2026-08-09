import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'

import { PATAB_WIDGET_MANIFEST_V1_SCHEMA } from '../dist/manifest-v1.schema.js'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = resolve(scriptDirectory, '..')
const sourceOutput = resolve(packageDirectory, 'src/generated/manifestValidator.js')
const distributionOutput = resolve(packageDirectory, 'dist/generated/manifestValidator.js')

/**
 * 在构建期把 Manifest Schema 编译为 ESM standalone 验证器。
 *
 * MV3 页面禁止 unsafe-eval，Ajv 的运行时 compile 会调用 Function；此脚本只在受信构建环境运行，
 * 生成代码既供 Vite 开发入口读取，也复制到发布 dist，避免扩展在加载时再动态生成函数。
 */
async function generateManifestValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { esm: true, source: true } })
  ajv.compile(PATAB_WIDGET_MANIFEST_V1_SCHEMA)
  const runtimeImports = []
  const standalone = standaloneCode(ajv, { validateManifestV1: PATAB_WIDGET_MANIFEST_V1_SCHEMA.$id })
    .replace(/const (func\d+) = require\("([^"]+)"\)\.default;/g, (_match, name, modulePath) => {
      runtimeImports.push(`import ${name}Module from '${modulePath}.js';`)
      runtimeImports.push(`const ${name} = ${name}Module.default ?? ${name}Module;`)
      return ''
    })
  if (standalone.includes('require(')) {
    throw new Error('生成的 Manifest 验证器仍包含运行时 require，不能用于 MV3 CSP。')
  }
  const source = [
    '/* 自动生成：请运行 pnpm --filter @patab/widget-sdk build 后更新，禁止手工修改。 */',
    ...runtimeImports,
    standalone,
    '',
  ].join('\n')

  await Promise.all([sourceOutput, distributionOutput].map(async (target) => {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source, 'utf8')
  }))
}

await generateManifestValidator()
