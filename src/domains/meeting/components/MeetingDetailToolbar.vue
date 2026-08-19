<template>
  <div class="flex shrink-0 flex-wrap items-center gap-1">
    <DropdownMenuRoot>
      <DropdownMenuTrigger
        type="button"
        class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        :title="t('meetings.copy')"
      >
        <Icon :icon="copied ? 'mdi:check' : 'radix-icons:copy'" class="h-4 w-4" />
        <span class="hidden sm:inline">{{ t('meetings.copy') }}</span>
        <Icon icon="radix-icons:chevron-down" class="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="z-50 min-w-[140px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          align="end"
        >
          <DropdownMenuItem
            class="cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 data-[disabled]:opacity-40 dark:hover:bg-slate-800"
            :disabled="!hasTranscript"
            @select="copyTranscript"
          >
            {{ t('meetings.copyTranscript') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 data-[disabled]:opacity-40 dark:hover:bg-slate-800"
            :disabled="!hasSummary"
            @select="copySummary"
          >
            {{ t('meetings.copySummary') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <DropdownMenuRoot>
      <DropdownMenuTrigger
        type="button"
        class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        :disabled="!canTranslate"
        :title="t('meetings.translate')"
      >
        <Icon icon="material-symbols:translate" class="h-4 w-4" />
        <span class="hidden sm:inline">{{ t('meetings.translate') }}</span>
        <Icon icon="radix-icons:chevron-down" class="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          align="end"
        >
          <DropdownMenuItem
            v-for="opt in translateOptions"
            :key="opt.id"
            class="cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800"
            @select="() => translateTo(opt.id)"
          >
            {{ t(opt.labelKey) }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <button
      v-if="showOriginalToggle"
      type="button"
      class="inline-flex h-8 items-center rounded-md px-2 text-xs text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
      @click="emit('show-original')"
    >
      {{ t('meetings.showOriginal') }}
    </button>

    <button
      type="button"
      class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
      :disabled="!hasAudio"
      :title="t('meetings.downloadAudio')"
      @click="downloadAudio"
    >
      <Icon icon="mdi:download" class="h-4 w-4" />
      <span class="hidden sm:inline">{{ t('meetings.downloadAudio') }}</span>
    </button>

    <span v-if="translating" class="text-xs text-slate-400">{{ t('meetings.translating') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'radix-vue'
import type { SummarySection, TranslateTargetId } from '../../../shared/types'
import { formatSummaryAsText } from '../meetingTextExport'
import { translateLongText } from '../meetingTranslate'

const props = defineProps<{
  title: string
  transcript: string
  overview?: string
  sections: SummarySection[]
  audioFileName: string
  activeTab: 'transcript' | 'summary'
  hasAudio: boolean
  showOriginalToggle?: boolean
  providerName: string
  selectedModel: string
  uiLang: 'zh' | 'en'
}>()

const emit = defineEmits<{
  translated: [text: string]
  'show-original': []
}>()

const { t } = useI18n()
const copied = ref(false)
const translating = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const hasTranscript = computed(() => !!props.transcript.trim())
const hasSummary = computed(
  () => !!(props.overview?.trim() || (props.sections?.length ?? 0) > 0),
)
const canTranslate = computed(
  () =>
    !!props.providerName &&
    !!props.selectedModel &&
    (props.activeTab === 'transcript' ? hasTranscript.value : hasSummary.value),
)

const translateOptions = [
  { id: 'en' as const, labelKey: 'meetings.translateToEn' as const },
  { id: 'zh-Hans' as const, labelKey: 'meetings.translateToZhHans' as const },
  { id: 'zh-Hant' as const, labelKey: 'meetings.translateToZhHant' as const },
]

async function copyText(text: string) {
  if (!text.trim()) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    window.alert(t('meetings.copyFailed'))
  }
}

function copyTranscript() {
  void copyText(props.transcript.trim())
}

function copySummary() {
  void copyText(formatSummaryAsText(props.title, props.overview, props.sections))
}

function translateErrorMessage(code: string): string {
  if (code === 'FAILED' || code === 'TIMEOUT') return t('common.translateFailed')
  if (code === 'EMPTY') return t('common.translateEmpty')
  if (code === 'NO_PROVIDER') return t('meetings.summaryModelNotConfigured')
  return code
}

async function translateTo(target: TranslateTargetId) {
  const source =
    props.activeTab === 'transcript'
      ? props.transcript.trim()
      : formatSummaryAsText(props.title, props.overview, props.sections)
  if (!source) return
  if (!props.providerName || !props.selectedModel) {
    window.alert(t('meetings.summaryModelNotConfigured'))
    return
  }
  translating.value = true
  try {
    const out = await translateLongText(
      source,
      target,
      props.providerName,
      props.selectedModel,
      props.uiLang,
    )
    emit('translated', out)
  } catch (e) {
    const code = e instanceof Error ? e.message : ''
    window.alert(code ? translateErrorMessage(code) : t('common.translateFailed'))
  } finally {
    translating.value = false
  }
}

async function downloadAudio() {
  if (!props.audioFileName) return
  const base = props.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'meeting'
  const res = await window.electronAPI.meetingSaveAudioAs({
    audioFileName: props.audioFileName,
    suggestedName: `${base}.wav`,
  })
  if (!res.ok && !res.cancelled && res.error) {
    window.alert(res.error)
  }
}
</script>
