<script setup lang="ts">
/**
 * BaseModal —— 通用弹窗外壳
 * 遮罩 + 居中毛玻璃卡片；ESC / 点击遮罩关闭；入场缩放过渡
 * 内容由默认插槽提供，底部操作区由 footer 插槽提供
 */
import { onBeforeUnmount, onMounted } from 'vue'
import GlassPanel from './GlassPanel.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="fixed inset-0 z-50 flex items-center justify-center" @contextmenu.prevent>
        <!-- 遮罩：点击关闭 -->
        <div class="modal-mask absolute inset-0 bg-black/30 backdrop-blur-sm" @click="emit('close')" />
        <GlassPanel strong class="modal-card relative w-[420px] max-w-[92vw] rounded-3xl p-6">
          <h2 class="mb-4 text-lg font-semibold text-neutral-800">{{ title }}</h2>
          <slot />
          <div v-if="$slots.footer" class="mt-5 flex justify-end gap-2">
            <slot name="footer" />
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
</style>
