<script setup lang="ts">
/**
 * SettingsModal —— 设置弹窗（Dock 齿轮按钮打开）
 * 只负责设置页签、草稿状态和统一保存，具体设置项交给子面板组件。
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ArrowLeft, Clock3, Image, Info, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { setLocale } from '@/i18n'
import type { LocaleCode } from '@/i18n/language'
import type { ThemeMode } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'
import GeneralSettingsPanel from '@/components/settings/GeneralSettingsPanel.vue'
import SearchEngineSettingsPanel from '@/components/settings/SearchEngineSettingsPanel.vue'
import WallpaperSettingsPanel from '@/components/settings/WallpaperSettingsPanel.vue'
import AboutSettingsPanel from '@/components/settings/AboutSettingsPanel.vue'
import {
  buildInitialWallpaperOptions,
  DEFAULT_WALLPAPERS,
  toCustomWallpaper,
  type WallpaperOption,
} from '@/utils/wallpapers'

interface SettingsTab {
  id: 'general' | 'search' | 'wallpaper' | 'about'
  icon: unknown
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', icon: Clock3 },
  { id: 'search', icon: Search },
  { id: 'wallpaper', icon: Image },
  { id: 'about', icon: Info },
]

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

const initialTab = ui.modal?.type === 'settings' ? ui.modal.tab ?? 'general' : 'general'
const activeTab = ref<SettingsTab['id'] | null>(null)
const selectedTab = computed<SettingsTab['id']>(() => activeTab.value ?? initialTab)
const selectedTabLabel = computed(() => t(`settings.tabs.${selectedTab.value}`))
const language = ref<LocaleCode>(launcher.settings.language)
const themeMode = ref<ThemeMode>(launcher.settings.themeMode)
const wallpaper = ref(launcher.settings.wallpaper)
const hour12 = ref(launcher.settings.hour12)
const showDate = ref(launcher.settings.showDate)
const searchEngine = ref(launcher.settings.searchEngine)
const searchEngines = ref(launcher.settings.searchEngines.map((engine) => ({ ...engine })))
// 紧凑排列开关：勾选 = compact（拖动让位），取消 = free（自由摆放留空）
const compact = ref(launcher.settings.placementMode === 'compact')
const customWallpapers = ref<WallpaperOption[]>(
  buildInitialWallpaperOptions(
    launcher.settings.wallpaper,
    launcher.settings.customWallpapers,
    t('settings.wallpaper.customName'),
  ),
)
const contentRef = ref<HTMLElement | null>(null)
const mobileBackPinned = ref(false)
const mobileTitlePinned = ref(false)
const mobileReturning = ref(false)
let returnTimer: ReturnType<typeof window.setTimeout> | null = null

const showMobileHeader = computed(() => !!activeTab.value && (mobileBackPinned.value || mobileTitlePinned.value))
const settingsPanelClass = computed(() =>
  [
    'settings-modal-card !h-[560px] !w-[760px] max-h-[92vh] max-w-[94vw] overflow-hidden',
    showMobileHeader.value ? 'is-mobile-header-active' : '',
  ].join(' '),
)

/** 保存设置草稿，并把未选择壁纸时回退到第一张默认壁纸 */
function save() {
  launcher.updateSettings({
    language: language.value,
    themeMode: themeMode.value,
    wallpaper: wallpaper.value.trim() || DEFAULT_WALLPAPERS[0]!.src,
    customWallpapers: customWallpapers.value.map(toCustomWallpaper),
    hour12: hour12.value,
    showDate: showDate.value,
    searchEngine: searchEngine.value,
    searchEngines: searchEngines.value,
    placementMode: compact.value ? 'compact' : 'free',
  })
  setLocale(language.value)
  ui.closeModal()
}

/** 切换左侧设置页签，并清理二级弹层的临时错误 */
function selectTab(tab: SettingsTab['id']) {
  if (returnTimer) window.clearTimeout(returnTimer)
  mobileReturning.value = false
  mobileBackPinned.value = false
  mobileTitlePinned.value = false
  activeTab.value = tab
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
    syncMobileHeader()
  })
}

/** 返回手机端一级设置菜单，并保留内容页反向退出动画 */
function backToMobileMenu() {
  if (!activeTab.value) return
  mobileReturning.value = true
  mobileBackPinned.value = false
  mobileTitlePinned.value = false
  if (returnTimer) window.clearTimeout(returnTimer)
  returnTimer = window.setTimeout(() => {
    activeTab.value = null
    mobileReturning.value = false
  }, 180)
}

/** 同步手机端动态顶栏：只有原返回按钮或面板标题滚出内容区时才提升到弹窗标题行 */
function syncMobileHeader() {
  const content = contentRef.value
  if (!content || !activeTab.value) {
    mobileBackPinned.value = false
    mobileTitlePinned.value = false
    return
  }

  const contentTop = content.getBoundingClientRect().top
  const backBottom = content.querySelector('.settings-back-button')?.getBoundingClientRect().bottom ?? contentTop
  const titleBottom = content.querySelector('h3')?.getBoundingClientRect().bottom ?? contentTop
  mobileBackPinned.value = backBottom <= contentTop + 4
  mobileTitlePinned.value = titleBottom <= contentTop + 4
}

onBeforeUnmount(() => {
  if (returnTimer) window.clearTimeout(returnTimer)
})
</script>

<template>
  <BaseModal
    :title="t('settings.title')"
    :panel-class="settingsPanelClass"
    @close="ui.closeModal()"
  >
    <div
      class="settings-mobile-toolbar"
      :class="{ 'is-visible': showMobileHeader }"
    >
      <button
        v-if="mobileBackPinned"
        class="settings-mobile-toolbar-back"
        type="button"
        @click="backToMobileMenu"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t('common.back') }}
      </button>
      <span
        v-if="mobileTitlePinned"
        class="settings-mobile-toolbar-title"
      >
        {{ selectedTabLabel }}
      </span>
    </div>

    <div class="settings-body theme-setting-shell flex h-[408px] min-h-0 overflow-hidden rounded-2xl">
      <aside class="settings-tabs theme-setting-tabs w-36 shrink-0 p-2">
        <button
          v-for="tab in SETTINGS_TABS"
          :key="tab.id"
          class="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
          :class="
            selectedTab === tab.id
              ? 'theme-tab-active shadow-sm'
              : 'theme-tab-idle'
          "
          type="button"
          @click="selectTab(tab.id)"
        >
          <component :is="tab.icon" class="h-4 w-4" />
          <span>{{ t(`settings.tabs.${tab.id}`) }}</span>
        </button>
      </aside>

      <div v-if="!activeTab" class="settings-mobile-menu min-w-0 flex-1 p-2">
        <button
          v-for="tab in SETTINGS_TABS"
          :key="tab.id"
          class="theme-setting-row mb-2 flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-sm transition active:scale-[0.98]"
          type="button"
          @click="selectTab(tab.id)"
        >
          <span class="flex items-center gap-2">
            <component :is="tab.icon" class="h-4 w-4" />
            <span>{{ t(`settings.tabs.${tab.id}`) }}</span>
          </span>
          <span class="theme-faint">›</span>
        </button>
      </div>

      <section
        ref="contentRef"
        class="settings-content min-w-0 flex-1 overflow-y-auto p-5"
        :class="{ 'is-mobile-open': activeTab, 'is-mobile-closing': mobileReturning }"
        @scroll="syncMobileHeader"
      >
        <button
          class="settings-back-button theme-subtle-button mb-3 cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm transition-colors"
          type="button"
          @click="backToMobileMenu"
        >
          <ArrowLeft class="h-4 w-4" />
          {{ t('common.back') }}
        </button>
        <GeneralSettingsPanel
          v-if="selectedTab === 'general'"
          v-model:language="language"
          v-model:theme-mode="themeMode"
          v-model:hour12="hour12"
          v-model:show-date="showDate"
          v-model:compact="compact"
        />
        <SearchEngineSettingsPanel
          v-else-if="selectedTab === 'search'"
          v-model:selected-engine="searchEngine"
          v-model:engines="searchEngines"
        />
        <WallpaperSettingsPanel
          v-else-if="selectedTab === 'wallpaper'"
          v-model:wallpaper="wallpaper"
          v-model:custom-wallpapers="customWallpapers"
        />
        <AboutSettingsPanel v-else />
      </section>
    </div>

    <template #footer>
      <button
        class="theme-subtle-button cursor-pointer rounded-xl px-4 py-2 text-sm transition-colors"
        @click="ui.closeModal()"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        @click="save"
      >
        {{ t('common.save') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
/* 手机端设置弹窗：先显示一级菜单，进入子页时从右侧滑入 */
.settings-mobile-menu,
.settings-back-button,
.settings-mobile-toolbar {
  display: none;
}

@media (max-width: 640px) {
  :global(.settings-modal-card > h2) {
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  :global(.settings-modal-card.is-mobile-header-active > h2) {
    opacity: 0;
    transform: translateY(-6px);
  }

  .settings-mobile-toolbar {
    position: absolute;
    top: 1.35rem;
    left: 1.5rem;
    z-index: 2;
    display: flex;
    max-width: calc(100% - 3rem);
    align-items: center;
    gap: 0.5rem;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  .settings-mobile-toolbar.is-visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .settings-mobile-toolbar-back {
    display: inline-flex;
    cursor: pointer;
    align-items: center;
    gap: 0.25rem;
    border-radius: 0.75rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--theme-muted);
    transition: background-color 0.18s ease, transform 0.18s ease;
  }

  .settings-mobile-toolbar-back:active {
    transform: scale(0.96);
  }

  .settings-mobile-toolbar-back:hover {
    background: var(--theme-control-hover-bg);
  }

  .settings-mobile-toolbar-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-heading);
  }

  .settings-tabs {
    display: none;
  }

  .settings-mobile-menu {
    display: block;
    animation: settings-menu-in 0.18s ease;
  }

  .settings-content {
    display: none;
    padding: 0.75rem;
  }

  .settings-content.is-mobile-open {
    display: block;
    animation: settings-slide-in 0.18s ease;
  }

  .settings-content.is-mobile-closing {
    display: block;
    animation: settings-slide-out 0.18s ease forwards;
  }

  .settings-back-button {
    display: inline-flex;
  }
}

@keyframes settings-menu-in {
  from {
    opacity: 0;
    transform: translateX(-18px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes settings-slide-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes settings-slide-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }

  to {
    opacity: 0;
    transform: translateX(24px);
  }
}
</style>
