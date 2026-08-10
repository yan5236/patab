import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 构建前清空唯一 CLI 产物目录，避免已删除模块继续混入 npm tarball。 */
async function cleanCliDist() {
  await rm(resolve('dist'), { recursive: true, force: true })
}

await cleanCliDist()
