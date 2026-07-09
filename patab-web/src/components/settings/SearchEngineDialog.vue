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
    class="theme-modal-mask fixed inset-0 z-[60] flex items-center justify-center px-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="search-engine-dialog-card theme-glass-panel is-strong w-[380px] max-w-full rounded-2xl border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="theme-heading text-base font-semibold">
          {{ editing ? t('settings.search.editEngine') : t('settings.search.addEngine') }}
        </h3>
        <button
          type="button"
          class="theme-subtle-button rounded-full p-1 transition-colors"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs theme-muted">{{ t('settings.search.engineName') }}</span>
          <input
            v-model="name"
            type="text"
            :placeholder="t('settings.search.namePlaceholder')"
            class="theme-input theme-input-border w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-sky-400"
            @keydown.enter="submit"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-xs theme-muted">{{ t('settings.search.address') }}</span>
          <input
            v-model="urlTemplate"
            type="text"
            placeholder="https://example.com/search?q={q}"
            class="theme-input theme-input-border w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-sky-400"
            @keydown.enter="submit"
          >
        </label>
      </div>

      <p v-if="error" class="theme-error mt-3 rounded-xl px-3 py-2 text-xs">
        {{ error }}
      </p>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="theme-subtle-button cursor-pointer rounded-xl px-3 py-2 text-sm transition-colors"
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
