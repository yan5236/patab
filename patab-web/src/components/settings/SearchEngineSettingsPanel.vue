<script setup lang="ts">
/**
 * SearchEngineSettingsPanel —— 搜索引擎设置面板
 * 负责搜索引擎草稿的增删改选，保存时机仍由 SettingsModal 统一控制。
 */
import { computed, ref } from 'vue'
import { Check, Pencil, Plus, Trash2 } from '@lucide/vue'
import type { SearchEngine } from '@/types'
import {
  createSearchEngineId,
  isSearchTemplateValid,
  normalizeSearchTemplate,
  siteFromSearchTemplate,
} from '@/utils/searchEngines'
import { colorForName } from '@/utils/favicon'
import AppIcon from '@/components/common/AppIcon.vue'
import SearchEngineDialog from '@/components/settings/SearchEngineDialog.vue'

const selectedEngine = defineModel<string>('selectedEngine', { required: true })
const engines = defineModel<SearchEngine[]>('engines', { required: true })

const editingId = ref('')
const engineName = ref('')
const urlTemplate = ref('')
const error = ref('')
const dialogOpen = ref(false)

const isEditing = computed(() => !!editingId.value)

/** 选择当前默认搜索引擎 */
function selectEngine(id: string) {
  selectedEngine.value = id
}

/** 用当前列表生成不重复的搜索引擎 ID */
function makeEngineId(): string {
  const base = createSearchEngineId()
  let id = base
  let index = 1
  while (engines.value.some((engine) => engine.id === id)) {
    id = `${base}-${index}`
    index += 1
  }
  return id
}

/** 清空表单并回到新增状态 */
function resetForm() {
  editingId.value = ''
  engineName.value = ''
  urlTemplate.value = ''
  error.value = ''
  dialogOpen.value = false
}

/** 打开添加搜索引擎弹窗 */
function openAddDialog() {
  editingId.value = ''
  engineName.value = ''
  urlTemplate.value = ''
  error.value = ''
  dialogOpen.value = true
}

/** 把已有引擎填入表单，准备修改 */
function editEngine(engine: SearchEngine) {
  editingId.value = engine.id
  engineName.value = engine.name
  urlTemplate.value = engine.urlTemplate
  error.value = ''
  dialogOpen.value = true
}

/** 删除搜索引擎；删除当前项后自动选择剩余第一项，删空则禁用搜索 */
function deleteEngine(id: string) {
  engines.value = engines.value.filter((engine) => engine.id !== id)
  if (selectedEngine.value === id) selectedEngine.value = engines.value[0]?.id ?? ''
  if (editingId.value === id) resetForm()
}

/** 新增或保存搜索引擎，搜索模板会统一归一化为 {q} 占位 */
function saveEngine() {
  const name = engineName.value.trim()
  const template = normalizeSearchTemplate(urlTemplate.value)
  if (!name) {
    error.value = '请填写搜索引擎名称。'
    return
  }
  if (!isSearchTemplateValid(template)) {
    error.value = '搜索地址必须包含 {q} 或 %s，例如 https://example.com/search?q={q}'
    return
  }

  if (editingId.value) {
    engines.value = engines.value.map((engine) =>
      engine.id === editingId.value ? { ...engine, name, urlTemplate: template } : engine,
    )
  } else {
    const next = { id: makeEngineId(), name, urlTemplate: template }
    engines.value = [...engines.value, next]
    selectedEngine.value = next.id
  }
  resetForm()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-neutral-800">搜索</h3>
        <p class="mt-0.5 text-xs text-neutral-500">管理搜索栏可选的搜索引擎。</p>
      </div>
      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        @click="openAddDialog"
      >
        <Plus class="h-4 w-4" />
        添加搜索引擎
      </button>
    </div>

    <div
      v-if="!engines.length"
      class="rounded-xl border border-dashed border-white/70 bg-white/35 px-3 py-4 text-sm text-neutral-500"
    >
      请至少添加一个搜索引擎。
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="engine in engines"
        :key="engine.id"
        class="flex items-center gap-3 rounded-xl bg-white/45 px-3 py-2.5"
      >
        <span class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
          <AppIcon
            :name="engine.name"
            :url="siteFromSearchTemplate(engine.urlTemplate)"
            :color="colorForName(engine.name)"
          />
        </span>
        <button
          type="button"
          class="min-w-0 flex-1 cursor-pointer text-left"
          @click="selectEngine(engine.id)"
        >
          <span class="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
            <Check v-if="selectedEngine === engine.id" class="h-4 w-4 text-sky-500" />
            <span class="truncate">{{ engine.name }}</span>
          </span>
          <span class="block truncate text-xs text-neutral-500">{{ engine.urlTemplate }}</span>
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/70 hover:text-neutral-800"
          title="修改搜索引擎"
          @click="editEngine(engine)"
        >
          <Pencil class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50"
          title="删除搜索引擎"
          @click="deleteEngine(engine.id)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    </div>

    <Transition name="search-engine-dialog">
      <SearchEngineDialog
        v-if="dialogOpen"
        v-model:name="engineName"
        v-model:url-template="urlTemplate"
        :editing="isEditing"
        :error="error"
        @close="resetForm"
        @save="saveEngine"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* 搜索引擎弹窗：与添加壁纸弹窗保持同样的遮罩淡入和卡片缩放 */
.search-engine-dialog-enter-active,
.search-engine-dialog-leave-active {
  transition: opacity 0.18s ease;
}

.search-engine-dialog-enter-active :deep(.search-engine-dialog-card) {
  transition: opacity 0.18s ease 0.04s, transform 0.18s ease 0.04s;
}

.search-engine-dialog-leave-active :deep(.search-engine-dialog-card) {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.search-engine-dialog-enter-from,
.search-engine-dialog-leave-to {
  opacity: 0;
}

.search-engine-dialog-enter-from :deep(.search-engine-dialog-card),
.search-engine-dialog-leave-to :deep(.search-engine-dialog-card) {
  opacity: 0;
  transform: scale(0.94);
}
</style>
