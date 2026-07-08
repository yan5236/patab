<script setup lang="ts">
/**
 * WallpaperSettingsPanel —— 壁纸设置面板
 * 负责壁纸选择与添加壁纸流程，保存时机仍由 SettingsModal 统一控制。
 */
import { computed, ref } from 'vue'
import { Check, Plus } from '@lucide/vue'
import AddWallpaperDialog, { type AddWallpaperMode } from '@/components/settings/AddWallpaperDialog.vue'
import {
  DEFAULT_WALLPAPERS,
  MAX_LOCAL_WALLPAPER_SIZE,
  type WallpaperOption,
} from '@/utils/wallpapers'
import { resolveAssetPath } from '@/utils/assetPath'

const wallpaper = defineModel<string>('wallpaper', { required: true })
const customWallpapers = defineModel<WallpaperOption[]>('customWallpapers', { required: true })

const addWallpaperMode = ref<AddWallpaperMode>('closed')
const wallpaperName = ref('')
const linkWallpaper = ref('')
const pendingFileWallpaper = ref('')
const wallpaperError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const allWallpapers = computed(() => [...DEFAULT_WALLPAPERS, ...customWallpapers.value])

/** 选中某张壁纸预览，保存前只更新草稿值 */
function selectWallpaper(src: string) {
  wallpaper.value = src
  wallpaperError.value = ''
}

/** 打开添加壁纸方式选择弹层 */
function openAddWallpaper() {
  addWallpaperMode.value = 'chooser'
  wallpaperError.value = ''
}

/** 关闭添加壁纸弹层，并清理临时输入 */
function closeAddWallpaper() {
  addWallpaperMode.value = 'closed'
  wallpaperName.value = ''
  linkWallpaper.value = ''
  pendingFileWallpaper.value = ''
}

/** 返回添加方式选择页，并保留已输入内容便于继续编辑 */
function backToChooser() {
  addWallpaperMode.value = 'chooser'
  wallpaperError.value = ''
}

/** 打开系统文件选择器，并重置 input 以便重复选择同一文件 */
function openFilePicker() {
  if (!fileInput.value) return
  fileInput.value.value = ''
  fileInput.value.click()
}

/** 读取本地图片文件，校验大小后转成 Data URL 作为壁纸草稿 */
function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > MAX_LOCAL_WALLPAPER_SIZE) {
    wallpaperError.value = '本地壁纸不能超过 2MB，请选择更小的图片。'
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result !== 'string') return
    pendingFileWallpaper.value = reader.result
    wallpaperName.value = file.name.replace(/\.[^.]+$/, '') || '本地壁纸'
    addWallpaperMode.value = 'file'
    wallpaperError.value = ''
  }
  reader.onerror = () => {
    wallpaperError.value = '读取图片失败，请换一张图片再试。'
  }
  reader.readAsDataURL(file)
}

/** 把链接壁纸按用户命名加入当前弹窗的自定义列表，并立即选中 */
function addLinkWallpaper(payload: { name: string; src: string }) {
  addCustomWallpaper(payload.src, payload.name)
  closeAddWallpaper()
}

/** 把已读取的本地壁纸按用户命名加入当前弹窗的自定义列表 */
function addFileWallpaper(payload: { name: string }) {
  if (!pendingFileWallpaper.value) return
  addCustomWallpaper(pendingFileWallpaper.value, payload.name)
  closeAddWallpaper()
}

/** 追加自定义壁纸，避免同一地址在列表里重复出现 */
function addCustomWallpaper(src: string, name: string) {
  const exists =
    customWallpapers.value.some((item) => item.src === src) ||
    DEFAULT_WALLPAPERS.some((item) => item.src === src)
  if (!exists) {
    customWallpapers.value = [
      ...customWallpapers.value,
      { id: `custom-${Date.now()}`, name, src, custom: true },
    ]
  }
  selectWallpaper(src)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-neutral-800">壁纸</h3>
        <p class="mt-0.5 text-xs text-neutral-500">选择后保存，即可作为新标签页背景。</p>
      </div>
      <button
        type="button"
        class="flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        @click="openAddWallpaper"
      >
        <Plus class="h-4 w-4" />
        添加壁纸
      </button>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        v-for="item in allWallpapers"
        :key="item.id"
        type="button"
        class="group relative aspect-video cursor-pointer overflow-hidden rounded-xl border text-left transition"
        :class="wallpaper === item.src ? 'border-sky-400 ring-2 ring-sky-300' : 'border-white/50 hover:border-white'"
        @click="selectWallpaper(item.src)"
      >
        <span
          class="absolute inset-0 rounded-xl bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          :style="{ backgroundImage: `url(${resolveAssetPath(item.src)})` }"
        />
        <span class="absolute inset-x-0 bottom-0 flex items-center justify-between rounded-b-xl bg-black/40 px-2.5 py-2 text-xs text-white backdrop-blur-sm">
          <span class="truncate">{{ item.name }}</span>
          <Check v-if="wallpaper === item.src" class="h-4 w-4 shrink-0" />
        </span>
      </button>
    </div>

    <input ref="fileInput" class="hidden" type="file" accept="image/*" @change="onFileSelected">

    <Transition name="add-wallpaper">
      <AddWallpaperDialog
        v-if="addWallpaperMode !== 'closed'"
        v-model:name="wallpaperName"
        v-model:link="linkWallpaper"
        :mode="addWallpaperMode"
        :error="wallpaperError"
        :pending-file-wallpaper="pendingFileWallpaper"
        @update-mode="addWallpaperMode = $event"
        @choose-file="openFilePicker"
        @back="backToChooser"
        @close="closeAddWallpaper"
        @add-link="addLinkWallpaper"
        @add-file="addFileWallpaper"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* 添加壁纸弹层：复用主弹窗的遮罩淡入 + 卡片缩放节奏 */
.add-wallpaper-enter-active,
.add-wallpaper-leave-active {
  transition: opacity 0.18s ease;
}

.add-wallpaper-enter-active :deep(.add-wallpaper-card) {
  transition: opacity 0.18s ease 0.04s, transform 0.18s ease 0.04s;
}

.add-wallpaper-leave-active :deep(.add-wallpaper-card) {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.add-wallpaper-enter-from,
.add-wallpaper-leave-to {
  opacity: 0;
}

.add-wallpaper-enter-from :deep(.add-wallpaper-card),
.add-wallpaper-leave-to :deep(.add-wallpaper-card) {
  opacity: 0;
  transform: scale(0.94);
}
</style>
