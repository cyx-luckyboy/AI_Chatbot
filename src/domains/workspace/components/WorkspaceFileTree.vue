<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden text-sm">
    <div class="shrink-0 border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
      <button
        type="button"
        class="inline-flex w-full items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        :disabled="!workspaceRoot"
        @click="pickWorkspace"
      >
        <Icon icon="mdi:folder-outline" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate" :title="workspaceRoot || undefined">
          {{ workspaceRoot ? shortRoot : t('workspace.pickFolder') }}
        </span>
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <p v-if="!workspaceRoot" class="px-2 py-4 text-center text-xs text-slate-500">
        {{ t('workspace.needWorkspace') }}
      </p>
      <p v-else-if="error" class="px-2 py-2 text-xs text-red-600 dark:text-red-400">{{ error }}</p>
      <ul v-else class="space-y-0.5">
        <li v-for="e in entries" :key="e.path">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
            :class="selectedPath === e.path ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-200'"
            @click="onClickEntry(e)"
            @dblclick="e.kind === 'dir' ? enterDir(e.path) : undefined"
          >
            <Icon
              :icon="e.kind === 'dir' ? 'mdi:folder' : 'mdi:file-document-outline'"
              class="h-4 w-4 shrink-0 opacity-80"
            />
            <span class="truncate">{{ e.name }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div v-if="cwd !== '.'" class="shrink-0 border-t border-slate-200 p-1 dark:border-slate-700">
      <button
        type="button"
        class="inline-flex w-full items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="goUp"
      >
        <Icon icon="mdi:arrow-up" class="h-3.5 w-3.5" />
        {{ t('workspace.parentDir') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  selectedPath?: string
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  workspaceChanged: [root: string]
}>()

type Entry = { name: string; path: string; kind: 'file' | 'dir' }

const workspaceRoot = ref('')
const cwd = ref('.')
const entries = ref<Entry[]>([])
const error = ref('')

const shortRoot = computed(() => {
  const p = workspaceRoot.value
  if (!p) return ''
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`
})

async function refreshRoot() {
  const r = await window.electronAPI.workspaceGetRoot()
  workspaceRoot.value = (r.path || '').trim()
  emit('workspaceChanged', workspaceRoot.value)
}

async function loadDir(path = cwd.value) {
  error.value = ''
  if (!workspaceRoot.value) {
    entries.value = []
    return
  }
  const res = await window.electronAPI.workspaceList({ path })
  if (!res.ok) {
    error.value = res.error === 'no_workspace' ? t('workspace.needWorkspace') : res.error
    entries.value = []
    return
  }
  cwd.value = path
  entries.value = res.entries
}

async function pickWorkspace() {
  const res = await window.electronAPI.pickAgentWorkspace()
  if (res.ok) {
    workspaceRoot.value = res.path
    cwd.value = '.'
    emit('workspaceChanged', res.path)
    await loadDir('.')
  }
}

function onClickEntry(e: Entry) {
  if (e.kind === 'dir') {
    void enterDir(e.path)
    return
  }
  emit('selectFile', e.path)
}

async function enterDir(path: string) {
  await loadDir(path)
}

async function goUp() {
  if (cwd.value === '.' || !cwd.value) return
  const parts = cwd.value.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  await loadDir(parts.length ? parts.join('/') : '.')
}

onMounted(async () => {
  await refreshRoot()
  await loadDir('.')
  window.electronAPI.onConfigChanged(() => {
    void (async () => {
      await refreshRoot()
      await loadDir(cwd.value)
    })()
  })
})

watch(
  () => props.selectedPath,
  () => {
    /* highlight only */
  },
)

defineExpose({ reload: () => loadDir(cwd.value), pickWorkspace, refreshRoot })
</script>
