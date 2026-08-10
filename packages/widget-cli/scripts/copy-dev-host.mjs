import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('../../patab-web/dist-widget-dev-host')
const target = resolve('dist/dev-host')

/** 把唯一一次专用构建产物复制进 CLI 发布目录，避免运行 dev 时依赖 PaTab 源码仓库。 */
async function copyWidgetDevHost() {
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })
}

await copyWidgetDevHost()
