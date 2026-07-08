<script setup lang="ts">
/**
 * ScreenEditModal —— 创建 / 编辑应用屏幕弹窗
 * 填写屏幕名称并从预设中选一个 emoji 图标（分类用，如 AI / 学习 / 视频）
 * 创建成功后自动切换到新屏幕
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'

const props = defineProps<{ screenId?: string }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

/** 预设屏幕图标（分类场景常用的 emoji） */
const PRESET_ICONS = ['🤖', '📚', '🎬', '🎮', '💼', '🛒', '🎵', '🖥️', '📰', '⚽', '✈️', '🎨']

const isEdit = computed(() => !!props.screenId)
const existing = props.screenId ? launcher.findScreen(props.screenId) : undefined

const name = ref(existing?.name ?? '')
const icon = ref(existing?.icon ?? PRESET_ICONS[0]!)

const canSave = computed(() => !!name.value.trim())

function save() {
  if (!canSave.value) return
  if (isEdit.value && props.screenId) {
    launcher.updateScreen(props.screenId, { name: name.value, icon: icon.value })
  } else {
    launcher.addScreen(name.value, icon.value)
    // 切换到刚创建的屏幕
    ui.goToScreen(launcher.screens.length - 1)
  }
  ui.closeModal()
}
</script>

<template>
  <BaseModal :title="isEdit ? t('modals.screen.editTitle') : t('modals.screen.createTitle')" @close="ui.closeModal()">
    <div class="space-y-4">
      <label class="block">
        <span class="mb-1 block text-xs text-neutral-600">{{ t('modals.screen.nameLabel') }}</span>
        <input
          v-model="name"
          type="text"
          :placeholder="t('modals.screen.namePlaceholder')"
          class="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-sky-400"
          @keydown.enter="save"
        >
      </label>

      <div>
        <span class="mb-1.5 block text-xs text-neutral-600">{{ t('modals.screen.iconLabel') }}</span>
        <div class="grid grid-cols-6 gap-1.5">
          <button
            v-for="preset in PRESET_ICONS"
            :key="preset"
            class="cursor-pointer rounded-xl py-1.5 text-xl transition-all hover:bg-white/70"
            :class="icon === preset ? 'bg-white shadow ring-2 ring-sky-400' : 'bg-white/40'"
            @click="icon = preset"
          >
            {{ preset }}
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="cursor-pointer rounded-xl px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
        @click="ui.closeModal()"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSave"
        @click="save"
      >
        {{ isEdit ? t('common.save') : t('common.create') }}
      </button>
    </template>
  </BaseModal>
</template>
