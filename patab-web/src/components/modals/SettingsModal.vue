<script setup lang="ts">
/**
 * SettingsModal —— 设置弹窗（Dock 齿轮按钮打开）
 * 左侧导航切换设置分类，右侧编辑对应设置项；壁纸以预览选择为主。
 */
import { computed, ref } from 'vue'
import { Check, Clock3, Image, Info, Link, Plus, Upload, X } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'
import type { CustomWallpaper } from '@/types'

interface SettingsTab {
  id: 'general' | 'wallpaper' | 'about'
  label: string
  icon: unknown
}

interface WallpaperOption {
  id: string
  name: string
  src: string
  custom?: boolean
}

type AddWallpaperMode = 'closed' | 'chooser' | 'link' | 'file'

const DEFAULT_WALLPAPERS: WallpaperOption[] = [
  { id: 'scenery', name: '山谷晨光', src: '/scenery1.jpg' },
  { id: 'aurora', name: '极光夜幕', src: '/wallpaper-aurora.jpg' },
  { id: 'paper-lake', name: '纸感湖畔', src: '/wallpaper-paper-lake.jpg' },
  { id: 'sunrise-grid', name: '晨曦网格', src: '/wallpaper-sunrise-grid.jpg' },
  { id: 'snow-mountain-aurora', name: '雪山极光夜幕', src: '/wallpaper-snow-mountain-aurora.jpg' },
]

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: '通用', icon: Clock3 },
  { id: 'wallpaper', label: '壁纸', icon: Image },
  { id: 'about', label: '关于', icon: Info },
]

const MAX_LOCAL_WALLPAPER_SIZE = 2 * 1024 * 1024

const launcher = useLauncherStore()
const ui = useUiStore()

const activeTab = ref<SettingsTab['id']>('general')
const wallpaper = ref(launcher.settings.wallpaper)
const hour12 = ref(launcher.settings.hour12)
// 紧凑排列开关：勾选 = compact（拖动让位），取消 = free（自由摆放留空）
const compact = ref(launcher.settings.placementMode === 'compact')
const addWallpaperMode = ref<AddWallpaperMode>('closed')
const wallpaperName = ref('')
const linkWallpaper = ref('')
const pendingFileWallpaper = ref('')
const wallpaperError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const customWallpapers = ref<WallpaperOption[]>(initialCustomWallpapers())
const allWallpapers = computed(() => [...DEFAULT_WALLPAPERS, ...customWallpapers.value])
const canAddLink = computed(() => !!wallpaperName.value.trim() && !!linkWallpaper.value.trim())
const canAddFile = computed(() => !!wallpaperName.value.trim() && !!pendingFileWallpaper.value)

/** 生成打开弹窗时需要展示的自定义壁纸，兼容旧版已保存的自定义链接 */
function initialCustomWallpapers(): WallpaperOption[] {
  const current = launcher.settings.wallpaper
  const saved = launcher.settings.customWallpapers.map((item) => ({ ...item, custom: true }))
  if (!current || DEFAULT_WALLPAPERS.some((item) => item.src === current)) return saved
  if (saved.some((item) => item.src === current)) return saved
  return [...saved, { id: 'current-custom', name: '自定义壁纸', src: current, custom: true }]
}

/** 保存设置草稿，并把未选择壁纸时回退到第一张默认壁纸 */
function save() {
  launcher.updateSettings({
    wallpaper: wallpaper.value.trim() || DEFAULT_WALLPAPERS[0]!.src,
    customWallpapers: customWallpapers.value.map(toCustomWallpaper),
    hour12: hour12.value,
    placementMode: compact.value ? 'compact' : 'free',
  })
  ui.closeModal()
}

/** 切换左侧设置页签，并清理二级弹层的临时错误 */
function selectTab(tab: SettingsTab['id']) {
  activeTab.value = tab
  wallpaperError.value = ''
  addWallpaperMode.value = 'closed'
}

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

/** 关闭添加壁纸弹层，并清理链接输入 */
function closeAddWallpaper() {
  addWallpaperMode.value = 'closed'
  wallpaperName.value = ''
  linkWallpaper.value = ''
  pendingFileWallpaper.value = ''
}

/** 把链接壁纸按用户命名加入当前弹窗的自定义列表，并立即选中 */
function addLinkWallpaper() {
  const src = linkWallpaper.value.trim()
  const name = wallpaperName.value.trim()
  if (!src || !name) return
  addCustomWallpaper(src, name)
  closeAddWallpaper()
}

/** 把已读取的本地壁纸按用户命名加入当前弹窗的自定义列表 */
function addFileWallpaper() {
  const name = wallpaperName.value.trim()
  if (!pendingFileWallpaper.value || !name) return
  addCustomWallpaper(pendingFileWallpaper.value, name)
  closeAddWallpaper()
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
  }
  reader.onerror = () => {
    wallpaperError.value = '读取图片失败，请换一张图片再试。'
  }
  reader.readAsDataURL(file)
}

/** 追加自定义壁纸，避免同一地址在列表里重复出现 */
function addCustomWallpaper(src: string, name: string) {
  const existing = customWallpapers.value.find((item) => item.src === src)
  if (!existing && !DEFAULT_WALLPAPERS.some((item) => item.src === src)) {
    customWallpapers.value.push({
      id: `custom-${Date.now()}`,
      name,
      src,
      custom: true,
    })
  }
  selectWallpaper(src)
}

/** 转成 settings 持久化需要的纯自定义壁纸结构 */
function toCustomWallpaper(item: WallpaperOption): CustomWallpaper {
  return {
    id: item.id,
    name: item.name.trim(),
    src: item.src.trim(),
  }
}
</script>

<template>
  <BaseModal
    title="设置"
    panel-class="!h-[560px] !w-[760px] max-h-[92vh] max-w-[94vw] overflow-hidden"
    @close="ui.closeModal()"
  >
    <div class="flex h-[408px] min-h-0 overflow-hidden rounded-2xl border border-white/45 bg-white/25">
      <aside class="w-36 shrink-0 border-r border-white/50 bg-white/35 p-2">
        <button
          v-for="tab in SETTINGS_TABS"
          :key="tab.id"
          class="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:bg-white/55 hover:text-neutral-900'
          "
          type="button"
          @click="selectTab(tab.id)"
        >
          <component :is="tab.icon" class="h-4 w-4" />
          <span>{{ tab.label }}</span>
        </button>
      </aside>

      <section class="min-w-0 flex-1 overflow-y-auto p-5">
        <div v-if="activeTab === 'general'" class="space-y-3">
          <h3 class="text-base font-semibold text-neutral-800">通用</h3>
          <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
            <span class="text-sm text-neutral-700">12 小时制时钟</span>
            <input v-model="hour12" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
          </label>

          <label class="flex cursor-pointer items-center justify-between rounded-xl bg-white/45 px-3 py-3">
            <span class="text-sm text-neutral-700">
              紧凑排列（拖动图标自动让位）
              <span class="mt-0.5 block text-xs text-neutral-500">取消则为自由摆放，可在任意空格留空</span>
            </span>
            <input v-model="compact" type="checkbox" class="h-4 w-4 cursor-pointer accent-sky-500">
          </label>
        </div>

        <div v-else-if="activeTab === 'wallpaper'" class="space-y-4">
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

          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="item in allWallpapers"
              :key="item.id"
              type="button"
              class="group relative aspect-video cursor-pointer overflow-hidden rounded-xl border text-left transition"
              :class="wallpaper === item.src ? 'border-sky-400 ring-2 ring-sky-300' : 'border-white/50 hover:border-white'"
              @click="selectWallpaper(item.src)"
            >
              <span
                class="absolute inset-0 rounded-[inherit] bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                :style="{ backgroundImage: `url(${item.src})` }"
              />
              <span class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-2.5 py-2 text-xs text-white backdrop-blur-sm">
                <span class="truncate">{{ item.name }}</span>
                <Check v-if="wallpaper === item.src" class="h-4 w-4 shrink-0" />
              </span>
            </button>
          </div>
        </div>

        <div v-else class="space-y-3">
          <h3 class="text-base font-semibold text-neutral-800">PaTab</h3>
          <div class="rounded-xl bg-white/45 p-4 text-sm leading-6 text-neutral-700">
            <p>本地新标签页启动器。</p>
            <p>快捷方式、待办与设置会保存在浏览器本地。</p>
          </div>
        </div>
      </section>
    </div>

    <input ref="fileInput" class="hidden" type="file" accept="image/*" @change="onFileSelected">

    <Transition name="add-wallpaper">
      <div
        v-if="addWallpaperMode !== 'closed'"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
        @click.self="closeAddWallpaper"
      >
        <div class="add-wallpaper-card w-[360px] max-w-full rounded-2xl border border-white/55 bg-white/90 p-5 shadow-2xl">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-base font-semibold text-neutral-800">添加壁纸</h3>
            <button
              type="button"
              class="rounded-full p-1 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
              @click="closeAddWallpaper"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div v-if="addWallpaperMode === 'chooser'" class="space-y-2">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-sm text-neutral-700 transition-colors hover:bg-sky-50"
              @click="addWallpaperMode = 'link'"
            >
              <Link class="h-4 w-4 text-sky-500" />
              通过链接添加
            </button>
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-sm text-neutral-700 transition-colors hover:bg-sky-50"
              @click="openFilePicker"
            >
              <Upload class="h-4 w-4 text-sky-500" />
              从本地文件选择
            </button>
          </div>

          <div v-else-if="addWallpaperMode === 'link'" class="space-y-3">
            <label class="block">
              <span class="mb-1 block text-xs text-neutral-600">壁纸名称</span>
              <input
                v-model="wallpaperName"
                type="text"
                placeholder="例如：周末海岸"
                class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
                @keydown.enter="addLinkWallpaper"
              >
            </label>
            <label class="block">
              <span class="mb-1 block text-xs text-neutral-600">图片链接</span>
              <input
                v-model="linkWallpaper"
                type="text"
                placeholder="https://example.com/wallpaper.png"
                class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
                @keydown.enter="addLinkWallpaper"
              >
            </label>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="cursor-pointer rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
                @click="addWallpaperMode = 'chooser'"
              >
                返回
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canAddLink"
                @click="addLinkWallpaper"
              >
                添加
              </button>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div
              class="aspect-video rounded-xl bg-cover bg-center"
              :style="{ backgroundImage: `url(${pendingFileWallpaper})` }"
            />
            <label class="block">
              <span class="mb-1 block text-xs text-neutral-600">壁纸名称</span>
              <input
                v-model="wallpaperName"
                type="text"
                class="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
                @keydown.enter="addFileWallpaper"
              >
            </label>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="cursor-pointer rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
                @click="addWallpaperMode = 'chooser'"
              >
                返回
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canAddFile"
                @click="addFileWallpaper"
              >
                添加
              </button>
            </div>
          </div>

          <p v-if="wallpaperError" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
            {{ wallpaperError }}
          </p>
        </div>
      </div>
    </Transition>

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

<style scoped>
/* 添加壁纸弹层：复用主弹窗的遮罩淡入 + 卡片缩放节奏 */
.add-wallpaper-enter-active,
.add-wallpaper-leave-active {
  transition: opacity 0.18s ease;
}

.add-wallpaper-enter-active .add-wallpaper-card {
  transition: opacity 0.18s ease 0.04s, transform 0.18s ease 0.04s;
}

.add-wallpaper-leave-active .add-wallpaper-card {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.add-wallpaper-enter-from,
.add-wallpaper-leave-to {
  opacity: 0;
}

.add-wallpaper-enter-from .add-wallpaper-card,
.add-wallpaper-leave-to .add-wallpaper-card {
  opacity: 0;
  transform: scale(0.94);
}
</style>
