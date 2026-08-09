import { defineConfig } from 'vitest/config'

/**
 * 为不依赖 DOM、Vue 或宿主状态的归档基础包固定 Node 测试环境。
 */
export default defineConfig({
  test: {
    environment: 'node',
  },
})
