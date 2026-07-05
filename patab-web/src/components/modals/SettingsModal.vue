<script setup lang="ts">
/**
 * SettingsModal —— 设置弹窗（Dock 齿轮按钮打开）
 * 只负责设置页签、草稿状态和统一保存，具体设置项交给子面板组件。
 */
import { ref } from 'vue'
import { Clock3, Image, Info } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'
import GeneralSettingsPanel from '@/components/settings/GeneralSettingsPanel.vue'
import WallpaperSettingsPanel from '@/components/settings/WallpaperSettingsPanel.vue'
import AboutSettingsPanel from '@/components/settings/AboutSettingsPanel.vue'
import {
  buildInitialWallpaperOptions,
  DEFAULT_WALLPAPERS,
  toCustomWallpaper,
  type WallpaperOption,
} from '@/utils/wallpapers'

interface SettingsTab {
  id: 'general' | 'wallpaper' | 'about'
  label: string
  icon: unknown
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: '通用', icon: Clock3 },
  { id: 'wallpaper', label: '壁纸', icon: Image },
  { id: 'about', label: '关于', icon: Info },
]

const launcher = useLauncherStore()
const ui = useUiStore()

const activeTab = ref<SettingsTab['id']>(ui.modal?.type === 'settings' ? ui.modal.tab ?? 'general' : 'general')
const wallpaper = ref(launcher.settings.wallpaper)
const hour12 = ref(launcher.settings.hour12)
// 紧凑排列开关：勾选 = compact（拖动让位），取消 = free（自由摆放留空）
const compact = ref(launcher.settings.placementMode === 'compact')
const customWallpapers = ref<WallpaperOption[]>(
  buildInitialWallpaperOptions(launcher.settings.wallpaper, launcher.settings.customWallpapers),
)

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
        <GeneralSettingsPanel
          v-if="activeTab === 'general'"
          v-model:hour12="hour12"
          v-model:compact="compact"
        />
        <WallpaperSettingsPanel
          v-else-if="activeTab === 'wallpaper'"
          v-model:wallpaper="wallpaper"
          v-model:custom-wallpapers="customWallpapers"
        />
        <AboutSettingsPanel v-else />
      </section>
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
