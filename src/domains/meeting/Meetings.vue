<template>
  <div class="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          @click="goBack"
        >
          <Icon icon="mdi:arrow-left" class="h-4 w-4" />
          {{ returnConversationId != null ? t('meetings.backToChat') : t('meetings.backHome') }}
        </button>
        <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ t('meetings.title') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-full max-w-xs">
          <ProviderSelect :items="providers" v-model="currentProvider" />
        </div>
      </div>
    </div>

    <div
      v-if="!asrConfigured"
      class="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {{ t('meetings.asrNotConfigured') }}
      <RouterLink to="/settings" class="ml-1 underline">{{ t('meetings.goSettings') }}</RouterLink>
    </div>
    <div
      v-else-if="!summaryModelReady"
      class="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {{ t('meetings.summaryModelNotConfigured') }}
      <RouterLink to="/settings" class="ml-1 underline">{{ t('meetings.goSettings') }}</RouterLink>
    </div>

    <MeetingRecorderBar
      :is-recording="meetingStore.isRecording"
      :elapsed-ms="recorder.elapsedMs.value"
      :can-record="asrConfigured && summaryModelReady && !!currentProvider && !summaryLoading"
      :hint="t('meetings.recorderHint')"
      :asr-hint="t('meetings.asrNotConfigured')"
      @toggle="toggleRecording"
    />

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        class="flex w-full shrink-0 flex-col border-b border-slate-200 dark:border-slate-700 md:w-72 md:border-b-0 md:border-r"
      >
        <MeetingList
          :items="meetingStore.sortedItems"
          :selected-id="meetingStore.selectedId"
          @select="onSelectMeeting"
          @rename="(id, title) => meetingStore.renameMeeting(id, title)"
          @delete="(id) => meetingStore.deleteMeeting(id)"
        />
      </aside>

      <main class="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <template v-if="selected">
          <MeetingAudioPlayer
            v-if="selected.audioFileName && selected.status !== 'recording'"
            :audio-file-name="selected.audioFileName"
            :peaks="selected.waveformPeaks"
            :duration-ms="selected.durationMs"
            class="mb-4 shrink-0"
          />

          <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700">
            <div class="flex gap-2">
            <button
              type="button"
              class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              :class="
                activeTab === 'transcript'
                  ? 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              "
              @click="switchTab('transcript')"
            >
              {{ t('meetings.tabTranscript') }}
            </button>
            <button
              type="button"
              class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              :class="
                activeTab === 'summary'
                  ? 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              "
              @click="switchTab('summary')"
            >
              {{ t('meetings.tabSummary') }}
            </button>
            </div>
            <MeetingDetailToolbar
              :title="selected.title"
              :transcript="selected.transcript"
              :overview="selected.summaryOverview"
              :sections="selected.summarySections ?? []"
              :audio-file-name="selected.audioFileName"
              :active-tab="activeTab"
              :has-audio="!!selected.audioFileName && selected.status !== 'recording'"
              :show-original-toggle="!!translationText"
              :provider-name="translateProvider.providerName"
              :selected-model="translateProvider.selectedModel"
              :ui-lang="translateUiLang"
              @translated="onTranslated"
              @show-original="clearTranslation"
            />
          </div>

          <MeetingTranscript
            v-show="activeTab === 'transcript'"
            :transcript="selected.transcript"
            :live-text="liveMidText"
            :is-recording="meetingStore.isRecording && meetingStore.recordingMeetingId === selected.id"
            :empty-hint="t('meetings.emptyTranscript')"
            :translation-text="activeTab === 'transcript' ? translationText : ''"
            :translation-label="activeTab === 'transcript' && translationText ? t('meetings.translationView') : ''"
          />
          <MeetingSummary
            v-show="activeTab === 'summary'"
            :overview="selected.summaryOverview"
            :sections="selected.summarySections ?? []"
            :loading="summaryLoading && selected.id === summarizingId"
            :progress-text="summaryProgress"
            :error="selected.status === 'summary_failed' ? selected.summaryError : undefined"
            :translation-text="activeTab === 'summary' ? translationText : ''"
            :translation-label="activeTab === 'summary' && translationText ? t('meetings.translationView') : ''"
            @retry="() => selected?.id != null && triggerSummary(selected.id)"
          />
        </template>
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500"
        >
          <Icon icon="mdi:microphone-outline" class="mb-3 h-12 w-12 opacity-50" />
          <p>{{ t('meetings.selectOrRecord') }}</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { Icon } from '@iconify/vue'
import { useMeetingStore } from './stores/meeting'
import { useProviderStore } from '../chat/stores/provider'
import { useConversationStore } from '../chat/stores/conversation'
import { useMessageStore } from '../chat/stores/message'
import ProviderSelect from '../../renderer/components/ProviderSelect.vue'
import MeetingList from './components/MeetingList.vue'
import MeetingRecorderBar from './components/MeetingRecorderBar.vue'
import MeetingAudioPlayer from './components/MeetingAudioPlayer.vue'
import MeetingTranscript from './components/MeetingTranscript.vue'
import MeetingSummary from './components/MeetingSummary.vue'
import MeetingDetailToolbar from './components/MeetingDetailToolbar.vue'
import { useMeetingRecorder } from '../speech/useMeetingRecorder'
import { isProviderConfigReady, pickFirstReadyProvider } from '../workspace/providerConfigReady'
import { syncMeetingCardFromDb } from './meetingGlobalHandlers'
import {
  clearMeetingReturnContext,
  readMeetingReturnConversationId,
  readMeetingReturnProvider,
} from './meetingChatPost'
import { db } from '../../shared/db'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const meetingStore = useMeetingStore()
const messageStore = useMessageStore()
const providerStore = useProviderStore()
const conversationStore = useConversationStore()

const providers = computed(() => providerStore.items)
const currentProvider = ref('')
const asrConfigured = ref(false)
const summaryModelReady = ref(false)
const activeTab = ref<'transcript' | 'summary'>('transcript')
const liveMidText = ref('')
const summaryLoading = ref(false)
const summaryProgress = ref('')
const summarizingId = ref<number | null>(null)
const translationText = ref('')

/** 从对话页进入时固定的返回目标，不随左侧会议列表切换而改变 */
const originReturnConversationId = ref<number | undefined>(undefined)

const returnConversationId = computed(() => originReturnConversationId.value)

const recordingMeetingId = ref<number | null>(null)
const recorder = useMeetingRecorder(recordingMeetingId)

const selected = computed(() => meetingStore.selectedMeeting)

const translateUiLang = computed((): 'zh' | 'en' => (locale.value.startsWith('zh') ? 'zh' : 'en'))

const translateProvider = computed(() => {
  const pm = parseProvider()
  if (!pm) return { providerName: '', selectedModel: '' }
  const provider = providerStore.getProviderById(pm.providerId)
  return {
    providerName: provider?.name ?? '',
    selectedModel: pm.selectedModel,
  }
})

async function refreshProviderConfig() {
  try {
    const c = await window.electronAPI.getConfig()
    const pm = parseProvider()
    if (pm) {
      const provider = providerStore.getProviderById(pm.providerId)
      summaryModelReady.value = provider ? isProviderConfigReady(provider.name, c) : false
    } else {
      summaryModelReady.value = false
    }
  } catch {
    summaryModelReady.value = false
  }
}

async function refreshAsrConfig() {
  try {
    const c = await window.electronAPI.getConfig()
    asrConfigured.value = !!(c.baiduAsrAppId?.trim() && c.baiduAsrApiKey?.trim())
  } catch {
    asrConfigured.value = false
  }
}

function defaultTitle() {
  return `${dayjs().format('YYYY-MM-DD HH:mm')} ${t('meetings.defaultTitleSuffix')}`
}

function resolveOriginReturnConversationId(): number | undefined {
  const v = route.query.conversationId
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    if (Number.isFinite(n)) return n
  }
  return readMeetingReturnConversationId()
}

function providerStringFromId(providerId: number, selectedModel: string): string | null {
  if (!Number.isFinite(providerId) || !selectedModel) return null
  if (!providerStore.getProviderById(providerId)) return null
  return `${providerId}/${selectedModel}`
}

async function resolveInitialProvider(fallback: string): Promise<string> {
  const q = route.query.provider
  if (typeof q === 'string' && q.includes('/')) {
    const slash = q.indexOf('/')
    const fromQuery = providerStringFromId(
      parseInt(q.slice(0, slash), 10),
      q.slice(slash + 1),
    )
    if (fromQuery) return fromQuery
  }

  const storedProvider = readMeetingReturnProvider()
  if (storedProvider?.includes('/')) {
    const slash = storedProvider.indexOf('/')
    const fromStored = providerStringFromId(
      parseInt(storedProvider.slice(0, slash), 10),
      storedProvider.slice(slash + 1),
    )
    if (fromStored) return fromStored
  }

  const cid = originReturnConversationId.value
  if (cid != null) {
    let conv = conversationStore.getConversationById(cid)
    if (!conv) conv = (await db.conversations.get(cid)) ?? undefined
    if (conv) {
      const fromConv = providerStringFromId(conv.providerId, conv.selectedModel)
      if (fromConv) return fromConv
    }
  }

  const sel = selected.value
  if (sel) {
    const fromMeeting = providerStringFromId(sel.providerId, sel.selectedModel)
    if (fromMeeting) return fromMeeting
  }

  return fallback
}

async function refreshOriginReturnConversationId() {
  if (originReturnConversationId.value != null) return
  const meetingIdRaw = route.query.meetingId
  if (typeof meetingIdRaw === 'string') {
    const mid = parseInt(meetingIdRaw, 10)
    if (Number.isFinite(mid)) {
      const meeting = await db.meetings.get(mid)
      if (meeting?.conversationId) {
        originReturnConversationId.value = meeting.conversationId
        return
      }
    }
  }
  originReturnConversationId.value = resolveOriginReturnConversationId()
}

async function refreshProviderFromSelection() {
  const cfg = await window.electronAPI.getConfig()
  const fallback = pickFirstReadyProvider(providers.value, cfg)
  currentProvider.value = await resolveInitialProvider(fallback)
  await refreshProviderConfig()
}

function parseProvider(): { providerId: number; selectedModel: string } | null {
  const [providerIdStr, selectedModel] = currentProvider.value.split('/')
  const providerId = parseInt(providerIdStr, 10)
  if (!Number.isFinite(providerId) || !selectedModel) return null
  return { providerId, selectedModel }
}

async function startRecording() {
  const pm = parseProvider()
  if (!pm || !asrConfigured.value || !summaryModelReady.value) return

  const provider = providerStore.getProviderById(pm.providerId)
  if (provider) {
    const check = await window.electronAPI.checkProviderConfigured({ providerName: provider.name })
    if (!check.ok) {
      window.alert(check.error ?? t('meetings.summaryModelNotConfigured'))
      return
    }
  }

  const now = new Date().toISOString()
  const id = await meetingStore.createMeeting({
    title: defaultTitle(),
    status: 'recording',
    transcript: '',
    segments: [],
    audioFileName: '',
    durationMs: 0,
    waveformPeaks: [],
    providerId: pm.providerId,
    selectedModel: pm.selectedModel,
    conversationId: originReturnConversationId.value,
    createdAt: now,
    updatedAt: now,
  })

  recordingMeetingId.value = id
  meetingStore.selectMeeting(id)
  meetingStore.setRecording(true, id)
  activeTab.value = 'transcript'
  liveMidText.value = ''

  const ok = await recorder.start()
  if (!ok) {
    meetingStore.setRecording(false, null)
    recordingMeetingId.value = null
    await meetingStore.deleteMeeting(id)
    if (recorder.error.value) {
      window.alert(recorder.error.value)
    }
  }
}

async function stopRecording() {
  const id = recordingMeetingId.value
  if (id == null) return

  const stopRes = await recorder.stop()
  meetingStore.setRecording(false, null)
  recordingMeetingId.value = null
  liveMidText.value = ''

  if (!stopRes?.ok) {
    await meetingStore.updateMeeting(id, {
      status: 'summary_failed',
      summaryError: stopRes?.error ?? 'STOP_FAILED',
    })
    window.alert(stopRes?.error ?? t('meetings.stopFailed'))
    return
  }

  await meetingStore.updateMeeting(id, {
    status: 'transcribed',
    audioFileName: stopRes.audioFileName,
    durationMs: stopRes.durationMs,
    waveformPeaks: stopRes.waveformPeaks,
  })

  activeTab.value = 'summary'
  await triggerSummary(id)
}

async function toggleRecording() {
  if (meetingStore.isRecording) {
    await stopRecording()
  } else {
    await startRecording()
  }
}

function formatSummaryError(code: string | undefined): string {
  if (!code) return t('meetings.summaryFailed')
  if (code === 'INVALID_SUMMARY_JSON') return t('meetings.summaryJsonFailed')
  if (code.startsWith('Expected ') || code.includes('JSON')) return t('meetings.summaryJsonFailed')
  return code
}

async function triggerSummary(id: number) {
  const meeting = meetingStore.items.find((m) => m.id === id)
  if (!meeting) return
  const provider = providerStore.getProviderById(meeting.providerId)
  if (!provider) return

  if (!meeting.transcript.trim()) {
    await meetingStore.updateMeeting(id, {
      status: 'summary_failed',
      summaryError: t('meetings.emptyTranscriptError'),
    })
    return
  }

  summarizingId.value = id
  summaryLoading.value = true
  summaryProgress.value = t('meetings.summaryLoading')

  const res = await window.electronAPI.meetingSummarize({
    meetingId: id,
    providerName: provider.name,
    selectedModel: meeting.selectedModel,
    transcript: meeting.transcript,
  })

  if (!res.ok) {
    summaryLoading.value = false
    summarizingId.value = null
    await meetingStore.updateMeeting(id, {
      status: 'summary_failed',
      summaryError: formatSummaryError(res.error),
    })
  } else {
    summaryLoading.value = false
    summarizingId.value = null
  }
}

async function syncMeetingToConversation(meetingId: number) {
  await syncMeetingCardFromDb(meetingId)
  await conversationStore.fetchConversations()
}

async function goBack() {
  const cid = originReturnConversationId.value
  if (cid != null) {
    const id =
      recordingMeetingId.value ??
      summarizingId.value ??
      selected.value?.id ??
      meetingStore.items.find((m) => m.conversationId === cid)?.id
    if (id != null) {
      const meeting = await db.meetings.get(id)
      if (
        meeting &&
        meeting.conversationId === cid &&
        meeting.status !== 'recording' &&
        meeting.audioFileName
      ) {
        await syncMeetingToConversation(id)
      }
    }
    clearMeetingReturnContext()
    conversationStore.selectedId = cid
    await messageStore.fetchMessagesByConversation(cid)
    router.push(`/conversation/${cid}`)
    return
  }
  router.push('/')
}

function onSelectMeeting(id: number) {
  meetingStore.selectMeeting(id)
  clearTranslation()
}

function switchTab(tab: 'transcript' | 'summary') {
  activeTab.value = tab
  clearTranslation()
}

function onTranslated(text: string) {
  translationText.value = text
}

function clearTranslation() {
  translationText.value = ''
}

function handleAsrResult(payload: {
  meetingId: number
  type: 'MID_TEXT' | 'FIN_TEXT'
  text: string
  startTime?: number
  endTime?: number
}) {
  if (payload.meetingId !== recordingMeetingId.value) return
  if (payload.type === 'MID_TEXT') {
    liveMidText.value = payload.text
    return
  }
  /* FIN_TEXT 由 App 全局处理器写入转写 */
}

function handleSummaryDone(payload: {
  meetingId: number
  title: string
  overview: string
  sections: { heading: string; bullets: string[] }[]
}) {
  if (summarizingId.value === payload.meetingId) {
    summaryLoading.value = false
    summarizingId.value = null
    summaryProgress.value = ''
  }
  void meetingStore.updateMeeting(payload.meetingId, {
    title: payload.title,
    summaryOverview: payload.overview,
    summarySections: payload.sections,
    status: 'completed',
    summaryError: undefined,
  })
}

function handleSummaryChunk(payload: { meetingId: number; partial: string }) {
  if (summarizingId.value === payload.meetingId) {
    summaryProgress.value = payload.partial
  }
}

function handleSummaryError(payload: { meetingId: number; error: string }) {
  if (summarizingId.value === payload.meetingId) {
    summaryLoading.value = false
    summarizingId.value = null
  }
  void meetingStore.updateMeeting(payload.meetingId, {
    status: 'summary_failed',
    summaryError: formatSummaryError(payload.error),
  })
}

let offAsrResult: (() => void) | undefined
let offAsrError: (() => void) | undefined
let offSummaryDone: (() => void) | undefined
let offSummaryChunk: (() => void) | undefined
let offSummaryError: (() => void) | undefined

onMounted(async () => {
  await refreshAsrConfig()
  await meetingStore.fetchMeetings()
  await providerStore.fetchProviders()
  await conversationStore.fetchConversations()

  await refreshOriginReturnConversationId()

  const cfg = await window.electronAPI.getConfig()
  const fallback = pickFirstReadyProvider(providers.value, cfg)
  currentProvider.value = await resolveInitialProvider(fallback)
  await refreshProviderConfig()

  const incomplete = await meetingStore.findIncompleteRecording()
  if (incomplete?.id != null) {
    const discard = window.confirm(t('meetings.incompletePrompt'))
    if (discard) {
      await meetingStore.discardIncompleteRecording(incomplete.id)
    } else {
      meetingStore.selectMeeting(incomplete.id)
    }
  } else {
    const meetingIdRaw = route.query.meetingId
    if (typeof meetingIdRaw === 'string') {
      const mid = parseInt(meetingIdRaw, 10)
      if (Number.isFinite(mid) && meetingStore.items.some((m) => m.id === mid)) {
        meetingStore.selectMeeting(mid)
      }
    } else if (meetingStore.sortedItems.length > 0 && meetingStore.selectedId == null) {
      meetingStore.selectMeeting(meetingStore.sortedItems[0].id!)
    }
  }

  await refreshProviderFromSelection()

  offAsrResult = window.electronAPI.onMeetingAsrResult(handleAsrResult)
  offAsrError = window.electronAPI.onMeetingAsrError((p) => {
    if (p.meetingId === recordingMeetingId.value) {
      console.warn('[meeting-asr]', p.error)
    }
  })
  offSummaryDone = window.electronAPI.onMeetingSummaryDone(handleSummaryDone)
  offSummaryChunk = window.electronAPI.onMeetingSummaryChunk(handleSummaryChunk)
  offSummaryError = window.electronAPI.onMeetingSummaryError(handleSummaryError)
})

watch(currentProvider, () => {
  void refreshProviderConfig()
})

watch(
  () => meetingStore.selectedId,
  () => {
    void refreshProviderFromSelection()
  },
)

onUnmounted(() => {
  offAsrResult?.()
  offAsrError?.()
  offSummaryDone?.()
  offSummaryChunk?.()
  offSummaryError?.()
})
</script>
