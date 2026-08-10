import type { WidgetDevSessionDescriptor } from '@patab/widget-sdk/dev-host'

import { useLauncherStore } from '@/stores/launcher'
import { useCustomComponentStore } from '@/stores/customComponents'

/**
 * 刷新真实组件目录，并保证会话描述中的默认实例只在隔离 launcher 中存在一次。
 *
 * 固定 instanceId 使宿主刷新后能够复用相同私有存储；图块尺寸与 variant 完全来自已经
 * 校验的会话描述，不接受地址栏或组件脚本覆盖。
 */
export async function mountWidgetDevInstance(descriptor: WidgetDevSessionDescriptor): Promise<void> {
  const components = useCustomComponentStore()
  await components.refreshInstalledComponents()

  const launcher = useLauncherStore()
  const existing = launcher.screens
    .flatMap((screen) => screen.tiles)
    .find((tile) => tile.type === 'widget'
      && tile.widgetType === 'custom'
      && tile.componentId === descriptor.component.manifest.id
      && tile.instanceId === descriptor.initialInstance.instanceId)
  if (existing) return

  const screen = launcher.screens[0]
  if (!screen) throw new Error('开发宿主缺少可用主屏')
  const widget = launcher.addCustomWidget(screen.id, {
    componentId: descriptor.component.manifest.id,
    instanceId: descriptor.initialInstance.instanceId,
    size: descriptor.initialInstance.size,
    variantId: descriptor.initialInstance.variantId,
  })
  if (!widget) throw new Error('开发组件实例创建失败')
  launcher.updateSettings({ cleanMode: false })
}
