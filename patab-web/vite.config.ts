import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

/** 仅扩展构建复制 Manifest，避免网页版 dist 被浏览器识别成扩展包。 */
function copyExtensionManifest(): Plugin {
  let outDir = 'dist'
  let buildMode = 'production'

  return {
    name: 'copy-extension-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
      buildMode = config.mode
    },
    async closeBundle() {
      if (buildMode !== 'extension') return

      const target = resolve(rootDir, outDir, 'manifest.json')
      await mkdir(dirname(target), { recursive: true })
      await copyFile(resolve(rootDir, 'extension/manifest.json'), target)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    copyExtensionManifest(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 6109,
  },
})
