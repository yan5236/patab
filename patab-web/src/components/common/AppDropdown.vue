<script setup lang="ts">
/**
 * AppDropdown —— 通用单选下拉框
 * 用按钮和弹层列表模拟选择器，避免原生 select 和应用视觉不一致。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

export interface DropdownOption {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: DropdownOption[]
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue) ?? props.options[0],
)

/** 打开或关闭下拉框，并按需注册外部点击监听 */
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) document.addEventListener('pointerdown', closeOnOutside)
  else document.removeEventListener('pointerdown', closeOnOutside)
}

/** 点击组件外部时关闭弹层 */
function closeOnOutside(event: PointerEvent) {
  const root = rootRef.value
  if (!root || root.contains(event.target as Node)) return
  open.value = false
  document.removeEventListener('pointerdown', closeOnOutside)
}

/** 选中一项并关闭弹层 */
function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
  document.removeEventListener('pointerdown', closeOnOutside)
}

/** Esc 关闭弹层，保留焦点在触发按钮上 */
function close() {
  open.value = false
  document.removeEventListener('pointerdown', closeOnOutside)
}

onBeforeUnmount(close)
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/55 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled"
      @click="toggle"
      @keydown.escape="close"
    >
      <span class="truncate">{{ selected?.label }}</span>
      <ChevronDown
        class="h-4 w-4 shrink-0 text-neutral-400 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Transition name="dropdown">
      <div
        v-if="open"
        class="absolute left-0 top-11 z-[80] w-full min-w-44 rounded-2xl border border-white/55 bg-white/90 p-1.5 shadow-2xl backdrop-blur-xl"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-sky-50"
          @click="choose(option.value)"
        >
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <Check v-if="modelValue === option.value" class="h-4 w-4 shrink-0 text-sky-500" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 下拉弹层：沿用搜索引擎选择器的轻量淡入和缩放节奏 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
</style>
