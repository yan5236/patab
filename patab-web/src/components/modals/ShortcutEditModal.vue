<script setup lang="ts">
/**
 * ShortcutEditModal —— 创建 / 编辑快捷方式弹窗
 * - 创建模式：传 target（创建到哪个屏幕 / 文件夹 / Dock）
 * - 编辑模式：传 shortcutId（预填现有数据）
 * 名称与网址必填；支持可选的自定义图标 URL，右侧实时预览图标效果
 */
import { computed, ref } from 'vue'
import type { ShortcutTarget } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { colorForName } from '@/utils/favicon'
import BaseModal from '@/components/common/BaseModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{
  target?: ShortcutTarget
  shortcutId?: string
}>()

const launcher = useLauncherStore()
const ui = useUiStore()

const isEdit = computed(() => !!props.shortcutId)
const existing = props.shortcutId ? launcher.findShortcut(props.shortcutId) : undefined

const name = ref(existing?.name ?? '')
const url = ref(existing?.url ?? '')
const iconUrl = ref(existing?.iconUrl ?? '')

const canSave = computed(() => !!name.value.trim() && !!url.value.trim())

function save() {
  if (!canSave.value) return
  const data = { name: name.value, url: url.value, iconUrl: iconUrl.value }
  if (isEdit.value && props.shortcutId) {
    launcher.updateShortcut(props.shortcutId, data)
  } else if (props.target) {
    launcher.addShortcut(props.target, data)
  }
  ui.closeModal()
}
</script>

<template>
  <BaseModal :title="isEdit ? '编辑快捷方式' : '新建快捷方式'" @close="ui.closeModal()">
    <div class="flex gap-4">
      <div class="flex-1 space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">名称</span>
          <input
            v-model="name"
            type="text"
            placeholder="例如：ChatGPT"
            class="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="save"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">网址</span>
          <input
            v-model="url"
            type="text"
            placeholder="例如：chatgpt.com"
            class="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="save"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">图标 URL（可选，留空自动抓取）</span>
          <input
            v-model="iconUrl"
            type="text"
            placeholder="https://…/icon.png"
            class="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="save"
          >
        </label>
      </div>

      <!-- 实时图标预览 -->
      <div class="flex w-20 shrink-0 flex-col items-center gap-2 pt-5">
        <div class="h-16 w-16 rounded-2xl shadow-md">
          <AppIcon
            :name="name || '?'"
            :url="url"
            :icon-url="iconUrl"
            :color="colorForName(name || '?')"
          />
        </div>
        <span class="max-w-full truncate text-xs text-neutral-600">{{ name || '预览' }}</span>
      </div>
    </div>

    <template #footer>
      <button
        class="cursor-pointer rounded-xl px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
        @click="ui.closeModal()"
      >
        取消
      </button>
      <button
        class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSave"
        @click="save"
      >
        {{ isEdit ? '保存' : '创建' }}
      </button>
    </template>
  </BaseModal>
</template>
