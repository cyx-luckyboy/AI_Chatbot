<template>

  <div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">

    <div class="flex items-center justify-between gap-3">

      <span class="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-300">

        {{ formatTime(currentTime) }} / {{ formatTime(displayDuration) }}

      </span>

      <div class="flex items-center gap-2">

        <select

          v-model="playbackRate"

          class="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"

          @change="applyRate"

        >

          <option v-for="r in rates" :key="r" :value="r">{{ r }}x</option>

        </select>

        <button

          type="button"

          class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"

          :disabled="!audioReady"

          @click="togglePlay"

        >

          <Icon :icon="playing ? 'mdi:pause' : 'mdi:play'" class="h-5 w-5" />

        </button>

      </div>

    </div>

    <MeetingWaveform

      :peaks="peaks"

      :progress="displayDuration > 0 ? currentTime / displayDuration : 0"

      @seek="seekTo"

    />

    <p v-if="loadError" class="text-xs text-red-600 dark:text-red-400">{{ loadError }}</p>

    <audio

      ref="audioRef"

      preload="metadata"

      @timeupdate="onTimeUpdate"

      @loadedmetadata="onLoaded"

      @error="onAudioError"

      @ended="playing = false"

    />

  </div>

</template>



<script setup lang="ts">

import { Icon } from '@iconify/vue'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import MeetingWaveform from './MeetingWaveform.vue'



const props = defineProps<{

  audioFileName: string

  peaks: number[]

  durationMs?: number

}>()



const audioRef = ref<HTMLAudioElement | null>(null)

const playing = ref(false)

const currentTime = ref(0)

const duration = ref(0)

const playbackRate = ref(1)

const audioReady = ref(false)

const loadError = ref('')

const rates = [0.5, 1, 1.5, 2]



let objectUrl: string | null = null



const displayDuration = computed(() => {

  if (duration.value > 0) return duration.value

  return (props.durationMs ?? 0) / 1000

})



function formatTime(sec: number): string {

  const s = Math.max(0, Math.floor(sec))

  const m = Math.floor(s / 60)

  const r = s % 60

  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`

}



function revokeObjectUrl() {

  if (objectUrl) {

    URL.revokeObjectURL(objectUrl)

    objectUrl = null

  }

}



async function loadAudio() {

  const el = audioRef.value

  if (!el || !props.audioFileName) return

  loadError.value = ''

  audioReady.value = false

  playing.value = false

  currentTime.value = 0

  duration.value = 0

  revokeObjectUrl()

  el.removeAttribute('src')

  el.load()



  const res = await window.electronAPI.meetingReadAudio({ audioFileName: props.audioFileName })

  if (!res.ok) {

    loadError.value = res.error

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

    })

  }

}



function applyRate() {

  const el = audioRef.value

  if (el) el.playbackRate = playbackRate.value

}



function onTimeUpdate() {

  currentTime.value = audioRef.value?.currentTime ?? 0

}



function onLoaded() {

  const d = audioRef.value?.duration

  duration.value = Number.isFinite(d) && (d ?? 0) > 0 ? (d as number) : (props.durationMs ?? 0) / 1000

  applyRate()

}



function onAudioError() {

  loadError.value = '音频加载失败'

  audioReady.value = false

}



function seekTo(ratio: number) {

  const el = audioRef.value

  const total = displayDuration.value

  if (!el || !total) return

  el.currentTime = ratio * total

  currentTime.value = el.currentTime

}



onMounted(() => {

  void loadAudio()

})



onUnmounted(() => {

  audioRef.value?.pause()

  revokeObjectUrl()

})



watch(() => props.audioFileName, () => {

  void loadAudio()

})

</script>


