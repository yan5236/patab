<script setup lang="ts">
/**
 * FolderView —— 文件夹展开弹层
 * - 居中毛玻璃面板，标题可直接点击改名
 * - 内部网格复用 TileItem（zone="folder"），支持拖动重排
 * - 面板空白右键：在文件夹内新建快捷方式
 * - 背景遮罩是 data-drop="folder-outside" 放置目标：把图标拖到面板外释放 = 移回主屏幕
 * - 点击遮罩 / ESC 关闭
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { SquarePlus } from '@lucide/vue'
import { useLauncherStore } from '@/stores/launcher'
import { useUiStore } from '@/stores/ui'
import { useDragStore } from '@/stores/drag'
import GlassPanel from '@/components/common/GlassPanel.vue'
import TileItem from './TileItem.vue'

const launcher = useLauncherStore()
const ui = useUiStore()
const drag = useDragStore()

/** 当前展开的文件夹（被删除/解散后自动关闭） */
const folder = computed(() =>
  ui.openFolderId ? launcher.findFolder(ui.openFolderId) : undefined,
)

/** 拖拽悬停在面板外（松手即移出文件夹） */
const isOutsideHovered = computed(() => drag.hoverKey === 'folder-outside')

/** 标题失焦时保存重命名（空名回退原名） */
function onRename(event: Event) {
  if (!folder.value) return
  const name = (event.target as HTMLInputElement).value.trim()
  if (name) launcher.renameFolder(folder.value.id, name)
  else (event.target as HTMLInputElement).value = folder.value.name
}

function onBlankMenu(event: MouseEvent) {
  if (!folder.value) return
  const folderId = folder.value.id
  ui.openContextMenu(event, [
    {
      label: '新建快捷方式',
      icon: SquarePlus,
      action: () => ui.openModal({ type: 'shortcut-create', target: { kind: 'folder', folderId } }),
    },
  ])
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && ui.openFolderId) ui.closeFolder()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="folder">
      <div v-if="folder" class="fixed inset-0 z-40 flex items-center justify-center">
        <!-- 遮罩：点击关闭；同时是"拖出文件夹"的放置目标 -->
        <div
          data-drop="folder-outside"
          class="folder-mask absolute inset-0 bg-black/25 backdrop-blur-sm transition-colors"
          :class="isOutsideHovered ? 'bg-black/10' : ''"
          @click="ui.closeFolder()"
        />

        <GlassPanel
          class="folder-card relative flex h-[440px] w-[600px] max-w-[92vw] flex-col rounded-3xl p-5"
          @contextmenu="onBlankMenu"
        >
          <!-- 标题：点击即可编辑改名 -->
          <input
            :value="folder.name"
            class="mx-auto mb-3 w-64 shrink-0 rounded-lg bg-transparent text-center text-lg font-semibold text-neutral-800 outline-none transition-colors hover:bg-white/40 focus:bg-white/60"
            title="点击重命名"
            @change="onRename"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          >

          <!-- 文件夹内网格：容器自身可接收"追加到末尾"的放置 -->
          <div
            class="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto"
            style="grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); grid-auto-rows: 100px"
            data-drop="cell"
            data-zone="folder"
            :data-container="folder.id"
            :data-index="folder.children.length"
          >
            <TileItem
              v-for="(child, i) in folder.children"
              :key="child.id"
              :tile="child"
              zone="folder"
              :container-id="folder.id"
              :index="i"
            />

            <div
              v-if="folder.children.length === 0"
              class="col-span-full flex h-32 items-center justify-center text-sm text-neutral-500"
            >
              文件夹是空的，右键这里创建快捷方式，或把图标拖进来
            </div>
          </div>
        </GlassPanel>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 文件夹弹层：先模糊遮罩，再弹出面板 */
.folder-enter-active .folder-mask,
.folder-leave-active .folder-mask {
  transition: opacity 0.2s ease;
}
.folder-enter-from .folder-mask,
.folder-leave-to .folder-mask {
  opacity: 0;
}

/* 面板保留原来的淡入+缩放，但稍等遮罩模糊后再开始 */
.folder-enter-active .folder-card {
  transition: opacity 0.2s ease 0.05s, transform 0.2s ease 0.05s;
}
.folder-leave-active .folder-card {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.folder-enter-from .folder-card,
.folder-leave-to .folder-card {
  opacity: 0;
  transform: scale(0.85);
}
</style>
