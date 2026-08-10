import { createApp } from 'vue'
import { createPinia } from 'pinia'

import WidgetDevHostApp from './WidgetDevHostApp.vue'
import { i18n } from './i18n'
import { configureCustomComponentDevDatabase } from './custom-components/repository/customComponentDatabase'
import { configureCustomComponentSurfacePreparer } from './custom-components/runtime/runtimeHost'
import { createDevSandboxSurfacePreparer } from './custom-components/runtime/devSurfaceHtml'
import {
  consumeWidgetDevSessionToken,
  fetchWidgetDevSessionDescriptor,
} from './custom-components/dev-host/sessionClient'
import { ensureWidgetDevPackageInstalled } from './custom-components/dev-host/sessionPackage'
import { mountWidgetDevInstance } from './custom-components/dev-host/sessionLauncher'
import { configureLauncherDevStorage } from './stores/launcherStorageEnvironment'

/** 用固定、安全的文案替换启动页；不得把底层错误、URL 或认证信息写入 DOM。 */
function renderStartupFailure(): void {
  const root = document.querySelector<HTMLElement>('#app')
  if (!root) return
  root.textContent = 'PaTab 组件开发宿主启动失败，请返回终端查看并重新运行 dev。'
  root.className = 'grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-white'
}

/**
 * 启动真实 PaTab 组件开发宿主。
 *
 * token 只在内存中用于受保护资源请求；配置隔离存储、安装组件和注入开发 CSP 都发生在
 * Pinia Store 或 Runtime 首次创建之前，随后才挂载与正式站点相同的 App 组件树。
 */
async function startWidgetDevHost(): Promise<void> {
  const token = consumeWidgetDevSessionToken(window.location, window.history)
  const descriptor = await fetchWidgetDevSessionDescriptor({ token })
  configureLauncherDevStorage(descriptor.sessionId)
  configureCustomComponentDevDatabase(descriptor.sessionId)
  configureCustomComponentSurfacePreparer(createDevSandboxSurfacePreparer({ origin: window.location.origin }))
  await ensureWidgetDevPackageInstalled(descriptor, token)

  const pinia = createPinia()
  const app = createApp(WidgetDevHostApp, { descriptor })
  app.use(pinia)
  app.use(i18n)
  await mountWidgetDevInstance(descriptor)
  app.mount('#app')
}

void startWidgetDevHost().catch(renderStartupFailure)
