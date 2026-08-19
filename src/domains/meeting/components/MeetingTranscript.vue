<template>
  <div
    ref="scrollRef"
    class="min-h-[200px] flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
  >
    <p v-if="translationLabel" class="mb-2 text-xs font-medium text-green-700 dark:text-green-400">
      {{ translationLabel }}
    </p>
    <p v-if="!displayText" class="text-slate-400 dark:text-slate-500">{{ emptyHint }}</p>
    <template v-else>{{ displayText }}</template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  transcript: string
  liveText?: string
  isRecording?: boolean
  emptyHint: string
  translationText?: string
  translationLabel?: string
}>()

const scrollRef = ref<HTMLDivElement | null>(null)

const displayText = computed(() => {
  if (props.translationText?.trim()) return props.translationText.trim()
  const base = props.transcript.trim()
  const live = (props.liveText ?? '').trim()
  if (props.isRecording && live && !base.endsWith(live)) {
    return base ? `${base}\n${live}` : live
  }
  return base || live
})

watch(displayText, async () => {
  if (!props.isRecording) return
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
})
</script>
