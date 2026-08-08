<script setup lang="ts">
/**
 * TodoWidget —— 待办事项小组件
 *
 * 保留快速添加/查看能力；支持展开弹窗、编辑文本、重要标记、
 * 已完成折叠与长按拖拽排序。
 * 支持多尺寸（1×1 / 2×2 / 3×2 / 4×2）：缩到 1×1 时退化为应用图标，
 * 点击直接打开待办弹窗，右键仍可调整尺寸 / 移除。
 */
import { computed, nextTick, ref } from 'vue'
import { Expand, ListChecks, Maximize2, Plus, Star, Trash2, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useTodoDrag } from '@/composables/useTodoDrag'
import { tileSize } from '@/utils/grid'
import WidgetShell from './WidgetShell.vue'
import type { TileSize, TodoItem } from '@/types'

const props = defineProps<{
  tileId: string
  /** 商店详情预览用：强制以指定格数尺寸渲染（不依赖真实图块） */
  previewSize?: TileSize
}>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()
const draft = ref('')
const showCompleted = ref(false)
const listRef = ref<HTMLElement | null>(null)

const editingId = ref<string | null>(null)
const editingText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

const todayStr = new Date().toISOString().slice(0, 10)

/** 本小组件图块（用于读取自定义尺寸） */
const tile = computed(() => {
  for (const screen of launcher.screens) {
    const found = screen.tiles.find((item) => item.id === props.tileId)
    if (found) return found
  }
  return undefined
})

/** 缩到 1×1 时退化为普通应用图标：点击打开待办弹窗 */
const isIcon = computed(() => {
  const size = props.previewSize ?? (tile.value ? tileSize(tile.value) : undefined)
  return !!size && size.w === 1 && size.h === 1
})

/** 图标形态的右键菜单（与 WidgetShell 保持一致：调整尺寸 / 移除） */
function onIconMenu(event: MouseEvent) {
  ui.openContextMenu(event, [
    { label: t('screen.menu.resizeTile'), icon: Expand, action: () => ui.enterTileResize(props.tileId) },
    { label: t('widgets.remove'), icon: Trash2, danger: true, action: () => launcher.removeTile(props.tileId) },
  ])
}

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
  <!-- 1×1 图标形态：外观与快捷方式一致，点击打开待办弹窗；
       商店预览（previewSize）时改用主题色，避免白色玻璃样式在浅色预览底上看不清 -->
  <button
    v-if="isIcon"
    class="group flex w-full cursor-pointer flex-col items-center gap-1.5 pt-1.5"
    :title="t('todo.title')"
    @click="openModal"
    @contextmenu="onIconMenu"
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-2xl border shadow-md transition-transform duration-150 group-hover:scale-105"
      :class="previewSize
        ? 'theme-card-icon-bg theme-border'
        : 'border-white/40 bg-white/40 shadow-black/20 backdrop-blur-xl'"
    >
      <ListChecks class="h-8 w-8" :class="previewSize ? 'theme-text' : 'text-white drop-shadow'" />
    </div>
    <span
      class="max-w-full truncate px-1 text-xs"
      :class="previewSize ? 'theme-text' : 'text-white drop-shadow'"
    >{{ t('todo.title') }}</span>
  </button>
  <WidgetShell v-else :tile-id="tileId" :title="t('todo.title')">
    <template #actions>
      <button
        class="theme-subtle-button cursor-pointer rounded p-1 transition-colors"
        :title="t('widgets.expand')"
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
          class="theme-surface-hover group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
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
                class="theme-input h-5 w-full rounded px-1 text-xs outline-none"
                @keydown.enter="commitEdit"
                @keydown.esc="cancelEdit"
                @blur="commitEdit"
              >
            </div>
            <template v-else>
              <span
                class="theme-text block cursor-text truncate text-sm"
                @click="startEdit(todo)"
              >
                {{ todo.text }}
              </span>
              <span v-if="todo.date" class="theme-date-chip mt-0.5 inline-block rounded-md px-1 py-0.5 text-[9px] font-medium">
                {{ formatDate(todo.date) }}
              </span>
            </template>
          </div>

          <button
            class="mobile-action-btn shrink-0 rounded p-0.5 transition-colors"
            :class="todo.important ? 'text-amber-400 hover:text-amber-500' : 'theme-faint opacity-0 hover:text-amber-400 group-hover:opacity-100 max-sm:opacity-100'"
            :title="t('todo.important')"
            @click="toggleImportant(todo)"
          >
            <Star class="h-3.5 w-3.5" :class="todo.important ? 'fill-current' : ''" />
          </button>
          <button
            class="theme-faint mobile-action-btn shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 max-sm:opacity-100"
            :title="t('common.delete')"
            @click="deleteTodo(todo)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- 已完成折叠 -->
        <div v-if="completedTodos.length > 0" class="pt-1">
          <button
            class="theme-muted theme-surface-hover flex w-full cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-left text-[10px] font-medium transition-colors"
            type="button"
            @click="showCompleted = !showCompleted"
          >
            <X v-if="showCompleted" class="h-3 w-3" />
            <Plus v-else class="h-3 w-3" />
            {{ t('todo.completed', { count: completedTodos.length }) }}
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
              <span class="theme-faint min-w-0 flex-1 truncate text-sm line-through">
                {{ todo.text }}
              </span>
              <button
                class="theme-faint shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                :title="t('common.delete')"
                @click="deleteTodo(todo)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="launcher.todos.length === 0"
          class="theme-muted flex h-full items-center justify-center text-xs"
        >
          {{ t('todo.emptyWidget') }}
        </div>

        <div
          v-if="indicatorStyle"
          class="pointer-events-none absolute z-10 rounded-full bg-sky-500"
          :style="{ ...indicatorStyle, position: 'absolute' }"
        />
      </div>

      <!-- 新增输入框 -->
      <div class="theme-control flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1">
        <input
          v-model="draft"
          type="text"
          :placeholder="t('todo.addTodo')"
          class="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--theme-muted)]"
          @keydown.enter="submit"
        >
        <button
          class="theme-subtle-button shrink-0 cursor-pointer rounded p-0.5"
          :title="t('todo.add')"
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
