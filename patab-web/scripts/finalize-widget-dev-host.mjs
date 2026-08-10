import { rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 专用宿主协议版本必须与 widget-cli 的 WIDGET_DEV_HOST_VERSION 同步更新。 */
const HOST_VERSION = '1.0.0'
const outputRoot = resolve('dist-widget-dev-host')

/**
 * 把 Vite 按源码文件名输出的 HTML 固定为 server 根入口，并写入 CLI 严格校验的元数据。
 */
async function finalizeWidgetDevHost() {
  await rename(resolve(outputRoot, 'widget-dev-host.html'), resolve(outputRoot, 'index.html'))
  await writeFile(
    resolve(outputRoot, 'host.json'),
    `${JSON.stringify({ version: HOST_VERSION, entry: 'index.html' }, null, 2)}\n`,
    'utf8',
  )
}

await finalizeWidgetDevHost()
