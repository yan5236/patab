<script setup lang="ts">
/**
 * ClockTypePickerModal —— 时钟类型选择弹窗
 * 添加模式（带 screenId）：从组件商店进入，选择后把时钟小组件添加到该屏幕；
 * 切换模式（带 tileId）：从图块齿轮 / 详情弹窗进入，选择后切换类型并重置运行状态。
 */
import { Clock as ClockIcon, Hourglass, Timer } from '@lucide/vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/common/BaseModal.vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { CLOCK_TYPES } from '@/utils/clock'
import type { ClockType } from '@/types'

const props = defineProps<{
  /** 添加模式：目标屏幕 id */
  screenId?: string
  /** 切换模式：已有图块 id */
  tileId?: string
}>()

const launcher = useLauncherStore()
const ui = useUiStore()
const { t } = useI18n()

const icons: Record<ClockType, Component> = {
  time: ClockIcon,
  stopwatch: Timer,
  timer: Hourglass,
}

function choose(clockType: ClockType) {
  if (props.tileId) {
    launcher.switchClockType(props.tileId, clockType)
  } else if (props.screenId) {
    launcher.addClockWidget(props.screenId, clockType)
  }
  ui.closeModal()
}
</script>

<template>
  <BaseModal :title="t('clock.pickerTitle')" @close="ui.closeModal()">
    <div class="space-y-2">
      <button
        v-for="clockType in CLOCK_TYPES"
        :key="clockType"
        type="button"
        class="theme-surface-hover flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-colors"
        @click="choose(clockType)"
      >
        <span class="theme-card-icon-bg theme-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm">
          <component :is="icons[clockType]" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="theme-text block text-sm font-semibold">{{ t(`clock.types.${clockType}`) }}</span>
          <span class="theme-muted mt-0.5 block text-xs">{{ t(`clock.typeDesc.${clockType}`) }}</span>
        </span>
      </button>
    </div>
  </BaseModal>
</template>
