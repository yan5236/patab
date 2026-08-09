<script setup lang="ts">
/**
 * ComponentStoreModal —— 内置与第三方组件的统一商店容器。
 * 内置 todo/clock 保持既有添加逻辑；第三方 ZIP 仅经 Store、Worker 与 Repository 边界流转，容器不直接读 IndexedDB。
 */
import { computed, onMounted, ref } from 'vue'
import { CircleAlert, Clock as ClockIcon, ListTodo, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import BaseModal from '@/components/common/BaseModal.vue'
import CustomComponentCatalogItem from '@/components/custom-components/CustomComponentCatalogItem.vue'
import CustomComponentImportButton from '@/components/custom-components/CustomComponentImportButton.vue'
import CustomComponentImportStatus from '@/components/custom-components/CustomComponentImportStatus.vue'
import CustomComponentReview from '@/components/custom-components/CustomComponentReview.vue'
import { useCustomComponentImport } from '@/composables/useCustomComponentImport'
import { useLauncherStore } from '@/stores/launcher'
import { useCustomComponentSafetyStore } from '@/stores/customComponentSafety'
import { useCustomComponentStore } from '@/stores/customComponents'
import { useUiStore } from '@/stores/ui'
import TodoWidget from '@/components/widgets/TodoWidget.vue'
import ClockWidget from '@/components/widgets/clock/ClockWidget.vue'
import ComponentStoreItem from './ComponentStoreItem.vue'
import ComponentStoreDetail from './ComponentStoreDetail.vue'
import { defaultClockConfig } from '@/utils/clock'
import type { ClockConfig, ClockType, TileSize } from '@/types'

type BuiltinComponentId = 'clock' | 'todo'

const launcher = useLauncherStore()
const componentSafety = useCustomComponentSafetyStore()
const customComponents = useCustomComponentStore()
const ui = useUiStore()
const { locale, t } = useI18n()
const { cancelImport, importFile } = useCustomComponentImport()
const query = ref('')
const detailId = ref<BuiltinComponentId>()
const showingReview = ref(false)
const viewTransition = ref<'store-back' | 'store-forward'>('store-forward')

const components = computed(() => [
  {
    id: 'todo' as const,
    title: t('modals.componentStore.todoTitle'),
    description: t('modals.componentStore.todoDescription'),
    detail: t('modals.componentStore.todoDetail'),
    icon: ListTodo,
    version: '1.0.0',
    developer: 'Patab',
  },
  {
    id: 'clock' as const,
    title: t('modals.componentStore.clockTitle'),
    description: t('modals.componentStore.clockDescription'),
    detail: t('modals.componentStore.clockDetail'),
    icon: ClockIcon,
    version: '1.0.0',
    developer: 'Patab',
  },
])
const detailItem = computed(() => components.value.find((item) => item.id === detailId.value))
const showingUninstall = computed(() => customComponents.uninstallState.status === 'awaiting-confirmation')

/** 时钟预览用的固定配置，避免商店预览触发真实图块查找、状态写入或计时器响铃。 */
const clockPreviews: Record<ClockType, ClockConfig> = {
  time: defaultClockConfig('time'),
  stopwatch: defaultClockConfig('stopwatch'),
  timer: defaultClockConfig('timer'),
}

/** 详情走马灯按尺寸展示时钟的三种内置形态，不改变用户已添加的时钟实例。 */
function clockPreviewType(size: TileSize): ClockType {
  if (size.w === 3) return 'stopwatch'
  if (size.w === 4) return 'timer'
  return 'time'
}

/** 以当前语言读取已安装 Manifest 的静态文本，遵守 SDK 规定的 default 回退。 */
function localize(text: { readonly default: string; readonly 'zh-CN'?: string; readonly 'en-US'?: string }): string {
  return text[locale.value as 'zh-CN' | 'en-US'] ?? text.default
}

/** 按名称和简介筛选内置组件，保持原有搜索行为与 todo/clock 目录顺序。 */
const filteredComponents = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return components.value
  return components.value.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(keyword))
})

/** 从 Store 的安全目录投影构造第三方卡片，UI 不接触包文件、权限快照或 IndexedDB。 */
const filteredCustomComponents = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return customComponents.installedCatalog
    .map((entry) => ({
      componentId: entry.component.componentId,
      title: localize(entry.manifest.name),
      description: localize(entry.manifest.description),
      version: entry.component.activeVersion,
      enabled: entry.component.status === 'active',
      defaultVariant: entry.manifest.defaultVariant,
      defaultSize: entry.manifest.defaultSize,
      variants: entry.manifest.variants ?? [],
    }))
    .filter((item) => !keyword || `${item.title} ${item.description}`.toLowerCase().includes(keyword))
})

/** 判断当前屏幕是否已有内置组件；时钟允许同屏多个实例，行为保持不变。 */
function isAdded(id: BuiltinComponentId): boolean {
  const screen = ui.currentScreen
  return id === 'todo' && !!screen && launcher.hasTodoWidget(screen.id)
}

/** 把既有内置组件添加到当前屏幕，时钟继续先使用原有类型选择弹窗。 */
function addComponent(id: BuiltinComponentId): void {
  const screen = ui.currentScreen
  if (!screen || isAdded(id)) return
  if (id === 'todo') {
    launcher.addTodoWidget(screen.id)
    ui.closeModal()
  } else {
    ui.openModal({ type: 'clock-type-picker', screenId: screen.id })
  }
}

/** 为一个已安装第三方包创建新的 launcher 引用，复用阶段 3 的独立 instanceId 与网格放置规则。 */
function addInstalledCustomComponent(component: {
  readonly componentId: string
  readonly defaultVariant?: string
  readonly defaultSize: TileSize
  readonly variants: readonly { readonly id: string }[]
}): void {
  const screen = ui.currentScreen
  if (!screen) return
  if (component.variants.length >= 2) {
    ui.openModal({
      type: 'custom-component-variant-picker',
      componentId: component.componentId,
      screenId: screen.id,
    })
    return
  }
  launcher.addCustomWidget(screen.id, {
    componentId: component.componentId,
    ...(component.defaultVariant ? { variantId: component.defaultVariant } : {}),
    size: component.defaultSize,
  })
}

/** 收集当前 launcher 内该组件的全部实例，空 storage 实例也必须在更新时离屏握手。 */
function collectExistingCustomInstanceIds(componentId: string): readonly string[] {
  return launcher.screens.flatMap((screen) => screen.tiles.flatMap((tile) => (
    tile.type === 'widget' && tile.widgetType === 'custom' && tile.componentId === componentId
      ? [tile.instanceId]
      : []
  )))
}

/** 请求已安装组件的只读卸载预览；只有用户再次确认才会触发 IndexedDB 删除。 */
async function requestUninstall(componentId: string): Promise<void> {
  await customComponents.requestUninstall(componentId, collectExistingCustomInstanceIds(componentId).length)
}

/** 执行已确认的彻底卸载；Repository 事务失败时 Store 保留确认状态和全部 launcher 引用。 */
async function confirmUninstall(): Promise<void> {
  try {
    await customComponents.confirmUninstall((componentId) => {
      launcher.removeCustomWidgetsByComponent(componentId)
    })
  } catch {
    // UI 只保留稳定确认状态，不能把 IndexedDB 原始异常显示给用户。
  }
}

/** 打开内置组件详情，并以既有进入方向播放列表到详情过渡。 */
function openDetail(id: BuiltinComponentId): void {
  viewTransition.value = 'store-forward'
  detailId.value = id
}

/** 返回商店目录；若离开第三方审查则同时丢弃未安装的临时包，满足安装前不落库边界。 */
function closeDetail(): void {
  viewTransition.value = 'store-back'
  detailId.value = undefined
  if (showingReview.value) {
    showingReview.value = false
    customComponents.cancelPackageParsing()
  }
}

/** 选择本地 ZIP 后进入 Worker 静态审查；只有成功审查才自动切换到第三方详情页。 */
async function handleImport(file: File | undefined): Promise<void> {
  const reviewed = await importFile(file)
  if (reviewed && customComponents.review) {
    viewTransition.value = 'store-forward'
    detailId.value = undefined
    showingReview.value = true
  }
}

/** 在包与 launcher 屏幕都存在时，先原子安装再创建第一条轻量实例引用，失败则保留审查页供用户处理。 */
async function installAndAddReviewedComponent(): Promise<void> {
  const review = customComponents.review
  const screen = ui.currentScreen
  if (!review || !screen) return
  const componentId = review.manifest.id
  const defaultVariant = review.manifest.defaultVariant
  const defaultSize = review.manifest.defaultSize
  try {
    const result = await customComponents.installReviewedPackage({
      instanceIds: collectExistingCustomInstanceIds(componentId),
    })
    if (result !== 'installed') return
    if ((review.manifest.variants?.length ?? 0) >= 2) {
      ui.openModal({
        type: 'custom-component-variant-picker',
        componentId,
        screenId: screen.id,
      })
      return
    }
    launcher.addCustomWidget(screen.id, {
      componentId,
      ...(defaultVariant ? { variantId: defaultVariant } : {}),
      size: defaultSize,
    })
    ui.closeModal()
  } catch {
    // Store 已保留稳定错误码和审查状态，UI 不展示 Repository 原始异常。
  }
}

/** 关闭商店时终止仍在运行的解析并丢弃审查快照；安装写入期间禁止关闭以免留下无首实例的已安装包。 */
function closeStore(): void {
  if (customComponents.parsingStatus === 'installing') return
  cancelImport()
  customComponents.cancelUninstall()
  ui.closeModal()
}

onMounted(() => {
  void customComponents.ensureInstalledComponentsLoaded()
})
</script>

<template>
  <BaseModal :title="showingReview ? '' : t('modals.componentStore.title')" panel-class="w-[720px] max-h-[86vh] overflow-y-auto" @close="closeStore">
    <Transition :name="viewTransition" mode="out-in">
      <div v-if="!detailItem && !showingReview && !showingUninstall" key="list" class="space-y-5">
        <CustomComponentImportButton @select="handleImport" />
        <div
          v-if="componentSafety.globalSafeMode"
          class="flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex min-w-0 gap-3">
            <CircleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p class="text-sm font-semibold theme-heading">{{ t('modals.componentStore.safeModeTitle') }}</p>
              <p class="mt-1 text-xs leading-5 theme-muted">{{ t('modals.componentStore.safeModeText') }}</p>
            </div>
          </div>
          <button
            type="button"
            class="theme-subtle-button h-9 shrink-0 cursor-pointer rounded-xl px-3 text-sm"
            @click="componentSafety.exitSafeMode"
          >
            {{ t('modals.componentStore.exitSafeMode') }}
          </button>
        </div>
        <CustomComponentImportStatus
          :status="customComponents.parsingStatus"
          :source-name="customComponents.parsingSourceName"
          :error-code="customComponents.parsingErrorCode"
          :error-path="customComponents.parsingErrorPath"
          @cancel="cancelImport"
          @dismiss="customComponents.cancelPackageParsing"
        />
        <input
          v-model="query"
          type="search"
          :placeholder="t('modals.componentStore.searchPlaceholder')"
          class="theme-input theme-input-border h-11 w-full rounded-2xl border px-4 text-sm outline-none focus:border-sky-400"
        >

        <div class="grid gap-4 sm:grid-cols-2">
          <ComponentStoreItem
            v-for="item in filteredComponents"
            :key="item.id"
            :title="item.title"
            :description="item.description"
            :icon="item.icon"
            :added="isAdded(item.id)"
            @add="addComponent(item.id)"
            @open="openDetail(item.id)"
          >
            <template #preview>
              <div class="pointer-events-none h-full w-full max-w-[270px]">
                <TodoWidget v-if="item.id === 'todo'" tile-id="component-store-preview-todo" />
                <ClockWidget
                  v-else
                  tile-id="component-store-preview-clock"
                  :preview-config="clockPreviews.time"
                />
              </div>
            </template>
          </ComponentStoreItem>
          <CustomComponentCatalogItem
            v-for="component in filteredCustomComponents"
            :key="component.componentId"
            :title="component.title"
            :description="component.description"
            :version="component.version"
            :enabled="component.enabled"
            @add="addInstalledCustomComponent(component)"
            @uninstall="requestUninstall(component.componentId)"
          />
          <div
            v-if="filteredComponents.length === 0 && filteredCustomComponents.length === 0"
            class="theme-surface theme-muted rounded-[1.75rem] px-4 py-14 text-center text-sm sm:col-span-2"
          >
            {{ t('modals.componentStore.empty') }}
          </div>
        </div>
      </div>

      <ComponentStoreDetail
        v-else-if="detailItem"
        key="builtin-detail"
        :title="detailItem.title"
        :version="detailItem.version"
        :developer="detailItem.developer"
        :description="detailItem.description"
        :detail="detailItem.detail"
        :icon="detailItem.icon"
        :added="isAdded(detailItem.id)"
        @back="closeDetail"
        @add="addComponent(detailItem.id)"
      >
        <template #slide="{ size, boxStyle }: { size: TileSize; boxStyle: Record<string, string> }">
          <div class="pointer-events-none" :style="boxStyle">
            <TodoWidget v-if="detailItem.id === 'todo'" tile-id="component-store-preview-todo" :preview-size="size" />
            <ClockWidget
              v-else
              tile-id="component-store-preview-clock"
              :preview-size="size"
              :preview-config="clockPreviews[clockPreviewType(size)]"
            />
          </div>
        </template>
      </ComponentStoreDetail>

      <CustomComponentReview
        v-else-if="showingReview && customComponents.review"
        key="custom-review"
        :review="customComponents.review"
        :permission-grants="customComponents.permissionGrants"
        :network-grants="customComponents.networkGrants"
        :can-install="customComponents.canInstallReview"
        :installing="customComponents.parsingStatus === 'installing'"
        :update-diff="customComponents.updateDiff"
        :update-pending="customComponents.updateState.status === 'awaiting-confirmation'"
        @back="closeDetail"
        @install="installAndAddReviewedComponent"
        @permission-change="customComponents.setPermissionGrant"
        @network-change="customComponents.confirmNetworkGrant"
      />

      <section
        v-else-if="customComponents.uninstallState.status === 'awaiting-confirmation'"
        key="custom-uninstall"
        class="space-y-5 py-2"
      >
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-600">
            <Trash2 class="h-5 w-5" />
          </span>
          <div>
            <h3 class="text-lg font-semibold theme-heading">{{ t('modals.componentStore.uninstallTitle') }}</h3>
            <p class="mt-1 text-sm leading-6 theme-muted">{{ t('modals.componentStore.uninstallText') }}</p>
          </div>
        </div>
        <div class="theme-surface space-y-2 rounded-2xl border p-4 text-sm theme-muted">
          <p>{{ t('modals.componentStore.uninstallInstances', { count: customComponents.uninstallState.instanceCount }) }}</p>
          <p>{{ t('modals.componentStore.uninstallData', { count: customComponents.uninstallState.preview.instanceDataEntryCount, bytes: customComponents.uninstallState.preview.instanceDataBytes }) }}</p>
          <p>{{ t('modals.componentStore.uninstallVersions', { count: customComponents.uninstallState.preview.versionCount }) }}</p>
        </div>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="theme-subtle-button h-10 cursor-pointer rounded-xl px-4 text-sm"
            @click="customComponents.cancelUninstall"
          >
            {{ t('modals.componentStore.cancelUninstall') }}
          </button>
          <button
            type="button"
            class="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-medium text-white"
            @click="confirmUninstall"
          >
            <Trash2 class="h-4 w-4" />
            {{ t('modals.componentStore.confirmUninstall') }}
          </button>
        </div>
      </section>
    </Transition>
  </BaseModal>
</template>

<style scoped>
.store-forward-enter-active,
.store-forward-leave-active,
.store-back-enter-active,
.store-back-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.store-forward-enter-from { opacity: 0; transform: translateX(48px); }
.store-forward-leave-to { opacity: 0; transform: translateX(-48px); }
.store-back-enter-from { opacity: 0; transform: translateX(-48px); }
.store-back-leave-to { opacity: 0; transform: translateX(48px); }
</style>
