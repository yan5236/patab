<script setup lang="ts">
/**
 * SearchBar —— 搜索栏
 * 左侧圆形按钮打开搜索引擎选择框，回车或点击按钮发起搜索。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { buildSearchUrl } from '@/utils/searchEngines'
import { fetchBingSuggestions } from '@/utils/searchSuggestions'
import GlassPanel from '@/components/common/GlassPanel.vue'
import SearchEnginePicker from '@/components/topbar/SearchEnginePicker.vue'
import SearchSuggestions from '@/components/topbar/SearchSuggestions.vue'

const launcher = useLauncherStore()
const { t } = useI18n()
const keyword = ref('')
const suggestions = ref<string[]>([])
const suggestionsOpen = ref(false)

const engines = computed(() => launcher.settings.searchEngines)
const engine = computed(
  () => engines.value.find((item) => item.id === launcher.settings.searchEngine) ?? engines.value[0],
)
const isSearchDisabled = computed(() => !engine.value)

let suggestTimer: ReturnType<typeof setTimeout> | undefined
let suggestRequestId = 0

/** 清空联想词并关闭下拉 */
function closeSuggestions() {
  suggestionsOpen.value = false
  suggestions.value = []
}

/** 防抖请求必应联想词，旧请求返回时自动丢弃 */
function scheduleSuggestions(query: string) {
  clearTimeout(suggestTimer)
  const trimmed = query.trim()
  if (!trimmed || isSearchDisabled.value) {
    suggestRequestId += 1
    closeSuggestions()
    return
  }

  const requestId = ++suggestRequestId
  suggestTimer = setTimeout(async () => {
    const nextSuggestions = await fetchBingSuggestions(trimmed)
    if (requestId !== suggestRequestId) return
    suggestions.value = nextSuggestions
    suggestionsOpen.value = nextSuggestions.length > 0
  }, 250)
}

/** 选择搜索引擎，并把选择写入设置 */
function selectEngine(id: string) {
  launcher.updateSettings({ searchEngine: id })
}

/** 回车 / 点击搜索按钮：跳转到搜索结果页 */
function submit(query = keyword.value) {
  const trimmed = query.trim()
  if (!trimmed || !engine.value) return
  window.location.href = buildSearchUrl(engine.value, trimmed)
}

/** 选中联想词后写回输入框，并立即使用当前搜索引擎搜索 */
function pickSuggestion(suggestion: string) {
  keyword.value = suggestion
  closeSuggestions()
  submit(suggestion)
}

watch(keyword, scheduleSuggestions)
watch(isSearchDisabled, (disabled) => {
  if (disabled) closeSuggestions()
})

onBeforeUnmount(() => clearTimeout(suggestTimer))
</script>

<template>
  <GlassPanel class="relative z-40 flex h-12 w-full max-w-xl items-center gap-2 overflow-visible rounded-full pl-2 pr-3">
    <SearchEnginePicker
      :engines="engines"
      :selected-id="engine?.id ?? ''"
      :disabled="isSearchDisabled"
      @select="selectEngine"
    />

    <input
      v-model="keyword"
      type="text"
      :disabled="isSearchDisabled"
      :placeholder="engine ? t('topbar.searchIn', { name: engine.name }) : t('topbar.noSearchEngine')"
      class="theme-text h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--theme-muted)] disabled:cursor-not-allowed disabled:opacity-60"
      @focus="scheduleSuggestions(keyword)"
      @blur="suggestionsOpen = false"
      @keydown.enter="submit()"
    >

    <button
      class="theme-icon-button shrink-0 cursor-pointer rounded-full p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      :disabled="isSearchDisabled"
      :title="t('topbar.search')"
      @click="submit()"
    >
      <Search class="h-5 w-5" />
    </button>

    <SearchSuggestions
      v-if="suggestionsOpen"
      :suggestions="suggestions"
      @pick="pickSuggestion"
    />
  </GlassPanel>
</template>
