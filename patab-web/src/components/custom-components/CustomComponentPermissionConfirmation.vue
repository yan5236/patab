<script setup lang="ts">
/**
 * CustomComponentPermissionConfirmation —— 安装前展示并确认第三方权限与精确网络来源。
 * 所有选择都通过事件交给 Store，组件本身不持久化授权，也不会请求网络或执行第三方代码。
 */
import type { LocalizedText, WidgetNetworkDeclaration, WidgetPermission } from '@patab/widget-sdk'
import { ShieldCheck, Wifi } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  requiredPermissions: readonly WidgetPermission[]
  optionalPermissions: readonly WidgetPermission[]
  networks: readonly WidgetNetworkDeclaration[]
  permissionGrants: Partial<Record<WidgetPermission, boolean>>
  networkGrants: Readonly<Record<string, boolean>>
  newPermissions?: readonly WidgetPermission[]
  newNetworkOrigins?: readonly string[]
}>()

const emit = defineEmits<{
  'permission-change': [permission: WidgetPermission, granted: boolean]
  'network-change': [network: WidgetNetworkDeclaration, granted: boolean]
}>()
const { locale, t } = useI18n()

/** 将公开权限名映射为翻译键，避免在模板中把第三方能力说明写死。 */
function permissionKey(permission: WidgetPermission): string {
  return permission.replace('.', '-')
}

/** 区分待办读取与写操作，帮助用户理解同一领域下不同风险等级。 */
function permissionAccessKey(permission: WidgetPermission): 'read' | 'write' {
  return permission === 'todos.read' ? 'read' : 'write'
}

/** 读取权限复选框的新值并通过事件交给 Store 的授权门面。 */
function onPermissionChange(permission: WidgetPermission, event: Event): void {
  emit('permission-change', permission, (event.target as HTMLInputElement).checked)
}

/** 读取精确网络来源复选框的新值并通过事件交给 Store 的授权门面。 */
function onNetworkChange(network: WidgetNetworkDeclaration, event: Event): void {
  emit('network-change', network, (event.target as HTMLInputElement).checked)
}

/** 按当前 PaTab 语言读取网络用途，缺失本地化时回退到 Manifest 的 default。 */
function localize(text: LocalizedText): string {
  return text[locale.value as 'zh-CN' | 'en-US'] ?? text.default
}
</script>

<template>
  <section v-if="requiredPermissions.length || optionalPermissions.length" class="space-y-3">
    <div class="flex items-center gap-2">
      <ShieldCheck class="h-4 w-4 text-sky-500" />
      <h3 class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.permissionsTitle') }}</h3>
    </div>
    <p class="text-xs leading-5 theme-muted">{{ t('modals.componentStore.permissionsHint') }}</p>
    <div class="space-y-2">
      <label
        v-for="permission in requiredPermissions"
        :key="permission"
        class="theme-surface flex cursor-pointer items-start gap-3 rounded-2xl border p-3"
      >
        <input
          class="mt-1 h-4 w-4 accent-sky-500"
          type="checkbox"
          :checked="permissionGrants[permission] === true"
          @change="onPermissionChange(permission, $event)"
        >
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-1.5 text-sm font-medium theme-heading">
            {{ t(`modals.componentStore.permissionNames.${permissionKey(permission)}`) }}
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700">{{ t('modals.componentStore.required') }}</span>
            <span v-if="newPermissions?.includes(permission)" class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700">{{ t('modals.componentStore.newForUpdate') }}</span>
            <span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-700">{{ t(`modals.componentStore.permissionAccess.${permissionAccessKey(permission)}`) }}</span>
          </span>
          <span class="mt-1 block text-xs leading-5 theme-muted">{{ t(`modals.componentStore.permissionReasons.${permissionKey(permission)}`) }}</span>
        </span>
      </label>
      <label
        v-for="permission in optionalPermissions"
        :key="permission"
        class="theme-surface flex cursor-pointer items-start gap-3 rounded-2xl border p-3"
      >
        <input
          class="mt-1 h-4 w-4 accent-sky-500"
          type="checkbox"
          :checked="permissionGrants[permission] === true"
          @change="onPermissionChange(permission, $event)"
        >
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-1.5 text-sm font-medium theme-heading">
            {{ t(`modals.componentStore.permissionNames.${permissionKey(permission)}`) }}
            <span class="rounded-full bg-neutral-500/15 px-2 py-0.5 text-[10px] theme-muted">{{ t('modals.componentStore.optional') }}</span>
            <span v-if="newPermissions?.includes(permission)" class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700">{{ t('modals.componentStore.newForUpdate') }}</span>
            <span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-700">{{ t(`modals.componentStore.permissionAccess.${permissionAccessKey(permission)}`) }}</span>
          </span>
          <span class="mt-1 block text-xs leading-5 theme-muted">{{ t(`modals.componentStore.permissionReasons.${permissionKey(permission)}`) }}</span>
        </span>
      </label>
    </div>
  </section>

  <section v-if="networks.length" class="space-y-3">
    <div class="flex items-center gap-2">
      <Wifi class="h-4 w-4 text-sky-500" />
      <h3 class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.networkTitle') }}</h3>
    </div>
    <p class="text-xs leading-5 theme-muted">{{ t('modals.componentStore.networkHint') }}</p>
    <label v-for="network in networks" :key="network.origin" class="theme-surface flex cursor-pointer items-start gap-3 rounded-2xl border p-3">
      <input
        class="mt-1 h-4 w-4 accent-sky-500"
        type="checkbox"
        :checked="networkGrants[network.origin] === true"
        @change="onNetworkChange(network, $event)"
      >
      <span class="min-w-0 flex-1">
        <span class="flex flex-wrap items-center gap-1.5 text-sm font-medium theme-heading">
          <code class="break-all">{{ network.origin }}</code>
          <span class="rounded-full px-2 py-0.5 text-[10px]" :class="network.required ? 'bg-amber-500/15 text-amber-700' : 'bg-neutral-500/15 theme-muted'">
            {{ network.required ? t('modals.componentStore.required') : t('modals.componentStore.optional') }}
          </span>
          <span v-if="newNetworkOrigins?.includes(network.origin)" class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700">{{ t('modals.componentStore.newForUpdate') }}</span>
        </span>
        <span class="mt-1 block text-xs leading-5 theme-muted">{{ localize(network.reason) }}</span>
      </span>
    </label>
  </section>
</template>
