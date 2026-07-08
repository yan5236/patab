<script setup lang="ts">
/**
 * AddWallpaperDialog —— 添加壁纸弹层
 * 只处理添加入口、输入框和确认按钮，文件读取与列表写入交给父组件。
 */
import { computed } from 'vue'
import { Link, Upload, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

export type AddWallpaperMode = 'closed' | 'chooser' | 'link' | 'file'

const props = defineProps<{
  mode: AddWallpaperMode
  error: string
  pendingFileWallpaper: string
}>()

const wallpaperName = defineModel<string>('name', { required: true })
const linkWallpaper = defineModel<string>('link', { required: true })

const emit = defineEmits<{
  close: []
  back: []
  chooseFile: []
  addLink: [{ name: string; src: string }]
  addFile: [{ name: string }]
  updateMode: [mode: AddWallpaperMode]
}>()

const { t } = useI18n()
const canAddLink = computed(() => !!wallpaperName.value.trim() && !!linkWallpaper.value.trim())
const canAddFile = computed(() => !!wallpaperName.value.trim() && !!props.pendingFileWallpaper)

/** 提交链接壁纸输入，让父组件完成去重、入列和选中 */
function submitLinkWallpaper() {
  const name = wallpaperName.value.trim()
  const src = linkWallpaper.value.trim()
  if (!name || !src) return
  emit('addLink', { name, src })
}

/** 提交本地壁纸名称，让父组件把已读取的 Data URL 入列 */
function submitFileWallpaper() {
  const name = wallpaperName.value.trim()
  if (!name || !props.pendingFileWallpaper) return
  emit('addFile', { name })
}
</script>

<template>
  <div
    v-if="mode !== 'closed'"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="add-wallpaper-card w-[360px] max-w-full rounded-2xl border border-white/55 bg-white/90 p-5 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold text-neutral-800">{{ t('settings.wallpaper.add') }}</h3>
        <button
          type="button"
          class="rounded-full p-1 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div v-if="mode === 'chooser'" class="space-y-2">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-sm text-neutral-700 transition-colors hover:bg-sky-50"
          @click="emit('updateMode', 'link')"
        >
          <Link class="h-4 w-4 text-sky-500" />
          {{ t('settings.wallpaper.addByLink') }}
        </button>
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-sm text-neutral-700 transition-colors hover:bg-sky-50"
          @click="emit('chooseFile')"
        >
          <Upload class="h-4 w-4 text-sky-500" />
          {{ t('settings.wallpaper.addFromFile') }}
        </button>
      </div>

      <div v-else-if="mode === 'link'" class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">{{ t('settings.wallpaper.name') }}</span>
          <input
            v-model="wallpaperName"
            type="text"
            :placeholder="t('settings.wallpaper.namePlaceholder')"
            class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="submitLinkWallpaper"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">{{ t('settings.wallpaper.imageUrl') }}</span>
          <input
            v-model="linkWallpaper"
            type="text"
            placeholder="https://example.com/wallpaper.png"
            class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="submitLinkWallpaper"
          >
        </label>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
            @click="emit('back')"
          >
            {{ t('common.back') }}
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canAddLink"
            @click="submitLinkWallpaper"
          >
            {{ t('common.add') }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div
          class="aspect-video rounded-xl bg-cover bg-center"
          :style="{ backgroundImage: `url(${pendingFileWallpaper})` }"
        />
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-600">{{ t('settings.wallpaper.name') }}</span>
          <input
            v-model="wallpaperName"
            type="text"
            class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
            @keydown.enter="submitFileWallpaper"
          >
        </label>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
            @click="emit('back')"
          >
            {{ t('common.back') }}
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canAddFile"
            @click="submitFileWallpaper"
          >
            {{ t('common.add') }}
          </button>
        </div>
      </div>

      <p v-if="error" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
        {{ error }}
      </p>
    </div>
  </div>
</template>
