<script setup lang="ts">
/**
 * SearchBar —— 搜索栏
 * 左侧圆形按钮打开搜索引擎选择框，回车或点击按钮发起搜索。
 */
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { buildSearchUrl } from '@/utils/searchEngines'
import GlassPanel from '@/components/common/GlassPanel.vue'
import SearchEnginePicker from '@/components/topbar/SearchEnginePicker.vue'

const launcher = useLauncherStore()
const keyword = ref('')

const engines = computed(() => launcher.settings.searchEngines)
const engine = computed(
  () => engines.value.find((item) => item.id === launcher.settings.searchEngine) ?? engines.value[0],
)
const isSearchDisabled = computed(() => !engine.value)

/** 选择搜索引擎，并把选择写入设置 */
function selectEngine(id: string) {
  launcher.updateSettings({ searchEngine: id })
}

/** 回车 / 点击搜索按钮：跳转到搜索结果页 */
function submit() {
  const query = keyword.value.trim()
  if (!query || !engine.value) return
  window.location.href = buildSearchUrl(engine.value, query)
}
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
      :placeholder="engine ? `在 ${engine.name} 中搜索` : '请至少添加一个搜索引擎'"
      class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-neutral-800 outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-400"
      @keydown.enter="submit"
    >

    <button
      class="shrink-0 cursor-pointer rounded-full p-1.5 text-neutral-600 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent"
      :disabled="isSearchDisabled"
      title="搜索"
      @click="submit"
    >
      <Search class="h-5 w-5" />
    </button>
  </GlassPanel>
</template>
