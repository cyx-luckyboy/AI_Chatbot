<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700"
    >
      <span class="min-w-0 truncate font-mono text-xs text-slate-600 dark:text-slate-300" :title="path || undefined">
        {{ path || t('workspace.noFile') }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        :disabled="!path || !dirty || saving"
        @click="save"
      >
        {{ saving ? t('workspace.saving') : t('workspace.save') }}
      </button>
    </div>
    <div v-if="path" ref="hostRef" class="min-h-0 flex-1" />
    <div
      v-else
      class="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400"
    >
      {{ t('workspace.pickFileHint') }}
    </div>
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-3 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      <span v-if="error" class="truncate text-red-600 dark:text-red-300">{{ error }}</span>
      <span v-else-if="path" class="truncate">{{ t('workspace.gotoDefHint') }}</span>
      <span v-if="path" class="shrink-0 font-mono">Ln {{ line }}, Col {{ column }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  applyMonacoTheme,
  ensureMonacoConfigured,
  getOrCreateModel,
  languageFromPath,
  monaco,
} from '../monacoSetup'

const { t } = useI18n()

const props = defineProps<{
  path: string
  revealLine?: number | null
  revealColumn?: number | null
}>()

const emit = defineEmits<{
  saved: [path: string]
  cursorChange: [payload: { path: string; line: number; column: number }]
  openAt: [payload: { path: string; line: number; column: number }]
}>()

const hostRef = ref<HTMLElement | null>(null)
const dirty = ref(false)
const saving = ref(false)
const error = ref('')
const line = ref(1)
const column = ref(1)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let suppressDirty = false
let themeObserver: MutationObserver | null = null
const disposables: monaco.IDisposable[] = []

function isDarkTheme() {
  return document.documentElement.classList.contains('dark')
}

function emitCursor() {
  emit('cursorChange', {
    path: props.path || '',
    line: line.value,
    column: column.value,
  })
}

function syncCursorFromEditor() {
  if (!editor) return
  const pos = editor.getPosition()
  if (!pos) return
  line.value = pos.lineNumber
  column.value = pos.column
  emitCursor()
}

function disposeEditor() {
  for (const d of disposables) d.dispose()
  disposables.length = 0
  editor?.dispose()
  editor = null
}

function createEditor() {
  const host = hostRef.value
  if (!host || !props.path) return

  ensureMonacoConfigured((payload) => {
    emit('openAt', payload)
  })
  applyMonacoTheme(isDarkTheme())

  disposeEditor()
  editor = monaco.editor.create(host, {
    automaticLayout: true,
    theme: isDarkTheme() ? 'vs-dark' : 'vs',
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineNumbers: 'on',
    minimap: { enabled: true, maxColumn: 80, scale: 0.7 },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    tabSize: 2,
    renderLineHighlight: 'line',
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    padding: { top: 8, bottom: 8 },
    links: true,
    gotoLocation: {
      multiple: 'goto',
      multipleDefinitions: 'goto',
    },
    definitionLinkOpensInPeek: false,
  })

  disposables.push(
    editor.onDidChangeCursorPosition(() => syncCursorFromEditor()),
    editor.onDidChangeModelContent(() => {
      if (suppressDirty) return
      dirty.value = true
    }),
  )

  // Ctrl/Cmd + click already triggers definition via Monaco; F12 too
  editor.addAction({
    id: 'workspace-goto-definition',
    label: 'Go to Definition',
    keybindings: [monaco.KeyCode.F12],
    run: (ed) => {
      void ed.getAction('editor.action.revealDefinition')?.run()
    },
  })
}

async function load(path: string) {
  error.value = ''
  dirty.value = false
  if (!path) {
    disposeEditor()
    line.value = 1
    column.value = 1
    emitCursor()
    return
  }

  const res = await window.electronAPI.workspaceRead({ path })
  if (!res.ok) {
    error.value = res.error
    disposeEditor()
    emitCursor()
    return
  }

  await nextTick()
  if (!hostRef.value) await nextTick()
  if (!editor) createEditor()
  if (!editor) return

  suppressDirty = true
  const language = languageFromPath(path)
  const model = getOrCreateModel(path, res.content, language)
  editor.setModel(model)
  suppressDirty = false
  dirty.value = false

  const rl = props.revealLine
  const rc = props.revealColumn || 1
  if (rl && rl > 0) {
    editor.revealLineInCenter(rl)
    editor.setPosition({ lineNumber: rl, column: Math.max(1, rc) })
    editor.focus()
  } else {
    editor.setPosition({ lineNumber: 1, column: 1 })
  }
  syncCursorFromEditor()
}

async function save() {
  if (!props.path || !dirty.value || !editor) return
  saving.value = true
  error.value = ''
  try {
    const content = editor.getValue()
    const res = await window.electronAPI.workspaceWrite({
      path: props.path,
      content,
    })
    if (!res.ok) {
      error.value = res.error
      return
    }
    dirty.value = false
    emit('saved', props.path)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.path,
  (p) => {
    void load(p)
  },
)

watch(
  () => [props.revealLine, props.revealColumn, props.path] as const,
  ([rl, rc, p]) => {
    if (!editor || !p || !rl || rl < 1) return
    editor.revealLineInCenter(rl)
    editor.setPosition({ lineNumber: rl, column: Math.max(1, rc || 1) })
    editor.focus()
    syncCursorFromEditor()
  },
)

onMounted(() => {
  applyMonacoTheme(isDarkTheme())
  themeObserver = new MutationObserver(() => applyMonacoTheme(isDarkTheme()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (props.path) void load(props.path)
})

onUnmounted(() => {
  themeObserver?.disconnect()
  themeObserver = null
  disposeEditor()
})

defineExpose({
  save,
  reload: () => load(props.path),
  focus: () => editor?.focus(),
})
</script>
