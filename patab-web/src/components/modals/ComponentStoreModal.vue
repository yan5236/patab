<script setup lang="ts">
/**
 * ComponentStoreModal —— 从 Dock 打开的组件商店弹窗
 * 负责搜索可添加组件，并把选中的组件添加到当前应用屏幕。
 */
import { computed, ref } from 'vue'
import { ListTodo } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/common/BaseModal.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import TodoWidget from '@/components/widgets/TodoWidget.vue'
import ComponentStoreItem from './ComponentStoreItem.vue'

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()
const query = ref('')

const components = computed(() => [
  {
    id: 'todo',
    title: t('modals.componentStore.todoTitle'),
    description: t('modals.componentStore.todoDescription'),
    icon: ListTodo,
  },
])

/** 按名称和简介搜索组件，保持商店结果简单可预期 */
const filteredComponents = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return components.value
  return components.value.filter((item) =>
    `${item.title} ${item.description}`.toLowerCase().includes(keyword),
  )
})

/** 判断当前屏幕是否已经添加过指定组件 */
function isAdded(id: string): boolean {
  const screen = ui.currentScreen
  return id === 'todo' && !!screen && launcher.hasTodoWidget(screen.id)
}

/** 把指定组件添加到当前应用屏幕，成功后关闭商店 */
function addComponent(id: string) {
  const screen = ui.currentScreen
  if (!screen || isAdded(id)) return
  if (id === 'todo') launcher.addTodoWidget(screen.id)
  ui.closeModal()
}
</script>

<template>
  <BaseModal :title="t('modals.componentStore.title')" panel-class="w-[720px] max-h-[86vh] overflow-y-auto" @close="ui.closeModal()">
    <div class="space-y-5">
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
        >
          <template #preview>
            <div class="pointer-events-none h-full w-full max-w-[270px]">
              <TodoWidget tile-id="component-store-preview-todo" />
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
  </BaseModal>
</template>
