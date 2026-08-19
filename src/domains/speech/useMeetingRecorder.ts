import { onUnmounted, ref, type Ref } from 'vue'
import { floatTo16BitPCM } from './wavEncode'

const TARGET_RATE = 16000

export function useMeetingRecorder(meetingId: Ref<number | null>) {
  const recording = ref(false)
  const error = ref<string | null>(null)
  const elapsedMs = ref(0)

  let audioCtx: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let processor: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let pcmBuffer: Int16Array[] = []
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  function resampleTo16k(input: Float32Array, inRate: number): Int16Array {
    if (inRate === TARGET_RATE) {
      return floatTo16BitPCM(input)
    }
    const outLen = Math.max(1, Math.round(input.length * (TARGET_RATE / inRate)))
    const resampled = new Float32Array(outLen)
    const scale = inRate / TARGET_RATE
    for (let i = 0; i < outLen; i++) {
      const idx = Math.min(Math.floor(i * scale), input.length - 1)
      resampled[i] = input[idx] ?? 0
    }
    return floatTo16BitPCM(resampled)
  }

  function flushPcm() {
    const id = meetingId.value
    if (id == null || pcmBuffer.length === 0) return
    const total = pcmBuffer.reduce((n, b) => n + b.length, 0)
    const merged = new Int16Array(total)
    let offset = 0
    for (const chunk of pcmBuffer) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    pcmBuffer = []
    const buf = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength)
    window.electronAPI.meetingAsrSendAudio({ meetingId: id, pcm: buf })
  }

  async function start(): Promise<boolean> {
    error.value = null
    const id = meetingId.value
    if (id == null) {
      error.value = 'NO_MEETING_ID'
      return false
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      audioCtx = new AudioContext()
      const inRate = audioCtx.sampleRate
      source = audioCtx.createMediaStreamSource(mediaStream)
      processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0)
        pcmBuffer.push(resampleTo16k(input, inRate))
      }
      source.connect(processor)
      processor.connect(audioCtx.destination)

      const startRes = await window.electronAPI.meetingAsrStart({ meetingId: id })
      if (!startRes.ok) {
        error.value = startRes.error
        await cleanup()
        return false
      }

      startedAt = Date.now()
      elapsedMs.value = 0
      elapsedTimer = setInterval(() => {
        elapsedMs.value = Date.now() - startedAt
      }, 200)
      flushTimer = setInterval(flushPcm, 150)
      recording.value = true
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      await cleanup()
      return false
    }
  }

  async function cleanup() {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    flushPcm()
    processor?.disconnect()
    source?.disconnect()
    processor = null
    source = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    if (audioCtx) {
      await audioCtx.close().catch(() => {})
      audioCtx = null
    }
    pcmBuffer = []
    recording.value = false
  }

  async function stop() {
    flushPcm()
    await cleanup()
    const id = meetingId.value
    if (id == null) return null
    return window.electronAPI.meetingAsrStop({ meetingId: id })
  }

  onUnmounted(() => {
    void cleanup()
  })

  return { recording, error, elapsedMs, start, stop, cleanup }
}
