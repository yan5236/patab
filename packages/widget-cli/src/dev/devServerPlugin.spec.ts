import { describe, expect, it } from 'vitest'

import type { WidgetProject } from '../project.js'
import { createWidgetDevSession } from './devSession.js'
import { resolveWidgetDevRequest } from './devServerPlugin.js'

/** 创建路由测试需要的最小项目与确定性会话。 */
function createFixture() {
  const project: WidgetProject = {
    root: 'C:\\widget',
    manifestSource: '{}',
    manifest: {
      schemaVersion: 1,
      apiVersion: '1',
      id: 'com.example.routes',
      version: '1.0.0',
      name: { default: 'Routes' },
      description: { default: 'Routes test' },
      developer: { default: 'PaTab' },
      surfaces: { widget: { entry: 'surfaces/widget.html', title: { default: 'Widget' } } },
      sizes: [{ w: 2, h: 2 }],
      defaultSize: { w: 2, h: 2 },
      assets: { icon: 'assets/icon.png', screenshots: ['assets/screenshot.png'] },
    },
  }
  let sequence = 0
  const session = createWidgetDevSession({
    project,
    randomBytes: (size) => new Uint8Array(size).fill(++sequence),
  })
  return { project, session }
}

describe('开发 server 路由', () => {
  /** 验证固定宿主、会话、surface 和声明资产均映射到单一职责路由。 */
  it('解析合法开发资源', () => {
    const { project, session } = createFixture()

    expect(resolveWidgetDevRequest('/__patab_dev__/', session, project)).toEqual({
      kind: 'host-asset',
      path: 'index.html',
    })
    expect(resolveWidgetDevRequest('/__patab_dev__/assets/main.js', session, project)).toEqual({
      kind: 'host-asset',
      path: 'assets/main.js',
    })
    expect(resolveWidgetDevRequest('/__patab_dev__/session', session, project)).toEqual({ kind: 'session' })
    expect(resolveWidgetDevRequest(`${session.publicPathPrefix}/surfaces/widget`, session, project)).toEqual({
      kind: 'surface',
      surface: 'widget',
    })
    expect(resolveWidgetDevRequest(`${session.publicPathPrefix}/assets/assets/icon.png`, session, project)).toEqual({
      kind: 'component-asset',
      path: 'assets/icon.png',
    })
    expect(resolveWidgetDevRequest('/scenery1.jpg', session, project)).toEqual({
      kind: 'host-asset',
      path: 'scenery1.jpg',
    })
  })

  /** 验证未声明 surface/资产和其他会话路径统一进入受保护失败，而不落到 Vite 文件服务。 */
  it.each([
    (prefix: string) => `${prefix}/surfaces/admin`,
    (prefix: string) => `${prefix}/assets/package.json`,
    () => '/__patab_dev__/sessions/another_session_123/surfaces/widget',
    () => '/__patab_dev__/sessions/%2e%2e/secret',
  ])('拒绝未声明或越界会话资源', (createPath) => {
    const { project, session } = createFixture()
    expect(resolveWidgetDevRequest(createPath(session.publicPathPrefix), session, project)).toEqual({
      kind: 'protected-not-found',
    })
  })

  /** 验证普通 Vite 模块和 HMR 路径不被宿主插件截获。 */
  it.each([
    '/src/widget.ts',
    '/@vite/client',
    '/node_modules/.vite/deps/vue.js',
    (prefix: string) => `${prefix}/vite/@vite/client`,
    (prefix: string) => `${prefix}/vite/src/surfaces/widget.ts`,
    (prefix: string) => `${prefix}/hmr`,
  ])(
    '保留 Vite 请求：%s',
    (path) => {
      const { project, session } = createFixture()
      const requestPath = typeof path === 'function' ? path(session.publicPathPrefix) : path
      expect(resolveWidgetDevRequest(requestPath, session, project)).toEqual({ kind: 'unhandled' })
    },
  )
})
