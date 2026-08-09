import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** 配置 Vue 官方插件；patab-widget 只校验最终自包含 HTML，不限制其它 Vite 插件。 */
export default defineConfig({ plugins: [vue()] })
