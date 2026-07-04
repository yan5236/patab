<script setup lang="ts">
/**
 * TodoWidget —— 待办事项小组件（设计稿中的示例小组件）
 * 支持添加 / 勾选完成 / 悬停删除；数据由 launcher store 持久化
 */
import { ref } from 'vue'
import { Plus, X } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import WidgetShell from './WidgetShell.vue'

defineProps<{ tileId: string }>()

const launcher = useLauncherStore()
const draft = ref('')

function submit() {
  launcher.addTodo(draft.value)
  draft.value = ''
}
</script>

<template>
  <WidgetShell :tile-id="tileId" title="待办事项">
    <div class="flex h-full flex-col gap-1.5">
      <!-- 待办列表 -->
      <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        <div
          v-for="todo in launcher.todos"
          :key="todo.id"
          class="group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/40"
        >
          <input
            type="checkbox"
            :checked="todo.done"
            class="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
            @change="launcher.toggleTodo(todo.id)"
          >
          <span
            class="min-w-0 flex-1 truncate text-sm"
            :class="todo.done ? 'text-neutral-400 line-through' : 'text-neutral-700'"
          >
            {{ todo.text }}
          </span>
          <button
            class="shrink-0 cursor-pointer rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
            title="删除"
            @click="launcher.removeTodo(todo.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          v-if="launcher.todos.length === 0"
          class="flex h-full items-center justify-center text-xs text-neutral-500"
        >
          暂无待办，输入后回车添加
        </div>
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
