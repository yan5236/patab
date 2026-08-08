<script setup lang="ts">
/**
 * ComponentStoreModal —— 从 Dock 打开的组件商店弹窗
 * 列表视图：搜索可添加组件，并把选中的组件添加到当前应用屏幕；
 * 详情视图：点击卡片 / 标题进入，展示组件各尺寸形态与详细信息（左右滑动切换动画）。
 */
import { computed, ref } from 'vue'
import { Clock as ClockIcon, ListTodo } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/common/BaseModal.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import TodoWidget from '@/components/widgets/TodoWidget.vue'
import ClockWidget from '@/components/widgets/clock/ClockWidget.vue'
import ComponentStoreItem from './ComponentStoreItem.vue'
import ComponentStoreDetail from './ComponentStoreDetail.vue'
import { defaultClockConfig } from '@/utils/clock'
import type { ClockConfig, ClockType, TileSize } from '@/types'

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()
const query = ref('')

const components = computed(() => [
  {
    id: 'todo',
    title: t('modals.componentStore.todoTitle'),
    description: t('modals.componentStore.todoDescription'),
    detail: t('modals.componentStore.todoDetail'),
    icon: ListTodo,
    version: '1.0.0',
    developer: 'Patab',
  },
  {
    id: 'clock',
    title: t('modals.componentStore.clockTitle'),
    description: t('modals.componentStore.clockDescription'),
    detail: t('modals.componentStore.clockDetail'),
    icon: ClockIcon,
    version: '1.0.0',
    developer: 'Patab',
  },
])

/** 时钟预览用的固定配置（避免预览触发真实图块查找与响铃） */
const clockPreviews: Record<ClockType, ClockConfig> = {
  time: defaultClockConfig('time'),
  stopwatch: defaultClockConfig('stopwatch'),
  timer: defaultClockConfig('timer'),
}

/** 详情走马灯按尺寸形态轮换展示三种时钟类型（1×1 / 2×2 为时间，3×2 秒表，4×2 计时器） */
function clockPreviewType(size: TileSize): ClockType {
  if (size.w === 3) return 'stopwatch'
  if (size.w === 4) return 'timer'
  return 'time'
}

/** 当前打开的详情组件 id；null 表示处于列表视图 */
const detailId = ref<string | null>(null)
/** 列表 ↔ 详情 切换动画方向（进入详情向左推进，返回向右退回） */
const viewTransition = ref<'store-forward' | 'store-back'>('store-forward')

const detailItem = computed(() => components.value.find((item) => item.id === detailId.value) ?? null)

/** 按名称和简介搜索组件，保持商店结果简单可预期 */
const filteredComponents = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return components.value
  return components.value.filter((item) =>
    `${item.title} ${item.description}`.toLowerCase().includes(keyword),
  )
})

/** 判断当前屏幕是否已经添加过指定组件（时钟允许同屏多个，永不置灰） */
function isAdded(id: string): boolean {
  const screen = ui.currentScreen
  return id === 'todo' && !!screen && launcher.hasTodoWidget(screen.id)
}

/** 把指定组件添加到当前应用屏幕；时钟先弹类型选择，不直接添加 */
function addComponent(id: string) {
  const screen = ui.currentScreen
  if (!screen || isAdded(id)) return
  if (id === 'todo') {
    launcher.addTodoWidget(screen.id)
    ui.closeModal()
  } else if (id === 'clock') {
    ui.openModal({ type: 'clock-type-picker', screenId: screen.id })
  }
}

function openDetail(id: string) {
  viewTransition.value = 'store-forward'
  detailId.value = id
}

function closeDetail() {
  viewTransition.value = 'store-back'
  detailId.value = null
}
</script>

<template>
  <BaseModal :title="detailItem ? '' : t('modals.componentStore.title')" panel-class="w-[720px] max-h-[86vh] overflow-y-auto" @close="ui.closeModal()">
    <Transition :name="viewTransition" mode="out-in">
      <div v-if="!detailItem" key="list" class="space-y-5">
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
                  v-else-if="item.id === 'clock'"
                  tile-id="component-store-preview-clock"
                  :preview-config="clockPreviews.time"
                />
              </div>
            </template>
          </ComponentStoreItem>
          <div
            v-if="filteredComponents.length === 0"
            class="theme-surface theme-muted rounded-[1.75rem] px-4 py-14 text-center text-sm sm:col-span-2"
          >
            {{ t('modals.componentStore.empty') }}
          </div>
        </div>
      </div>

      <ComponentStoreDetail
        v-else
        key="detail"
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
              v-else-if="detailItem.id === 'clock'"
              tile-id="component-store-preview-clock"
              :preview-size="size"
              :preview-config="clockPreviews[clockPreviewType(size)]"
            />
          </div>
        </template>
      </ComponentStoreDetail>
    </Transition>
  </BaseModal>
</template>

<style scoped>
/* 列表 → 详情：详情从右侧滑入，列表向左淡出 */
.store-forward-enter-active,
.store-forward-leave-active,
.store-back-enter-active,
.store-back-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.store-forward-enter-from {
  opacity: 0;
  transform: translateX(48px);
}
.store-forward-leave-to {
  opacity: 0;
  transform: translateX(-48px);
}

/* 详情 → 列表：反向退回 */
.store-back-enter-from {
  opacity: 0;
  transform: translateX(-48px);
}
.store-back-leave-to {
  opacity: 0;
  transform: translateX(48px);
}
</style>
