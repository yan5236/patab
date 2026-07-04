<script setup lang="ts">
/**
 * SearchBar —— 搜索栏
 * 左侧引擎图标点击可循环切换搜索引擎（选择持久化到设置），回车发起搜索
 */
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import type { SearchEngineId } from '@/types'
import { useLauncherStore } from '@/stores/launcher'
import { colorForName } from '@/utils/favicon'
import GlassPanel from '@/components/common/GlassPanel.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/** 支持的搜索引擎配置 */
const ENGINES: { id: SearchEngineId; name: string; searchUrl: string; site: string }[] = [
  { id: 'baidu', name: '百度', searchUrl: 'https://www.baidu.com/s?wd=', site: 'baidu.com' },
  { id: 'bing', name: '必应', searchUrl: 'https://www.bing.com/search?q=', site: 'bing.com' },
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q=', site: 'google.com' },
]

const launcher = useLauncherStore()
const keyword = ref('')

const engine = computed(
  () => ENGINES.find((e) => e.id === launcher.settings.searchEngine) ?? ENGINES[0]!,
)

/** 点击引擎图标：切换到下一个搜索引擎 */
function cycleEngine() {
  const index = ENGINES.findIndex((e) => e.id === engine.value.id)
  const next = ENGINES[(index + 1) % ENGINES.length]!
  launcher.updateSettings({ searchEngine: next.id })
}

/** 回车 / 点击搜索按钮：跳转到搜索结果页 */
function submit() {
  const query = keyword.value.trim()
  if (!query) return
  window.location.href = engine.value.searchUrl + encodeURIComponent(query)
}
</script>

<template>
  <GlassPanel class="flex h-12 w-full max-w-xl items-center gap-2 rounded-full pl-2 pr-3">
    <!-- 引擎切换按钮 -->
    <button
      class="h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-110"
      :title="`当前引擎：${engine.name}（点击切换）`"
      @click="cycleEngine"
    >
      <AppIcon :name="engine.name" :url="engine.site" :color="colorForName(engine.name)" />
    </button>

    <input
      v-model="keyword"
      type="text"
      :placeholder="`在 ${engine.name} 中搜索`"
      class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-neutral-800 outline-none placeholder:text-neutral-500"
      @keydown.enter="submit"
    >

    <button
      class="shrink-0 cursor-pointer rounded-full p-1.5 text-neutral-600 transition-colors hover:bg-black/5"
      title="搜索"
      @click="submit"
    >
      <Search class="h-5 w-5" />
    </button>
  </GlassPanel>
</template>
