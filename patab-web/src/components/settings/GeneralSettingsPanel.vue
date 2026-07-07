<script setup lang="ts">
/**
 * GeneralSettingsPanel —— 通用设置面板
 * 只负责通用设置项的展示与双向绑定，不直接读取或保存 store。
 */
const hour12 = defineModel<boolean>('hour12', { required: true })
const showDate = defineModel<boolean>('showDate', { required: true })
const compact = defineModel<boolean>('compact', { required: true })
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-base font-semibold text-neutral-800">通用</h3>
    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">12 小时制时钟</span>
      <input v-model="hour12" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">显示日期</span>
      <input v-model="showDate" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>

    <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
      <span class="text-sm text-neutral-700">
        紧凑排列（拖动图标自动让位）
        <span class="mt-0.5 block text-xs text-neutral-500">取消则为自由摆放，可在任意空格留空</span>
      </span>
      <input v-model="compact" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
    </label>
  </div>
</template>
