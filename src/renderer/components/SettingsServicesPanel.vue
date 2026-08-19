<template>
  <div class="setting-item flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
    <label class="w-28 shrink-0 pt-1 text-sm font-medium text-gray-700 dark:text-slate-300">
      {{ t('settings.servicesTitle') }}
    </label>
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <p class="text-xs leading-snug text-gray-500 dark:text-slate-400">{{ t('settings.servicesHint') }}</p>

      <div
        v-if="!vendorOk"
        class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
      >
        {{ t('settings.servicesVendorMissing') }}
      </div>

      <div class="space-y-2">
        <div
          v-for="row in rows"
          :key="row.id"
          class="rounded-lg border transition-colors dark:border-slate-700"
          :class="
            expandedId === row.id
              ? 'border-green-500/60 bg-green-50/40 dark:border-green-600/40 dark:bg-green-950/20'
              : 'border-gray-200 bg-white dark:bg-slate-900/40'
          "
        >
          <div
            class="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5"
            role="button"
            tabindex="0"
            @click="toggleLogs(row.id)"
            @keydown.enter.prevent="toggleLogs(row.id)"
          >
            <span
              class="inline-flex h-2 w-2 shrink-0 rounded-full"
              :class="statusDotClass(row)"
              :title="row.up ? 'UP' : 'DOWN'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium text-gray-800 dark:text-slate-100">{{ row.label }}</span>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  :class="
                    row.up
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  "
                >
                  {{ row.up ? t('settings.servicesUp') : row.starting ? t('settings.servicesStarting') : t('settings.servicesDown') }}
                </span>
                <span v-if="row.managed" class="text-[10px] text-gray-400 dark:text-slate-500">
                  {{ t('settings.servicesManaged') }}
                </span>
              </div>
              <p class="truncate font-mono text-[11px] text-gray-500 dark:text-slate-400">{{ row.target }}</p>
              <p v-if="row.detail || row.error" class="text-[11px] text-gray-500 dark:text-slate-400">
                {{ row.detail || row.error }}
                <span v-if="row.latencyMs != null"> · {{ row.latencyMs }}ms</span>
              </p>
            </div>
            <Button
              type="button"
              plain
              class="shrink-0"
              :disabled="row.up || row.starting || startingId === row.id"
              @click.stop="startService(row.id)"
            >
              {{ row.up ? t('settings.servicesRunning') : t('settings.servicesStart') }}
            </Button>
            <span class="shrink-0 text-xs text-gray-400 dark:text-slate-500">
              {{ expandedId === row.id ? t('settings.servicesHideLogs') : t('settings.servicesViewLogs') }}
            </span>
          </div>

          <div
            v-if="expandedId === row.id"
            class="border-t border-gray-200 px-2 py-2 dark:border-slate-700"
            @click.stop
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-gray-600 dark:text-slate-300">
                {{ t('settings.servicesLogs', { name: row.label }) }}
              </span>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                  @click="refreshLogs(row.id)"
                >
                  {{ t('settings.servicesLogsRefresh') }}
                </button>
                <button
                  type="button"
                  class="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                  @click="clearLogs(row.id)"
                >
                  {{ t('settings.servicesLogsClear') }}
                </button>
              </div>
            </div>
            <div
              ref="logBoxRef"
              class="max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-slate-50 px-2 py-1 font-mono text-[11px] leading-relaxed text-gray-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300"
            >
              <p v-if="!logsFor(row.id).length" class="text-gray-400 dark:text-slate-500">
                {{ t('settings.servicesLogsEmpty') }}
              </p>
              <p
                v-for="entry in logsFor(row.id)"
                :key="entry.id"
                class="whitespace-pre-wrap break-all"
                :class="{
                  'text-emerald-700 dark:text-emerald-400': entry.level === 'ok',
                  'text-amber-700 dark:text-amber-300': entry.level === 'warn',
                  'text-red-600 dark:text-red-400': entry.level === 'error',
                }"
              >
                {{ formatLogLine(entry) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" plain :disabled="refreshing" @click="refreshStatus">
          {{ t('settings.servicesRefresh') }}
        </Button>
        <span v-if="lastChecked" class="text-[11px] text-gray-400 dark:text-slate-500">
          {{ t('settings.servicesLastCheck', { time: lastChecked }) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './Button.vue'

type ServiceId = 'tts' | 'voice-bot'

type ServiceLogEntry = {
  id: string
  at: string
  level: 'info' | 'ok' | 'warn' | 'error'
  stream: 'stdout' | 'stderr' | 'system'
  message: string
}

type ServiceStatusItem = {
  id: ServiceId
  target: string
  up: boolean
  latencyMs?: number
  detail?: string
  error?: string
  managed: boolean
  starting: boolean
}

const { t } = useI18n()

const statusItems = ref<ServiceStatusItem[]>([])
const vendorOk = ref(true)
const expandedId = ref<ServiceId | null>(null)
const startingId = ref<ServiceId | null>(null)
const refreshing = ref(false)
const lastChecked = ref('')
const logBoxRef = ref<HTMLElement | null>(null)
const logs = ref<Record<ServiceId, ServiceLogEntry[]>>({ tts: [], 'voice-bot': [] })

let pollTimer: ReturnType<typeof setInterval> | undefined
let unsubLog: (() => void) | null = null

const rows = computed(() =>
  statusItems.value.map((item) => ({
    ...item,
    label: item.id === 'tts' ? t('settings.servicesTts') : t('settings.servicesVoiceBot'),
  })),
)

function statusDotClass(row: ServiceStatusItem) {
  if (row.starting || startingId.value === row.id) return 'bg-amber-400 animate-pulse'
  if (row.up) return 'bg-emerald-500'
  return 'bg-red-400'
}

function logsFor(id: ServiceId): ServiceLogEntry[] {
  return logs.value[id] || []
}

function formatLogLine(entry: ServiceLogEntry): string {
  const time = entry.at.includes('T') ? entry.at.slice(11, 19) : entry.at
  const stream = entry.stream !== 'system' ? `[${entry.stream}] ` : ''
  return `${time} ${stream}${entry.message}`
}

function toggleLogs(id: ServiceId) {
  expandedId.value = expandedId.value === id ? null : id
  if (expandedId.value === id) void refreshLogs(id)
}

async function refreshLogs(id: ServiceId) {
  try {
    const r = await window.electronAPI.servicesGetLogs(id)
    logs.value[id] = r.logs || []
    await nextTick()
    if (logBoxRef.value) logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight
  } catch {
    /* ignore */
  }
}

async function clearLogs(id: ServiceId) {
  try {
    await window.electronAPI.servicesClearLogs(id)
    logs.value[id] = []
  } catch {
    /* ignore */
  }
}

async function refreshStatus() {
  refreshing.value = true
  try {
    const r = await window.electronAPI.servicesGetStatus()
    statusItems.value = r.items || []
    vendorOk.value = Boolean(r.vendorPipecat && r.vendorTts)
    const now = new Date()
    lastChecked.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  } catch {
    /* ignore */
  } finally {
    refreshing.value = false
  }
}

async function startService(id: ServiceId) {
  startingId.value = id
  expandedId.value = id
  try {
    const r = await window.electronAPI.servicesStart(id)
    if (!r.ok && r.error) {
      logs.value[id] = [
        ...logs.value[id],
        {
          id: `err-${Date.now()}`,
          at: new Date().toISOString(),
          level: 'error',
          stream: 'system',
          message: r.error,
        },
      ]
    }
    await refreshLogs(id)
    await refreshStatus()
  } finally {
    startingId.value = null
  }
}

onMounted(() => {
  void refreshStatus()
  for (const id of ['tts', 'voice-bot'] as ServiceId[]) {
    void refreshLogs(id)
  }
  pollTimer = setInterval(() => {
    void refreshStatus()
  }, 4000)
  unsubLog = window.electronAPI.onServiceLog(({ serviceId, entry }) => {
    const sid = serviceId as ServiceId
    logs.value[sid] = [...(logs.value[sid] || []), entry].slice(-200)
    if (expandedId.value === sid) {
      void nextTick(() => {
        if (logBoxRef.value) logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight
      })
    }
    void refreshStatus()
  })
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  unsubLog?.()
  unsubLog = null
})
</script>
