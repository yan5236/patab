<script setup lang="ts">
/**
 * TodoModal —— 待办事项管理弹窗
 *
 * 左侧列表栏（今天/所有/重要 + 自定义列表，可长按拖拽排序、新建列表）
 * 右侧内容区（按列表过滤、日期选择器创建 todo、编辑/重要/删除、已完成折叠、长按拖拽排序）
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Star,
  Trash2,
  X,
} from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { useTodoDrag } from '@/composables/useTodoDrag'
import type { TodoItem, TodoList } from '@/types'

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

const selectedListId = ref('all')
const draftText = ref('')
const draftDate = ref('')
const showCompleted = ref(false)

const listContainerRef = ref<HTMLElement | null>(null)
const todoContainerRef = ref<HTMLElement | null>(null)
const editingId = ref<string | null>(null)
const editingText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

const isAddingList = ref(false)
const newListName = ref('')
const newListInputRef = ref<HTMLInputElement | null>(null)

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const todayStr = localIso(new Date())

/** 所有列表按 order 排序 */
const sortedLists = computed(() =>
  [...launcher.todoLists].sort((a, b) => a.order - b.order),
)

const selectedList = computed<TodoList | undefined>(
  () => launcher.todoLists.find((l) => l.id === selectedListId.value),
)

/** 根据当前选中列表过滤 todo */
function matchesList(todo: TodoItem, listId: string): boolean {
  if (listId === 'all') return true
  if (listId === 'important') return todo.important
  if (listId === 'today') {
    if (todo.date === todayStr) return true
    if (!todo.date && !todo.listId) return true
    return false
  }
  return todo.listId === listId
}

/** 当前列表可见 todo，按 order 排序 */
const visibleTodos = computed(() =>
  launcher.todos
    .filter((t) => matchesList(t, selectedListId.value))
    .sort((a, b) => a.order - b.order),
)

const activeTodos = computed(() => visibleTodos.value.filter((t) => !t.done))
const completedTodos = computed(() => visibleTodos.value.filter((t) => t.done))

/** 列表中 todo 数量（用于侧边栏徽标） */
function listCount(list: TodoList): number {
  return launcher.todos.filter((t) => matchesList(t, list.id)).length
}

/** 默认日期为今天 */
draftDate.value = todayStr

function submitTodo() {
  const text = draftText.value.trim()
  if (!text) return
  const opts: { date?: string; important?: boolean; listId?: string } = {}
  if (draftDate.value) opts.date = draftDate.value
  if (selectedListId.value === 'important') opts.important = true
  if (selectedListId.value !== 'all' && selectedListId.value !== 'today' && selectedListId.value !== 'important') {
    opts.listId = selectedListId.value
  }
  launcher.addTodo(text, opts)
  draftText.value = ''
  // 重置为今天，保持默认行为
  draftDate.value = todayStr
}

function startEdit(todo: TodoItem) {
  editingId.value = todo.id
  editingText.value = todo.text
  nextTick(() => editInputRef.value?.focus())
}

function commitEdit() {
  if (editingId.value) {
    launcher.updateTodo(editingId.value, { text: editingText.value })
  }
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function toggleImportant(todo: TodoItem) {
  launcher.updateTodo(todo.id, { important: !todo.important })
}

function deleteTodo(todo: TodoItem) {
  launcher.removeTodo(todo.id)
}

function createList() {
  const name = newListName.value.trim()
  if (!name) return
  launcher.addTodoList(name)
  newListName.value = ''
  isAddingList.value = false
}

function cancelAddList() {
  isAddingList.value = false
  newListName.value = ''
}

function startAddList() {
  isAddingList.value = true
  nextTick(() => newListInputRef.value?.focus())
}

function onListContextMenu(event: MouseEvent, list: TodoList) {
  if (list.system) return
  ui.openContextMenu(event, [
    {
      label: t('todo.deleteList'),
      icon: Trash2,
      danger: true,
      action: () => launcher.removeTodoList(list.id),
    },
  ])
}

/* ---------- 列表拖拽排序 ---------- */
const listIds = computed(() => sortedLists.value.map((l) => l.id))
const {
  draggingId: draggingListId,
  indicatorIndex: listIndicatorIndex,
  indicatorStyle: listIndicatorStyle,
  onPointerDown: onListPointerDown,
} = useTodoDrag({
  containerRef: listContainerRef,
  ids: listIds,
  onReorder: (orderedIds) => launcher.setTodoListOrder(orderedIds),
})

/* ---------- Todo 拖拽排序 ---------- */
const visibleTodoIds = computed(() => visibleTodos.value.map((t) => t.id))
const {
  draggingId: draggingTodoId,
  indicatorIndex: todoIndicatorIndex,
  indicatorStyle: todoIndicatorStyle,
  onPointerDown: onTodoPointerDown,
} = useTodoDrag({
  containerRef: todoContainerRef,
  ids: visibleTodoIds,
  onReorder: (orderedIds) => launcher.setTodoOrder(orderedIds),
})

function formatDate(date?: string): string {
  if (!date) return ''
  const [, m, d] = date.split('-')
  return `${m}-${d}`
}

/** 系统智能列表名称跟随语言，自定义列表保留用户命名 */
function listName(list?: TodoList): string {
  if (!list) return t('todo.lists.all')
  return list.system ? t(`todo.lists.${list.system}`) : list.name
}
</script>

<template>
  <BaseModal
    :title="t('todo.title')"
    panel-class="todo-modal-card flex flex-col !h-[600px] !w-[800px] max-h-[92vh] max-w-[94vw] overflow-hidden !p-4 sm:!p-6"
    @close="ui.closeModal()"
  >
    <div class="todo-body theme-setting-shell flex flex-1 min-h-0 overflow-hidden rounded-2xl">
      <!-- 左侧列表栏 -->
      <aside
        ref="listContainerRef"
        class="theme-setting-tabs relative w-40 shrink-0 overflow-y-auto p-2"
      >
        <div
          v-for="list in sortedLists"
          :key="list.id"
          :data-reorder-id="list.id"
          role="button"
          tabindex="0"
          class="mb-1 flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors select-none"
          :class="[
            selectedListId === list.id
              ? 'theme-tab-active shadow-sm'
              : 'theme-tab-idle',
            draggingListId === list.id ? 'opacity-30' : 'opacity-100',
          ]"
          @pointerdown="(e) => onListPointerDown(e, list.id)"
          @click="selectedListId = list.id"
          @contextmenu.prevent="(e) => onListContextMenu(e, list)"
          @keydown.enter="selectedListId = list.id"
        >
          <span class="truncate">{{ listName(list) }}</span>
          <span class="theme-faint ml-2 shrink-0 text-xs">{{ listCount(list) }}</span>
        </div>

        <div
          v-if="listIndicatorStyle"
          class="pointer-events-none absolute z-10 rounded-full bg-sky-500"
          :style="{ ...listIndicatorStyle, position: 'absolute' }"
        />

        <div class="theme-divider mt-2 border-t pt-2">
          <button
            v-if="!isAddingList"
            class="theme-subtle-button flex w-full cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-left text-sm transition-colors"
            type="button"
            @click="startAddList"
          >
            <Plus class="h-4 w-4" />
            {{ t('todo.newList') }}
          </button>
          <div
            v-else
            class="theme-control flex items-center gap-1 rounded-xl px-2 py-1.5"
          >
            <input
              ref="newListInputRef"
              v-model="newListName"
              type="text"
              :placeholder="t('todo.listName')"
              class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--theme-muted)]"
              @keydown.enter="createList"
              @keydown.esc="cancelAddList"
              @blur="createList"
            >
            <button
              class="theme-subtle-button shrink-0 rounded p-1"
              type="button"
              @click="cancelAddList"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <section class="flex min-w-0 flex-1 flex-col">
        <div class="theme-divider hidden shrink-0 border-b px-5 py-3 sm:block">
          <h3 class="theme-heading text-base font-semibold">
            {{ listName(selectedList) }}
          </h3>
        </div>

        <div class="flex min-h-0 flex-1 flex-col px-3 py-2 sm:px-5 sm:py-3">
          <!-- 创建输入框 -->
          <div class="theme-control mb-3 flex shrink-0 items-center gap-2 rounded-xl px-3 py-2">
            <DatePicker v-model="draftDate" :placeholder="t('todo.date')" />
            <input
              v-model="draftText"
              type="text"
              :placeholder="t('todo.addTodo')"
              class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--theme-muted)]"
              @keydown.enter="submitTodo"
            >
            <button
              class="shrink-0 cursor-pointer rounded-lg bg-sky-500 p-1.5 text-white transition-colors hover:bg-sky-600"
              type="button"
              :title="t('todo.add')"
              @click="submitTodo"
            >
              <Plus class="h-4 w-4" />
            </button>
          </div>

          <!-- 待办列表 -->
          <div
            ref="todoContainerRef"
            class="relative min-h-0 flex-1 overflow-y-auto"
          >
            <div v-if="visibleTodos.length === 0" class="theme-muted flex h-full items-center justify-center text-sm">
              {{ t('todo.empty') }}
            </div>

            <div v-else class="space-y-1">
              <!-- 进行中 -->
              <div
                v-for="todo in activeTodos"
                :key="todo.id"
                :data-reorder-id="todo.id"
                class="theme-surface group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors"
                :class="draggingTodoId === todo.id ? 'opacity-30' : 'opacity-100'"
                @pointerdown="(e) => onTodoPointerDown(e, todo.id)"
              >
                <input
                  type="checkbox"
                  :checked="todo.done"
                  class="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
                  @change="launcher.toggleTodo(todo.id)"
                >

                <div class="min-w-0 flex-1">
                  <div v-if="editingId === todo.id" class="flex items-center gap-1.5">
                    <input
                      ref="editInputRef"
                      v-model="editingText"
                      type="text"
                      class="theme-input h-7 w-full rounded-lg px-2 text-sm outline-none"
                      @keydown.enter="commitEdit"
                      @keydown.esc="cancelEdit"
                      @blur="commitEdit"
                    >
                    <button class="shrink-0 rounded p-1 text-emerald-500 hover:text-emerald-600" @click="commitEdit">
                      <Check class="h-4 w-4" />
                    </button>
                  </div>
                  <div v-else>
                    <p
                      class="theme-text cursor-text text-sm"
                      @click="startEdit(todo)"
                    >
                      {{ todo.text }}
                    </p>
                    <span v-if="todo.date" class="theme-date-chip mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                      {{ formatDate(todo.date) }}
                    </span>
                  </div>
                </div>

                <button
                  class="mobile-action-btn shrink-0 rounded p-1 transition-colors"
                  :class="todo.important ? 'text-amber-400 hover:text-amber-500' : 'theme-faint opacity-0 hover:text-amber-400 group-hover:opacity-100 max-sm:opacity-100'"
                  :title="t('todo.important')"
                  @click="toggleImportant(todo)"
                >
                  <Star class="h-4 w-4" :class="todo.important ? 'fill-current' : ''" />
                </button>
                <button
                  class="theme-faint mobile-action-btn shrink-0 rounded p-1 opacity-0 transition-colors hover:text-red-500 group-hover:opacity-100 max-sm:opacity-100"
                  :title="t('common.delete')"
                  @click="deleteTodo(todo)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>

              <!-- 已完成折叠区 -->
              <div v-if="completedTodos.length > 0" class="pt-2">
                <button
                  class="theme-muted theme-surface-hover flex w-full cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-left text-xs font-medium transition-colors"
                  type="button"
                  @click="showCompleted = !showCompleted"
                >
                  <ChevronRight v-if="!showCompleted" class="h-3.5 w-3.5" />
                  <ChevronDown v-else class="h-3.5 w-3.5" />
                  {{ t('todo.completed', { count: completedTodos.length }) }}
                </button>

                <div v-if="showCompleted" class="mt-1 space-y-1">
                  <div
                    v-for="todo in completedTodos"
                    :key="todo.id"
                    :data-reorder-id="todo.id"
                    class="theme-surface group flex items-center gap-2 rounded-xl px-2.5 py-2"
                    :class="draggingTodoId === todo.id ? 'opacity-30' : 'opacity-100'"
                    @pointerdown="(e) => onTodoPointerDown(e, todo.id)"
                  >
                    <input
                      type="checkbox"
                      :checked="todo.done"
                      class="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
                      @change="launcher.toggleTodo(todo.id)"
                    >
                    <div class="min-w-0 flex-1">
                      <p class="theme-faint text-sm line-through">
                        {{ todo.text }}
                      </p>
                      <span v-if="todo.date" class="theme-date-chip mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                        {{ formatDate(todo.date) }}
                      </span>
                    </div>
                    <button
                      class="theme-faint mobile-action-btn shrink-0 rounded p-1 opacity-0 transition-colors hover:text-red-500 group-hover:opacity-100 max-sm:opacity-100"
                      :title="t('common.delete')"
                      @click="deleteTodo(todo)"
                    >
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="todoIndicatorStyle"
              class="pointer-events-none absolute z-10 rounded-full bg-sky-500"
              :style="{ ...todoIndicatorStyle, position: 'absolute' }"
            />
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button
        class="theme-subtle-button cursor-pointer rounded-xl px-4 py-2 text-sm transition-colors"
        @click="ui.closeModal()"
      >
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
/* 触屏设备无 hover，强制显示操作按钮 */
@media (hover: none) and (pointer: coarse) {
  .mobile-action-btn {
    opacity: 1 !important;
  }
}

@media (max-width: 640px) {
  .todo-body {
    flex-direction: column;
  }

  aside {
    width: 100%;
    max-height: 34%;
    border-right: none;
    border-bottom: 1px solid var(--theme-panel-border);
  }
}
</style>
