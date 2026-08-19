<template>
  <div class="flex h-full min-h-0 flex-col bg-[#1e1e1e] text-slate-200">
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-black/40 px-2 py-1 text-[11px]"
    >
      <div class="flex min-w-0 items-center gap-2">
        <Icon icon="mdi:console" class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span class="font-medium text-slate-200">{{ t('workspace.terminal') }}</span>
        <span class="truncate text-slate-500">{{ t('workspace.terminalShortcut') }}</span>
        <span v-if="busy" class="text-amber-400">{{ t('workspace.terminalRunning') }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          :title="t('workspace.terminalClear')"
          @click="clear"
        >
          {{ t('workspace.terminalClear') }}
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          :title="t('workspace.terminalKill')"
          @click="restart"
        >
          {{ t('workspace.terminalKill') }}
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          :title="t('workspace.terminalHide')"
          @click="emit('close')"
        >
          <Icon icon="mdi:close" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div ref="hostRef" class="min-h-0 flex-1 px-1 py-1" />
    <p v-if="error" class="shrink-0 px-2 py-1 text-[10px] text-red-400">{{ error }}</p>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const { t } = useI18n()

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const hostRef = ref<HTMLElement | null>(null)
const error = ref('')
const sessionId = ref('')
const busy = ref(false)

const HISTORY_KEY = 'vchat.workspace.terminal.history'
const MAX_HISTORY = 200

let term: Terminal | null = null
let fit: FitAddon | null = null
let removeData: (() => void) | undefined
let removeReady: (() => void) | undefined
let lineBuf = ''
/** 输入行内光标位置（0 = 行首，lineBuf.length = 行尾） */
let cursorPos = 0
let promptVisible = false
let resizeObs: ResizeObserver | null = null
/** 未收齐的 CSI 转义序列（方向键等可能分片到达） */
let escBuf = ''
/** 命令历史：↑↓ 浏览；持久化到 localStorage */
let history: string[] = loadHistory()
/** -1 = 正在编辑新行；否则指向 history 下标 */
let historyIndex = -1
/** 开始按↑时暂存的当前输入，按↓回到末尾时恢复 */
let draftBeforeHistory = ''

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string').slice(-MAX_HISTORY)
  } catch {
    return []
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch {
    /* quota / private mode */
  }
}

function pushHistory(cmd: string) {
  const text = cmd.trim()
  if (!text) return
  if (history[history.length - 1] === text) {
    historyIndex = -1
    draftBeforeHistory = ''
    return
  }
  history.push(text)
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY)
  saveHistory()
  historyIndex = -1
  draftBeforeHistory = ''
}

function writeLocal(text: string) {
  term?.write(text)
}

function moveLeft() {
  if (busy.value || cursorPos <= 0) return
  writeLocal('\x1b[D')
  cursorPos -= 1
}

function moveRight() {
  if (busy.value || cursorPos >= lineBuf.length) return
  writeLocal('\x1b[C')
  cursorPos += 1
}

function moveHome() {
  if (busy.value || cursorPos <= 0) return
  writeLocal(`\x1b[${cursorPos}D`)
  cursorPos = 0
}

function moveEnd() {
  if (busy.value || cursorPos >= lineBuf.length) return
  writeLocal(`\x1b[${lineBuf.length - cursorPos}C`)
  cursorPos = lineBuf.length
}

function clearInputLine() {
  if (cursorPos > 0) writeLocal(`\x1b[${cursorPos}D`)
  writeLocal('\x1b[K')
  lineBuf = ''
  cursorPos = 0
}

function replaceInputLine(next: string) {
  clearInputLine()
  lineBuf = next
  cursorPos = next.length
  if (next) writeLocal(next)
}

function historyUp() {
  if (busy.value || history.length === 0) return
  if (historyIndex === -1) {
    draftBeforeHistory = lineBuf
    historyIndex = history.length - 1
  } else if (historyIndex > 0) {
    historyIndex -= 1
  } else {
    return
  }
  replaceInputLine(history[historyIndex] ?? '')
}

function historyDown() {
  if (busy.value || historyIndex === -1) return
  if (historyIndex < history.length - 1) {
    historyIndex += 1
    replaceInputLine(history[historyIndex] ?? '')
    return
  }
  historyIndex = -1
  replaceInputLine(draftBeforeHistory)
  draftBeforeHistory = ''
}

function prompt() {
  if (busy.value) return
  writeLocal('\x1b[32m>\x1b[0m ')
  promptVisible = true
  cursorPos = 0
  lineBuf = ''
}

async function ensureSession() {
  if (sessionId.value) return
  error.value = ''
  const cols = term?.cols ?? 80
  const rows = term?.rows ?? 24
  const res = await window.electronAPI.terminalCreate({ cols, rows })
  if (!res.ok) {
    error.value = res.error
    writeLocal(`\r\n\x1b[31m${res.error}\x1b[0m\r\n`)
    return
  }
  sessionId.value = res.id
}

async function killSession() {
  if (!sessionId.value) return
  await window.electronAPI.terminalKill({ id: sessionId.value })
  sessionId.value = ''
  lineBuf = ''
  cursorPos = 0
  busy.value = false
  promptVisible = false
  historyIndex = -1
  draftBeforeHistory = ''
  escBuf = ''
}

async function restart() {
  await killSession()
  writeLocal('\r\n\x1b[90m--- restarted ---\x1b[0m\r\n')
  await ensureSession()
  prompt()
  term?.focus()
}

function clear() {
  term?.clear()
  lineBuf = ''
  cursorPos = 0
  if (!busy.value) prompt()
  term?.focus()
}

async function interrupt() {
  lineBuf = ''
  cursorPos = 0
  historyIndex = -1
  draftBeforeHistory = ''
  if (!sessionId.value) {
    writeLocal('^C\r\n')
    prompt()
    return
  }
  if (busy.value) {
    await window.electronAPI.terminalInterrupt({ id: sessionId.value })
    busy.value = false
    return
  }
  writeLocal('^C\r\n')
  prompt()
}

async function submitLine() {
  const line = lineBuf
  // 光标若不在行尾，先移到行尾再换行，避免残留半行显示
  if (cursorPos < lineBuf.length) {
    writeLocal(`\x1b[${lineBuf.length - cursorPos}C`)
  }
  lineBuf = ''
  cursorPos = 0
  historyIndex = -1
  draftBeforeHistory = ''
  writeLocal('\r\n')
  promptVisible = false
  if (!sessionId.value) await ensureSession()
  if (!sessionId.value) return

  if (!line.trim()) {
    prompt()
    return
  }

  pushHistory(line)
  busy.value = true
  const res = await window.electronAPI.terminalWrite({
    id: sessionId.value,
    data: `${line}\n`,
  })
  if (!res.ok) {
    busy.value = false
    if (res.error === 'busy') {
      writeLocal(`\x1b[33m${t('workspace.terminalBusy')}\x1b[0m\r\n`)
    } else if (res.error) {
      writeLocal(`\x1b[31m${res.error}\x1b[0m\r\n`)
    }
    prompt()
  }
}

function handleCsi(params: string, finalByte: string) {
  if (finalByte === 'A') historyUp()
  else if (finalByte === 'B') historyDown()
  else if (finalByte === 'C') moveRight()
  else if (finalByte === 'D') moveLeft()
  else if (finalByte === 'H' || (finalByte === '~' && (params === '1' || params === '7'))) moveHome()
  else if (finalByte === 'F' || (finalByte === '~' && (params === '4' || params === '8'))) moveEnd()
}

function onTermData(data: string) {
  const s = escBuf + data
  escBuf = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]!

    // ESC [ ... final  （方向键等）
    if (ch === '\x1b') {
      if (i + 1 >= s.length) {
        escBuf = s.slice(i)
        return
      }
      if (s[i + 1] === '[') {
        let j = i + 2
        while (j < s.length) {
          const c = s.charCodeAt(j)
          if (c >= 0x40 && c <= 0x7e) break
          j += 1
        }
        if (j >= s.length) {
          escBuf = s.slice(i)
          return
        }
        handleCsi(s.slice(i + 2, j), s[j]!)
        i = j + 1
        continue
      }
      // 其它 ESC 序列：尽量跳过
      i += 2
      continue
    }

    if (ch === '\r') {
      if (!busy.value) void submitLine()
      i += 1
      continue
    }

    const code = ch.charCodeAt(0)
    if (code === 0x7f || code === 0x08) {
      if (!busy.value && cursorPos > 0) {
        lineBuf = lineBuf.slice(0, cursorPos - 1) + lineBuf.slice(cursorPos)
        cursorPos -= 1
        writeLocal('\b')
        const suffix = lineBuf.slice(cursorPos)
        writeLocal(`${suffix} `)
        writeLocal(`\x1b[${suffix.length + 1}D`)
        historyIndex = -1
        draftBeforeHistory = ''
      }
      i += 1
      continue
    }
    if (code === 0x03) {
      void interrupt()
      i += 1
      continue
    }
    if (code === 0x0c) {
      if (!busy.value) clear()
      i += 1
      continue
    }
    if (busy.value || code < 32) {
      i += 1
      continue
    }
    // 手动改字后退出历史浏览态
    if (historyIndex !== -1) {
      historyIndex = -1
      draftBeforeHistory = ''
    }
    lineBuf = lineBuf.slice(0, cursorPos) + ch + lineBuf.slice(cursorPos)
    cursorPos += 1
    const suffix = lineBuf.slice(cursorPos)
    writeLocal(ch + suffix)
    if (suffix.length > 0) writeLocal(`\x1b[${suffix.length}D`)
    i += 1
  }
}

function fitNow() {
  try {
    fit?.fit()
    if (sessionId.value && term) {
      void window.electronAPI.terminalResize({
        id: sessionId.value,
        cols: term.cols,
        rows: term.rows,
      })
    }
  } catch {
    /* ignore */
  }
}

async function mountTerminal() {
  if (!hostRef.value || term) return
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
    },
    scrollback: 5000,
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(hostRef.value)
  term.onData(onTermData)

  removeData = window.electronAPI.onTerminalData((payload) => {
    if (payload.id !== sessionId.value) return
    writeLocal(payload.data)
  })
  removeReady = window.electronAPI.onTerminalReady((payload) => {
    if (payload.id !== sessionId.value) return
    busy.value = false
    if (!promptVisible) prompt()
    term?.focus()
  })

  await nextTick()
  fitNow()
  await ensureSession()
  term.focus()

  resizeObs = new ResizeObserver(() => fitNow())
  resizeObs.observe(hostRef.value)
}

onMounted(() => {
  if (props.active) void mountTerminal()
})

watch(
  () => props.active,
  async (on) => {
    if (on) {
      if (!term) await mountTerminal()
      else {
        await nextTick()
        fitNow()
        term.focus()
      }
    }
  },
)

onUnmounted(() => {
  resizeObs?.disconnect()
  resizeObs = null
  removeData?.()
  removeReady?.()
  void killSession()
  term?.dispose()
  term = null
  fit = null
})

defineExpose({ focus: () => term?.focus(), fit: fitNow, restart })
</script>
