<template>
  <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
    <div class="flex items-center gap-3">
      <span
        v-if="isRecording"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        {{ formatTime(elapsedMs) }}
      </span>
      <span v-else class="text-sm text-slate-500">{{ hint }}</span>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors"
      :class="
        isRecording
          ? 'bg-red-600 hover:bg-red-700'
          : canRecord
            ? 'bg-green-600 hover:bg-green-700'
            : 'cursor-not-allowed bg-slate-400'
      "
      :disabled="!canRecord && !isRecording"
      :title="!canRecord && !isRecording ? asrHint : undefined"
      @click="emit('toggle')"
    >
      <Icon :icon="isRecording ? 'mdi:stop' : 'mdi:microphone'" class="h-5 w-5" />
      {{ isRecording ? t('meetings.stopRecording') : t('meetings.startRecording') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  isRecording: boolean
  elapsedMs: number
  canRecord: boolean
  hint: string
  asrHint: string
}>()

const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n()

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
</script>
