import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 将 SDK 的公开主题样式复制到发布目录，保证 theme.css 子路径与 JavaScript 类型产物同步可用。
 */
async function copyThemeStylesheet() {
  const destination = resolve(packageRoot, 'dist/theme.css')

  await mkdir(dirname(destination), { recursive: true })
  await copyFile(resolve(packageRoot, 'src/theme.css'), destination)
}

await copyThemeStylesheet()
