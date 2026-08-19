<template>
  <div class="min-h-[200px] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <div v-if="loading" class="flex items-center gap-2 text-sm text-slate-500">
      <Icon icon="mdi:loading" class="h-5 w-5 animate-spin" />
      <span>{{ progressText || t('meetings.summaryLoading') }}</span>
    </div>
    <div v-else-if="error" class="space-y-3">
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button
        type="button"
        class="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
        @click="emit('retry')"
      >
        {{ t('meetings.retrySummary') }}
      </button>
    </div>
    <div v-else-if="translationText" class="space-y-4 text-sm text-slate-800 dark:text-slate-100">
      <p v-if="translationLabel" class="text-xs font-medium text-green-700 dark:text-green-400">
        {{ translationLabel }}
      </p>
      <p class="whitespace-pre-wrap leading-relaxed text-slate-600 dark:text-slate-300">{{ translationText }}</p>
    </div>
    <div v-else-if="overview || sections.length" class="space-y-4 text-sm text-slate-800 dark:text-slate-100">
      <p class="leading-relaxed text-slate-600 dark:text-slate-300">{{ overview }}</p>
      <div v-for="(sec, i) in sections" :key="i" class="space-y-2">
        <h3 class="font-semibold text-slate-900 dark:text-slate-50">{{ sec.heading }}</h3>
        <ul class="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
          <li v-for="(b, bi) in sec.bullets" :key="bi">{{ b }}</li>
        </ul>
      </div>
    </div>
    <p v-else class="text-sm text-slate-400">{{ t('meetings.noSummary') }}</p>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import type { SummarySection } from '../../../shared/types'

defineProps<{
  overview?: string
  sections: SummarySection[]
  loading?: boolean
  progressText?: string
  error?: string
  translationText?: string
  translationLabel?: string
}>()

const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>
