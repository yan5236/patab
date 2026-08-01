<script setup lang="ts">
/**
 * ScreenIconPicker —— 完整应用屏幕图标选择弹窗
 * 提供名称搜索与滚动分批渲染，避免一次挂载全部 Lucide SVG。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ExternalLink, Search, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import GlassPanel from '@/components/common/GlassPanel.vue'
import AppLucideIcon from '@/components/common/AppLucideIcon.vue'
import type { ScreenIconName } from '@/utils/screenIcons'
import { searchScreenIcons } from '@/utils/screenIconLibrary'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ select: [name: ScreenIconName]; close: [] }>()
const { t } = useI18n()

const BATCH_SIZE = 80
const query = ref('')
const visibleCount = ref(BATCH_SIZE)
const searchInput = ref<HTMLInputElement>()

const filteredIcons = computed(() => searchScreenIcons(query.value))
const visibleIcons = computed(() => filteredIcons.value.slice(0, visibleCount.value))

/** 搜索条件变化时从首批结果重新开始，避免旧滚动状态残留。 */
watch(query, () => {
  visibleCount.value = BATCH_SIZE
})

/** 靠近列表底部时继续渲染下一批图标。 */
function loadMoreOnScroll(event: Event) {
  const target = event.currentTarget as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight > 160) return
  visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, filteredIcons.value.length)
}

/** 处理弹窗键盘事件，Esc 只关闭图标选择层，不影响下方编辑弹窗。 */
function onKeydown(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}

/** 选择图标后把名称交给父弹窗保存。 */
function selectIcon(name: ScreenIconName) {
  emit('select', name)
}

onMounted(() => nextTick(() => searchInput.value?.focus()))
</script>

<template>
  <Transition name="screen-icon-picker" appear>
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 theme-modal-mask backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      :aria-label="t('modals.screen.iconsTitle')"
      @click.self="emit('close')"
      @keydown="onKeydown"
    >
      <GlassPanel
        strong
        class="screen-icon-picker-card flex h-[min(680px,88vh)] w-[720px] max-w-[96vw] flex-col rounded-3xl p-5"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 class="theme-heading text-lg font-semibold">{{ t('modals.screen.iconsTitle') }}</h3>
            <p class="theme-muted mt-0.5 flex items-center gap-1 text-xs">
              <span>{{ t('modals.screen.iconSource') }}</span>
              <a
                href="https://github.com/lucide-icons/lucide"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-0.5 font-medium text-sky-500 transition-colors hover:text-sky-600"
              >
                Lucide Icon
                <ExternalLink class="h-3 w-3" />
              </a>
            </p>
          </div>
          <button
            type="button"
            class="theme-icon-button cursor-pointer rounded-xl p-2 transition-colors"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <label class="theme-input theme-input-border mb-4 flex items-center gap-2 rounded-xl border px-3 py-2">
          <Search class="theme-muted h-4 w-4 shrink-0" />
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none"
            :placeholder="t('modals.screen.iconSearchPlaceholder')"
          >
        </label>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" @scroll="loadMoreOnScroll">
          <div v-if="visibleIcons.length" class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
            <button
              v-for="name in visibleIcons"
              :key="name"
              type="button"
              class="theme-control flex aspect-square cursor-pointer items-center justify-center rounded-xl transition-all hover:-translate-y-0.5"
              :class="props.modelValue === name ? 'ring-2 ring-sky-400 shadow-sm' : ''"
              :title="name"
              :aria-label="name"
              @click="selectIcon(name)"
            >
              <AppLucideIcon :name="name" class="h-5 w-5" />
            </button>
          </div>
          <p v-else class="theme-muted py-16 text-center text-sm">{{ t('modals.screen.iconEmpty') }}</p>
        </div>
      </GlassPanel>
    </div>
  </Transition>
</template>

<style scoped>
.screen-icon-picker-enter-active {
  transition: opacity 0.2s ease;
}

.screen-icon-picker-enter-active .screen-icon-picker-card {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.screen-icon-picker-enter-from {
  opacity: 0;
}

.screen-icon-picker-enter-from .screen-icon-picker-card {
  opacity: 0;
  transform: translateY(18px) scale(0.96);
}
</style>
