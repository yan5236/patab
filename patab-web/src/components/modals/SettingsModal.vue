<script setup lang="ts">
/**
 * SettingsModal —— 设置弹窗（Dock 齿轮按钮打开）
 * 目前提供：自定义壁纸 URL、时钟 12/24 小时制
 */
import { ref } from 'vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'

const launcher = useLauncherStore()
const ui = useUiStore()

const wallpaper = ref(launcher.settings.wallpaper)
const hour12 = ref(launcher.settings.hour12)
// 紧凑排列开关：勾选 = compact（拖动让位），取消 = free（自由摆放留空）
const compact = ref(launcher.settings.placementMode === 'compact')

function save() {
  launcher.updateSettings({
    wallpaper: wallpaper.value.trim() || '/scenery1.png',
    hour12: hour12.value,
    placementMode: compact.value ? 'compact' : 'free',
  })
  ui.closeModal()
}
</script>

<template>
  <BaseModal title="设置" @close="ui.closeModal()">
    <div class="space-y-4">
      <label class="block">
        <span class="mb-1 block text-xs text-neutral-600">壁纸图片 URL（留空使用内置壁纸）</span>
        <input
          v-model="wallpaper"
          type="text"
          placeholder="/scenery1.png"
          class="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
          @keydown.enter="save"
        >
      </label>

      <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 px-3 py-2.5">
        <span class="text-sm text-neutral-700">12 小时制时钟</span>
        <input v-model="hour12" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
      </label>

      <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 px-3 py-2.5">
        <span class="text-sm text-neutral-700">
          紧凑排列（拖动图标自动让位）
          <span class="mt-0.5 block text-xs text-neutral-500">取消则为自由摆放，可在任意空格留空</span>
        </span>
        <input v-model="compact" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
      </label>
    </div>

    <template #footer>
      <button
        class="cursor-pointer rounded-xl px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
        @click="ui.closeModal()"
      >
        取消
      </button>
      <button
        class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        @click="save"
      >
        保存
      </button>
    </template>
  </BaseModal>
</template>
