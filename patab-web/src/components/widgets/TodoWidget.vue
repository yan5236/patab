<script setup lang="ts">
/**
 * TodoWidget —— 待办事项小组件
 *
 * 保留快速添加/查看能力；支持展开弹窗、编辑文本、重要标记、
 * 已完成折叠与长按拖拽排序。
 */
import { computed, nextTick, ref } from 'vue'
import { Maximize2, Plus, Star, Trash2, X } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useTodoDrag } from '@/composables/useTodoDrag'
import WidgetShell from './WidgetShell.vue'
import type { TodoItem } from '@/types'

const props = defineProps<{ tileId: string }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const draft = ref('')
const showCompleted = ref(false)
const listRef = ref<HTMLElement | null>(null)

const editingId = ref<string | null>(null)
const editingText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

const todayStr = new Date().toISOString().slice(0, 10)

const sortedTodos = computed(() => [...launcher.todos].sort((a, b) => a.order - b.order))
const activeTodos = computed(() => sortedTodos.value.filter((t) => !t.done))
const completedTodos = computed(() => sortedTodos.value.filter((t) => t.done))

const todoIds = computed(() => sortedTodos.value.map((t) => t.id))
const {
  draggingId,
  indicatorIndex,
  indicatorStyle,
  onPointerDown,
} = useTodoDrag({
  containerRef: listRef,
  ids: todoIds,
  onReorder: (orderedIds) => launcher.setTodoOrder(orderedIds),
})

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function submit() {
  launcher.addTodo(draft.value, { date: localIso(new Date()) })
  draft.value = ''
}

function openModal() {
  ui.openModal({ type: 'todo' })
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

function formatDate(date?: string): string {
  if (!date) return ''
  const [, m, d] = date.split('-')
  return `${m}-${d}`
}
</script>

<template>
  <WidgetShell :tile-id="tileId" title="待办事项">
    <template #actions>
      <button
        class="cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-white/40 hover:text-neutral-700"
        title="展开"
        @click="openModal"
      >
        <Maximize2 class="h-3.5 w-3.5" />
      </button>
    </template>

    <div class="flex h-full flex-col gap-1.5">
      <!-- 待办列表 -->
      <div
        ref="listRef"
        class="relative min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
      >
        <div
          v-for="todo in activeTodos"
          :key="todo.id"
          :data-reorder-id="todo.id"
          class="group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/40"
          :class="draggingId === todo.id ? 'opacity-30' : 'opacity-100'"
          @pointerdown="(e) => onPointerDown(e, todo.id)"
        >
          <input
            type="checkbox"
            :checked="todo.done"
            class="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
            @change="launcher.toggleTodo(todo.id)"
          >

          <div class="min-w-0 flex-1">
            <div v-if="editingId === todo.id" class="flex items-center gap-1">
              <input
                ref="editInputRef"
                v-model="editingText"
                type="text"
                class="h-5 w-full rounded bg-white/70 px-1 text-xs text-neutral-700 outline-none"
                @keydown.enter="commitEdit"
                @keydown.esc="cancelEdit"
                @blur="commitEdit"
              >
            </div>
            <template v-else>
              <span
                class="block cursor-text truncate text-sm text-neutral-700"
                @click="startEdit(todo)"
              >
                {{ todo.text }}
              </span>
              <span v-if="todo.date" class="mt-0.5 inline-block rounded-md bg-sky-100 px-1 py-0.5 text-[9px] font-medium text-sky-600">
                {{ formatDate(todo.date) }}
              </span>
            </template>
          </div>

          <button
            class="mobile-action-btn shrink-0 rounded p-0.5 transition-colors"
            :class="todo.important ? 'text-amber-400 hover:text-amber-500' : 'text-neutral-400 opacity-0 hover:text-amber-400 group-hover:opacity-100 max-sm:opacity-100'"
            title="重要"
            @click="toggleImportant(todo)"
          >
            <Star class="h-3.5 w-3.5" :class="todo.important ? 'fill-current' : ''" />
          </button>
          <button
            class="mobile-action-btn shrink-0 cursor-pointer rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 max-sm:opacity-100"
            title="删除"
            @click="deleteTodo(todo)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- 已完成折叠 -->
        <div v-if="completedTodos.length > 0" class="pt-1">
          <button
            class="flex w-full cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-left text-[10px] font-medium text-neutral-500 transition-colors hover:bg-white/40"
            type="button"
            @click="showCompleted = !showCompleted"
          >
            <X v-if="showCompleted" class="h-3 w-3" />
            <Plus v-else class="h-3 w-3" />
            已完成 ({{ completedTodos.length }})
          </button>

          <div v-if="showCompleted" class="mt-1 space-y-1">
            <div
              v-for="todo in completedTodos"
              :key="todo.id"
              :data-reorder-id="todo.id"
              class="group flex items-center gap-2 rounded-lg px-1.5 py-1"
              :class="draggingId === todo.id ? 'opacity-30' : 'opacity-100'"
              @pointerdown="(e) => onPointerDown(e, todo.id)"
            >
              <input
                type="checkbox"
                :checked="todo.done"
                class="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
                @change="launcher.toggleTodo(todo.id)"
              >
              <span class="min-w-0 flex-1 truncate text-sm text-neutral-400 line-through">
                {{ todo.text }}
              </span>
              <button
                class="shrink-0 cursor-pointer rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                title="删除"
                @click="deleteTodo(todo)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="launcher.todos.length === 0"
          class="flex h-full items-center justify-center text-xs text-neutral-500"
        >
          暂无待办，输入后回车添加
        </div>

        <div
          v-if="indicatorStyle"
          class="pointer-events-none absolute z-10 rounded-full bg-sky-500"
          :style="{ ...indicatorStyle, position: 'absolute' }"
        />
      </div>

      <!-- 新增输入框 -->
      <div class="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/50 px-2 py-1">
        <input
          v-model="draft"
          type="text"
          placeholder="添加待办…"
          class="h-6 min-w-0 flex-1 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-500"
          @keydown.enter="submit"
        >
        <button
          class="shrink-0 cursor-pointer rounded p-0.5 text-neutral-500 hover:text-neutral-700"
          title="添加"
          @click="submit"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>
    </div>
  </WidgetShell>
</template>

<style scoped>
/* 触屏设备无 hover，强制显示操作按钮 */
@media (hover: none) and (pointer: coarse) {
  .mobile-action-btn {
    opacity: 1 !important;
  }
}
</style>
