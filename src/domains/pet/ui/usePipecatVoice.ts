import { ref } from 'vue'

export type PipecatVoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

const INPUT_SAMPLE_RATE = 16_000
const OUTPUT_SAMPLE_RATE = 24_000

function pcm16ToFloat32(data: ArrayBuffer): Float32Array {
  const samples = new Int16Array(data)
  const output = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) output[i] = samples[i] / 32768
  return output
}

function resampleFloat32(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return data
  const length = Math.max(1, Math.round(data.length * toRate / fromRate))
  const output = new Float32Array(length)
  const ratio = fromRate / toRate
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(data.length - 1, left + 1)
    const weight = position - left
    output[i] = data[left] * (1 - weight) + data[right] * weight
  }
  return output
}

function float32ToPcm16(data: Float32Array): ArrayBuffer {
  const output = new Int16Array(data.length)
  for (let i = 0; i < data.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, data[i]))
    output[i] = sample < 0 ? sample * 32768 : sample * 32767
  }
  return output.buffer
}

export function usePipecatVoice() {
  const status = ref<PipecatVoiceStatus>('idle')
  const error = ref('')
  const active = ref(false)

  let socket: WebSocket | null = null
  let inputContext: AudioContext | null = null
  let outputContext: AudioContext | null = null
  let inputStream: MediaStream | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let inputProcessor: ScriptProcessorNode | null = null
  let inputMute: GainNode | null = null
  let nextPlayTime = 0
  let sources = new Set<AudioBufferSourceNode>()
  let finishTimer: number | null = null
  let lastAudioAt = 0

  function setStatus(next: PipecatVoiceStatus, detail = '') {
    status.value = next
    error.value = detail
  }

  function clearFinishTimer() {
    if (finishTimer != null) {
      window.clearTimeout(finishTimer)
      finishTimer = null
    }
  }

  function stopPlayback() {
    clearFinishTimer()
    for (const source of sources) {
      try {
        source.stop()
      } catch {
        /* already ended */
      }
      source.disconnect()
    }
    sources = new Set()
    nextPlayTime = outputContext?.currentTime ?? 0
    if (active.value) setStatus('listening')
  }

  function scheduleOutput(data: ArrayBuffer) {
    if (!outputContext || data.byteLength < 2) return
    const samples = pcm16ToFloat32(data)
    const buffer = outputContext.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE)
    buffer.copyToChannel(samples, 0)
    const source = outputContext.createBufferSource()
    source.buffer = buffer
    source.connect(outputContext.destination)

    const startAt = Math.max(nextPlayTime, outputContext.currentTime + 0.025)
    nextPlayTime = startAt + buffer.duration
    lastAudioAt = performance.now()
    sources.add(source)
    clearFinishTimer()
    setStatus('speaking')
    source.onended = () => {
      sources.delete(source)
      source.disconnect()
      if (sources.size === 0) {
        finishTimer = window.setTimeout(() => {
          finishTimer = null
          if (active.value && performance.now() - lastAudioAt >= 80) setStatus('listening')
        }, 90)
      }
    }
    source.start(startAt)
  }

  function startCapture() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !inputContext || !inputStream) return
    inputSource = inputContext.createMediaStreamSource(inputStream)
    inputProcessor = inputContext.createScriptProcessor(2048, 1, 1)
    inputMute = inputContext.createGain()
    inputMute.gain.value = 0
    inputProcessor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      let energy = 0
      for (let i = 0; i < input.length; i += 1) energy += input[i] * input[i]
      const rms = Math.sqrt(energy / Math.max(1, input.length))
      if (rms > 0.035 && status.value === 'speaking') stopPlayback()
      if (socket?.readyState === WebSocket.OPEN) {
        const inputRate = inputContext?.sampleRate ?? INPUT_SAMPLE_RATE
        const pcmInput = resampleFloat32(input, inputRate, INPUT_SAMPLE_RATE)
        socket.send(float32ToPcm16(pcmInput))
      }
    }
    inputSource.connect(inputProcessor)
    inputProcessor.connect(inputMute)
    inputMute.connect(inputContext.destination)
  }

  async function connect() {
    if (active.value || status.value === 'connecting') return
    setStatus('connecting')
    try {
      inputStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
      outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE })
      await inputContext.resume()
      await outputContext.resume()
      active.value = true

      socket = new WebSocket(
        (import.meta.env.VITE_PIPECAT_WS_URL as string | undefined) || 'ws://127.0.0.1:8765',
      )
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => {
        if (!active.value) return
        startCapture()
        setStatus('listening')
      }
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data) as { type?: string; message?: string }
            if (message.type === 'interrupt' || message.type === 'tts_stopped') stopPlayback()
            if (message.type === 'error') setStatus('error', message.message || 'Pipecat voice error')
          } catch {
            /* ignore unknown control messages */
          }
          return
        }
        if (event.data instanceof ArrayBuffer) scheduleOutput(event.data)
        else if (event.data instanceof Blob) void event.data.arrayBuffer().then(scheduleOutput)
      }
      socket.onerror = () => setStatus('error', '无法连接 Pipecat，请先启动语音服务')
      socket.onclose = () => {
        if (active.value) setStatus('error', 'Pipecat 语音服务已断开')
      }
    } catch (e) {
      await disconnect()
      setStatus('error', e instanceof Error ? e.message : '无法打开麦克风')
    }
  }

  async function disconnect() {
    active.value = false
    stopPlayback()
    if (socket) {
      socket.onclose = null
      socket.close()
      socket = null
    }
    inputProcessor?.disconnect()
    inputSource?.disconnect()
    inputMute?.disconnect()
    inputProcessor = null
    inputSource = null
    inputMute = null
    inputStream?.getTracks().forEach((track) => track.stop())
    inputStream = null
    if (inputContext) await inputContext.close().catch(() => undefined)
    if (outputContext) await outputContext.close().catch(() => undefined)
    inputContext = null
    outputContext = null
    setStatus('idle')
  }

  return { status, error, active, connect, disconnect, stopPlayback }
}
