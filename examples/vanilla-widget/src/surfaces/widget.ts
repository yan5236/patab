import '@patab/widget-sdk/theme.css'
import { connectPatabWidgetClient, createWidgetApi, type WidgetThemeChangedEvent } from '@patab/widget-sdk'

/** 启动 widget surface，并只通过 SDK 调用宿主能力。 */
async function start(): Promise<void> {
  const client = await connectPatabWidgetClient()
  const api = createWidgetApi(client)
  const context = await api.context.get()
  const root = document.querySelector<HTMLElement>('#app')
  if (!root) return
  root.className = 'pt-card'
  root.innerHTML = '<h1 class="pt-title">' + context.surface + '</h1><p class="pt-muted">' + (context.variantId ?? 'default') + '</p><button class="pt-button">保存示例</button>'
  root.querySelector('button')?.addEventListener('click', () => { void api.storage.set('lastSurface', context.surface) })
  api.on<WidgetThemeChangedEvent>('themeChanged', (event) => document.documentElement.dataset.theme = event.theme)
  if (context.permissions.granted.includes('todos.read')) void api.todos.list().catch(() => undefined)
}

void start()
