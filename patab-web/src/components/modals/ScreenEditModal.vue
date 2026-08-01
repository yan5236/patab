<script setup lang="ts">
/**
 * ScreenEditModal —— 创建 / 编辑应用屏幕弹窗
 * 填写屏幕名称并从常用 Lucide 图标或完整图标弹窗中选择分类图标
 * 创建成功后自动切换到新屏幕
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import BaseModal from '@/components/common/BaseModal.vue'
import AppLucideIcon from '@/components/common/AppLucideIcon.vue'
import {
  DEFAULT_SCREEN_ICONS,
  normalizeScreenIcon,
  type ScreenIconName,
} from '@/utils/screenIcons'

const ScreenIconPicker = defineAsyncComponent(() => import('./ScreenIconPicker.vue'))

const props = defineProps<{ screenId?: string }>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

const isEdit = computed(() => !!props.screenId)
const existing = props.screenId ? launcher.findScreen(props.screenId) : undefined

const name = ref(existing?.name ?? '')
const icon = ref<ScreenIconName>(normalizeScreenIcon(existing?.icon ?? DEFAULT_SCREEN_ICONS[0]))
const showIconPicker = ref(false)

const canSave = computed(() => !!name.value.trim())

/** 非常用图标被选中后保留在快捷列表末位，确保当前选择始终可见。 */
const visiblePresetIcons = computed(() => {
  if (DEFAULT_SCREEN_ICONS.includes(icon.value)) return DEFAULT_SCREEN_ICONS
  return [...DEFAULT_SCREEN_ICONS.slice(0, -1), icon.value]
})

/** 保存屏幕名称和图标，并在新建时切换到新屏幕。 */
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

/** 应用完整图标弹窗返回的选择并关闭子弹窗。 */
function selectIcon(name: ScreenIconName) {
  icon.value = name
  showIconPicker.value = false
}
</script>

<template>
  <BaseModal :title="isEdit ? t('modals.screen.editTitle') : t('modals.screen.createTitle')" @close="ui.closeModal()">
    <div class="space-y-4">
      <label class="block">
        <span class="theme-muted mb-1 block text-xs">{{ t('modals.screen.nameLabel') }}</span>
        <input
          v-model="name"
          type="text"
          :placeholder="t('modals.screen.namePlaceholder')"
          class="theme-input theme-input-border w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-sky-400"
          @keydown.enter="save"
        >
      </label>

      <div>
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <span class="theme-muted text-xs">{{ t('modals.screen.iconLabel') }}</span>
          <button
            type="button"
            class="cursor-pointer text-xs font-medium text-sky-500 transition-colors hover:text-sky-600"
            @click="showIconPicker = true"
          >
            {{ t('modals.screen.moreIcons') }}
          </button>
        </div>
        <div class="grid grid-cols-8 gap-1.5">
          <button
            v-for="preset in visiblePresetIcons"
            :key="preset"
            type="button"
            class="theme-control flex aspect-square cursor-pointer items-center justify-center rounded-xl transition-all"
            :class="icon === preset ? 'shadow ring-2 ring-sky-400' : ''"
            :title="preset"
            :aria-label="preset"
            @click="icon = preset"
          >
            <AppLucideIcon :name="preset" class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="cursor-pointer rounded-xl px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5"
        @click="ui.closeModal()"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSave"
        @click="save"
      >
        {{ isEdit ? t('common.save') : t('common.create') }}
      </button>
    </template>
  </BaseModal>

  <ScreenIconPicker
    v-if="showIconPicker"
    :model-value="icon"
    @select="selectIcon"
    @close="showIconPicker = false"
  />
</template>
