<script setup lang="ts">
/**
 * SearchSuggestions —— 搜索联想列表
 * 只展示外部传入的建议词，并把用户选择交给父组件处理。
 */
defineProps<{
  suggestions: string[]
}>()

const emit = defineEmits<{
  pick: [suggestion: string]
}>()
</script>

<template>
  <Transition name="search-suggestions">
    <div
      v-if="suggestions.length"
      class="absolute left-0 top-14 z-[70] w-full overflow-hidden rounded-2xl border border-white/55 bg-white/90 p-2 shadow-2xl backdrop-blur-xl"
    >
      <button
        v-for="suggestion in suggestions"
        :key="suggestion"
        type="button"
        class="block w-full cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm text-neutral-800 transition-colors hover:bg-sky-50"
        @mousedown.prevent
        @click="emit('pick', suggestion)"
      >
        {{ suggestion }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
/* 搜索联想：贴近搜索引擎选择框的轻量淡入节奏 */
.search-suggestions-enter-active,
.search-suggestions-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.search-suggestions-enter-from,
.search-suggestions-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
