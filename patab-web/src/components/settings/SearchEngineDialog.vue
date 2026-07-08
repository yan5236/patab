<script setup lang="ts">
/**
 * SearchEngineDialog —— 新增/修改搜索引擎弹窗
 * 只处理输入和提交事件，模板校验与列表写入交给父组件。
 */
import { computed } from 'vue'
import { Check, Plus, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  editing: boolean
  error: string
}>()

const name = defineModel<string>('name', { required: true })
const urlTemplate = defineModel<string>('urlTemplate', { required: true })

const emit = defineEmits<{
  close: []
  save: []
}>()

const { t } = useI18n()
const canSave = computed(() => !!name.value.trim() && !!urlTemplate.value.trim())

/** 提交当前输入，父组件负责校验模板和保存草稿 */
function submit() {
  if (!canSave.value) return
  emit('save')
}
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="search-engine-dialog-card w-[380px] max-w-full rounded-2xl border border-white/55 bg-white/90 p-5 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold text-neutral-800">
          {{ editing ? t('settings.search.editEngine') : t('settings.search.addEngine') }}
        </h3>
        <button
          type="button"
          class="rounded-full p-1 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">{{ t('settings.search.engineName') }}</span>
          <input
            v-model="name"
            type="text"
            :placeholder="t('settings.search.namePlaceholder')"
            class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="submit"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">{{ t('settings.search.address') }}</span>
          <input
            v-model="urlTemplate"
            type="text"
            placeholder="https://example.com/search?q={q}"
            class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="submit"
          >
        </label>
      </div>

      <p v-if="error" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
        {{ error }}
      </p>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canSave"
          @click="submit"
        >
          <Check v-if="editing" class="h-4 w-4" />
          <Plus v-else class="h-4 w-4" />
          {{ editing ? t('common.save') : t('common.add') }}
        </button>
      </div>
    </div>
  </div>
</template>
