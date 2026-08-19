<template>
  <div class="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
    <div
      class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          @click="goHome"
        >
          <Icon icon="mdi:arrow-left" class="h-4 w-4" />
          {{ t('workspace.backHome') }}
        </button>
        <h1 class="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
          {{ t('workspace.title') }}
        </h1>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          :class="!sidebarOpen ? 'border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300' : ''"
          :title="t('workspace.sidebarShortcut')"
          @click="toggleSidebar"
        >
          <Icon :icon="sidebarOpen ? 'mdi:dock-left' : 'mdi:dock-left'" class="h-3.5 w-3.5" />
          {{ t('workspace.sidebar') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          :class="terminalOpen ? 'border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300' : ''"
          :title="t('workspace.terminalShortcut')"
          @click="toggleTerminal"
        >
          <Icon icon="mdi:console" class="h-3.5 w-3.5" />
          {{ t('workspace.terminal') }}
        </button>
        <RouterLink
          to="/settings"
          class="text-xs text-emerald-700 underline dark:text-emerald-400"
        >
          {{ t('workspace.pluginsLink') }}
        </RouterLink>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-row overflow-hidden">
      <aside
        class="flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out dark:border-slate-700 dark:bg-slate-900"
        :class="sidebarOpen ? 'w-[220px]' : 'w-0 border-r-0'"
      >
        <div class="flex h-full w-[220px] flex-col">
          <WorkspaceFileTree
            ref="treeRef"
            :selected-path="selectedPath"
            @select-file="onSelectFile"
          />
        </div>
      </aside>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-slate-950">
          <WorkspaceEditor
            :path="selectedPath"
            :reveal-line="revealLine"
            :reveal-column="revealColumn"
            @saved="onSaved"
            @cursor-change="onCursorChange"
            @open-at="onOpenAt"
          />
        </main>
        <div
          v-show="terminalOpen"
          class="flex h-[240px] shrink-0 flex-col border-t border-slate-700"
        >
          <WorkspaceTerminal :active="terminalOpen" @close="terminalOpen = false" />
        </div>
      </div>
      <aside class="flex w-[min(100%,340px)] shrink-0 flex-col bg-white dark:bg-slate-900">
        <WorkspaceAgentPane :editor-context="editorContext" />
      </aside>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import WorkspaceFileTree from './components/WorkspaceFileTree.vue'
import WorkspaceEditor from './components/WorkspaceEditor.vue'
import WorkspaceAgentPane from './components/WorkspaceAgentPane.vue'
import WorkspaceTerminal from './components/WorkspaceTerminal.vue'

const { t } = useI18n()
const router = useRouter()
const selectedPath = ref('')
const revealLine = ref<number | null>(null)
const revealColumn = ref<number | null>(null)
const terminalOpen = ref(false)
const sidebarOpen = ref(true)
const treeRef = ref<{ reload: () => Promise<void> } | null>(null)
const editorContext = ref<{ path: string; line: number; column: number }>({
  path: '',
  line: 1,
  column: 1,
})

let removeMenuToggleTerminal: (() => void) | undefined
let removeMenuToggleSidebar: (() => void) | undefined

function goHome() {
  void router.push('/')
}

function onSaved() {
  void treeRef.value?.reload()
}

function onSelectFile(path: string) {
  selectedPath.value = path
  revealLine.value = null
  revealColumn.value = null
  editorContext.value = { path, line: 1, column: 1 }
}

function onCursorChange(payload: { path: string; line: number; column: number }) {
  editorContext.value = {
    path: payload.path || selectedPath.value || '',
    line: Math.max(1, payload.line || 1),
    column: Math.max(1, payload.column || 1),
  }
}

function onOpenAt(payload: { path: string; line: number; column: number }) {
  const path = payload.path.replace(/\\/g, '/')
  selectedPath.value = path
  revealLine.value = Math.max(1, payload.line || 1)
  revealColumn.value = Math.max(1, payload.column || 1)
  editorContext.value = {
    path,
    line: revealLine.value,
    column: revealColumn.value,
  }
}

function toggleTerminal() {
  terminalOpen.value = !terminalOpen.value
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
  // Ctrl+B：文件目录（同 VS Code / Cursor）
  if (e.key.toLowerCase() === 'b') {
    e.preventDefault()
    toggleSidebar()
    return
  }
  // Ctrl+`：终端
  if (e.key === '`' || e.code === 'Backquote') {
    e.preventDefault()
    toggleTerminal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  removeMenuToggleTerminal = window.electronAPI.onMenuToggleTerminal(() => {
    toggleTerminal()
  })
  removeMenuToggleSidebar = window.electronAPI.onMenuToggleSidebar(() => {
    toggleSidebar()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  removeMenuToggleTerminal?.()
  removeMenuToggleSidebar?.()
})
</script>
