import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createWidgetProject } from './scaffold.js'

/** 记录每个用例独占的临时根目录，确保脚手架验收不会在工作区留下示例项目。 */
const temporaryDirectories: string[] = []

/** 创建一处全新的系统临时目录，供单个脚手架用例验证真实文件输出。 */
async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'patab-create-widget-test-'))
  temporaryDirectories.push(directory)
  return directory
}

/** 每个测试后删除精确创建的临时根目录，避免把生成的私有 package 误留给后续命令。 */
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('create-patab-widget 脚手架', () => {
  /** 验证 Vanilla 模板写出可审查的 Manifest、三个 surface、静态 PNG 与 SDK Mock 测试，而不会安装依赖。 */
  it('创建完整 Vanilla TypeScript 组件项目', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, 'weather-card')

    await expect(createWidgetProject({
      targetDirectory: target,
      name: 'Weather Card',
      template: 'vanilla-ts',
    })).resolves.toEqual({ targetDirectory: target, template: 'vanilla-ts' })

    const manifest = JSON.parse(await readFile(join(target, 'patab.manifest.json'), 'utf8')) as { id: string }
    expect(manifest.id).toBe('com.example.weather-card')
    await expect(access(join(target, 'src', 'surfaces', 'widget.html'))).resolves.toBeUndefined()
    await expect(access(join(target, 'src', 'surfaces', 'detail.ts'))).resolves.toBeUndefined()
    await expect(access(join(target, 'src', 'surfaces', 'settings.ts'))).resolves.toBeUndefined()
    await expect(access(join(target, 'src', 'widget.spec.ts'))).resolves.toBeUndefined()
    await expect(readFile(join(target, 'assets', 'icon.png'))).resolves.toHaveLength(70)
    await expect(access(join(target, 'vite.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  /** 验证 Vue 模板增加唯一所需的 Vite 配置与三个 SFC，不影响共享 Manifest 和静态素材约定。 */
  it('创建完整 Vue TypeScript 组件项目', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, 'focus-widget')

    await createWidgetProject({ targetDirectory: target, name: 'Focus Widget', template: 'vue-ts' })

    await expect(readFile(join(target, 'vite.config.ts'), 'utf8')).resolves.toContain('@vitejs/plugin-vue')
    await expect(readFile(join(target, 'src', 'surfaces', 'widget.vue'), 'utf8')).resolves.toContain('createWidgetApi')
    await expect(readFile(join(target, 'src', 'surfaces', 'detail.vue'), 'utf8')).resolves.toContain('context')
    await expect(readFile(join(target, 'src', 'surfaces', 'settings.vue'), 'utf8')).resolves.toContain('保存示例')
  })

  /** 验证目标目录已存在时失败且不覆盖，保护用户已创建但尚未安装依赖的项目。 */
  it('拒绝覆盖既有目标目录', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, 'existing-widget')
    await createWidgetProject({ targetDirectory: target, name: 'Existing Widget', template: 'vanilla-ts' })

    await expect(createWidgetProject({ targetDirectory: target, name: 'Existing Widget', template: 'vanilla-ts' }))
      .rejects.toThrow('目标目录已存在。')
  })
})
