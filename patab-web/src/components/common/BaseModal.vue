<script setup lang="ts">
/**
 * BaseModal —— 通用弹窗外壳
 * 遮罩 + 居中毛玻璃卡片；ESC / 点击遮罩关闭；入场缩放过渡
 * 内容由默认插槽提供，底部操作区由 footer 插槽提供
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import GlassPanel from './GlassPanel.vue'

withDefaults(defineProps<{ title: string; panelClass?: string }>(), {
  panelClass: '',
})
const emit = defineEmits<{ close: [] }>()
const contentRef = ref<HTMLElement>()
let restoreTarget: HTMLElement | undefined

/**
 * 返回弹窗内可由键盘操作的控件，排除禁用和隐藏项，供首次聚焦与 Tab 循环共用。
 */
function getFocusableElements(): HTMLElement[] {
  return [...(contentRef.value?.querySelectorAll<HTMLElement>([
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')) ?? [])].filter((element) => element.getClientRects().length > 0)
}

/**
 * 弹窗挂载后把焦点移入第一个可操作控件，避免键盘用户继续停留在被遮罩的宿主页面。
 */
function focusInitialControl(): void {
  const [first] = getFocusableElements()
  ;(first ?? contentRef.value)?.focus({ preventScroll: true })
}

/**
 * 统一处理弹窗键盘交互：Escape 复用关闭事件，Tab/Shift+Tab 严格在当前弹窗可见控件间循环。
 *
 * 不可聚焦内容时保留焦点在内容容器，避免焦点落回被遮罩的宿主页面；关闭本身仍由卸载钩子恢复原触发控件。
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key !== 'Tab') return
  const elements = getFocusableElements()
  if (!elements.length) {
    event.preventDefault()
    contentRef.value?.focus({ preventScroll: true })
    return
  }
  const first = elements[0]!
  const last = elements[elements.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus({ preventScroll: true })
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  }
}

/** 记录打开前焦点、注册全局键盘监听，并在 DOM 稳定后把首次焦点移入弹窗。 */
onMounted(() => {
  const active = document.activeElement
  restoreTarget = active instanceof HTMLElement ? active : undefined
  window.addEventListener('keydown', onKeydown)
  void nextTick(focusInitialControl)
})
/** 移除键盘监听并仅向仍连接的原触发控件恢复焦点，避免卸载后的失效元素抛错。 */
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="fixed inset-0 z-50 flex items-center justify-center" @contextmenu.prevent>
        <!-- 遮罩：点击关闭 -->
        <div class="modal-mask theme-modal-mask absolute inset-0 backdrop-blur-sm" @click="emit('close')" />
        <GlassPanel
          strong
          :class="['modal-card relative w-[420px] max-w-[92vw] rounded-3xl p-6', panelClass]"
        >
          <div ref="contentRef" tabindex="-1" class="outline-none">
            <h2 v-if="title" class="theme-heading mb-4 text-lg font-semibold">{{ title }}</h2>
            <slot />
            <div v-if="$slots.footer" class="mt-5 flex justify-end gap-2">
              <slot name="footer" />
            </div>
          </div>
        </GlassPanel>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 弹窗入退场：先模糊遮罩，再弹出卡片 */
.modal-enter-active .modal-mask,
.modal-leave-active .modal-mask {
  transition: opacity 0.18s ease;
}
.modal-enter-from .modal-mask,
.modal-leave-to .modal-mask {
  opacity: 0;
}

/* 卡片保留原来的淡入+缩放，但稍等遮罩模糊后再开始 */
.modal-enter-active .modal-card {
  transition: opacity 0.18s ease 0.05s, transform 0.18s ease 0.05s;
}
.modal-leave-active .modal-card {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.modal-enter-from .modal-card,
.modal-leave-to .modal-card {
  opacity: 0;
  transform: scale(0.92);
}

/* 用户选择减少动态效果时，宿主弹窗不保留入退场动画。 */
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-mask,
  .modal-leave-active .modal-mask,
  .modal-enter-active .modal-card,
  .modal-leave-active .modal-card {
    transition: none;
  }
}
</style>
