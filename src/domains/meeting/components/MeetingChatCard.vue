<template>
  <div
    v-if="loading"
    class="flex max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 dark:border-slate-600 dark:bg-slate-900"
  >
    <Icon icon="mdi:loading" class="h-4 w-4 animate-spin" />
    <span>{{ t('meetings.chatCardLoading') }}</span>
  </div>
  <div
    v-else-if="meeting"
    class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-900"
  >
    <button
      type="button"
      class="flex w-full items-start gap-3 rounded-lg text-left outline-none transition hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-green-500/40 dark:hover:bg-green-950/20"
      @click="openDetail"
    >
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
      >
        <Icon icon="mdi:microphone" class="h-5 w-5" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-medium text-slate-900 dark:text-slate-100">{{ meeting.title }}</span>
          <Icon icon="mdi:chevron-right" class="ml-auto h-5 w-5 shrink-0 text-slate-400" />
        </div>
      </div>
    </button>
    <div class="mt-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
      <span class="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {{ durationLabel }}
      </span>
      <MeetingWaveform
        class="min-w-0 flex-1"
        :peaks="meeting.waveformPeaks"
        :progress="playProgress"
        @seek="seekTo"
      />
      <button
        type="button"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!audioReady"
        :title="playing ? t('meetings.pauseAudio') : t('meetings.playAudio')"
        @click="togglePlay"
      >
        <Icon :icon="playing ? 'mdi:pause' : 'mdi:play'" class="h-4 w-4" />
      </button>
    </div>
    <p v-if="loadError" class="mt-1.5 text-xs text-red-600 dark:text-red-400">{{ loadError }}</p>
    <audio
      ref="audioRef"
      preload="metadata"
      class="hidden"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoaded"
      @error="onAudioError"
      @ended="playing = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { db } from '../../../shared/db'
import type { MeetingRecordProps } from '../../../shared/types'
import { setMeetingReturnContext } from '../meetingChatPost'
import MeetingWaveform from './MeetingWaveform.vue'

const props = defineProps<{ meetingId: number }>()

const { t } = useI18n()
const router = useRouter()

const meeting = ref<MeetingRecordProps | null>(null)
const loading = ref(true)
const audioRef = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const audioReady = ref(false)
const loadError = ref('')
let objectUrl: string | null = null

const durationLabel = computed(() => {
  const ms = meeting.value?.durationMs ?? 0
  const sec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const playProgress = computed(() => {
  const total = duration.value > 0 ? duration.value : (meeting.value?.durationMs ?? 0) / 1000
  if (!total) return 0
  return currentTime.value / total
})

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

async function loadMeeting() {
  loading.value = true
  loadError.value = ''
  meeting.value = (await db.meetings.get(props.meetingId)) ?? null
  loading.value = false
}

async function loadAudio() {
  const el = audioRef.value
  const fileName = meeting.value?.audioFileName
  if (!el || !fileName) return
  loadError.value = ''
  audioReady.value = false
  playing.value = false
  currentTime.value = 0
  duration.value = 0
  revokeObjectUrl()
  el.removeAttribute('src')
  el.load()

  const res = await window.electronAPI.meetingReadAudio({ audioFileName: fileName })
  if (!res.ok) {
    loadError.value = res.error ?? t('meetings.audioLoadFailed')
    return
  }
  const blob = new Blob([res.data], { type: res.mime || 'audio/wav' })
  objectUrl = URL.createObjectURL(blob)
  el.src = objectUrl
  el.load()
  audioReady.value = true
}

function togglePlay() {
  const el = audioRef.value
  if (!el || !audioReady.value) return
  if (playing.value) {
    el.pause()
    playing.value = false
  } else {
    void el.play().then(() => {
      playing.value = true
    }).catch((e) => {
      loadError.value = e instanceof Error ? e.message : String(e)
      playing.value = false
    })
  }
}

function onTimeUpdate() {
  currentTime.value = audioRef.value?.currentTime ?? 0
}

function onLoaded() {
  const d = audioRef.value?.duration
  duration.value =
    Number.isFinite(d) && (d ?? 0) > 0 ? (d as number) : (meeting.value?.durationMs ?? 0) / 1000
}

function onAudioError() {
  loadError.value = t('meetings.audioLoadFailed')
  audioReady.value = false
}

function seekTo(ratio: number) {
  const el = audioRef.value
  const total = duration.value > 0 ? duration.value : (meeting.value?.durationMs ?? 0) / 1000
  if (!el || !total) return
  el.currentTime = ratio * total
  currentTime.value = el.currentTime
}

function openDetail() {
  const query: Record<string, string> = { meetingId: String(props.meetingId) }
  if (meeting.value?.conversationId) {
    query.conversationId = String(meeting.value.conversationId)
    query.provider = `${meeting.value.providerId}/${meeting.value.selectedModel}`
    setMeetingReturnContext(
      meeting.value.conversationId,
      `${meeting.value.providerId}/${meeting.value.selectedModel}`,
    )
  }
  router.push({ path: '/meetings', query })
}

onMounted(() => {
  void loadMeeting()
})

onUnmounted(() => {
  audioRef.value?.pause()
  revokeObjectUrl()
})

watch(
  () => props.meetingId,
  () => {
    void loadMeeting()
  },
)

watch(
  () => meeting.value?.audioFileName,
  async (fileName) => {
    if (!fileName) {
      audioReady.value = false
      return
    }
    await nextTick()
    await loadAudio()
  },
)
</script>
