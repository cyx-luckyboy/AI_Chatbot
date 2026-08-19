import { ref } from 'vue'
import type { AppConfig } from '../../../shared/types'
import { arrayBufferToBase64, encodeWavPcm16Mono, floatTo16BitPCM } from '../../speech/wavEncode'

export type PetLiveStatus =
  | 'idle'
  | 'sleeping'
  | 'listening'
  | 'recognizing'
  | 'waiting_reply'
  | 'synthesizing'
  | 'speaking'
  | 'error'

const TARGET_RATE = 16_000
/** 略低便于桌面麦 / 远讲 */
const SPEECH_RMS = 0.01
const START_SPEECH_MS = 140
const END_SILENCE_MS = 700
const MIN_UTTER_MS = 250
const MAX_UTTER_MS = 8_000
const PRE_ROLL_MS = 300
/** 打断/唤醒短句上限 */
const MAX_BARGE_UTTER_MS = 3_500
const MAX_ASR_SEC = 6
const RECOGNIZE_CLIENT_TIMEOUT_MS = 22_000
/** 播放开始后短暂不采打断句，减轻 TTS 回声误识别 */
const BARGE_GRACE_MS = 900
const SLEEP_AFTER_MS = 45_000

const WAKE_WORDS = ['奶龙', '嘿奶龙', '你好奶龙']
/** 百度常把「奶龙」听成谐音，一并认作唤醒 */
const WAKE_ALIASES = [
  ...WAKE_WORDS,
  '耐龙',
  '乃龙',
  '奈龙',
  '奶浓',
  '耐浓',
  '乃浓',
  '奈浓',
  '嘿耐龙',
  '黑奶龙',
  '嗨奶龙',
  '你好耐龙',
  '你好乃龙',
  'nailong',
]
const BARGE_WORDS = ['停下', '停止', '闭嘴', '别说了', ...WAKE_ALIASES]
/** 待命采音更灵敏（唤醒词短） */
const WAKE_SPEECH_RMS = 0.006
const WAKE_END_SILENCE_MS = 480
const WAKE_MIN_UTTER_MS = 180

function explainBaiduAsrError(errNo: number, errMsg?: string): string {
  const m = (errMsg || '').trim()
  if (errNo === -1) return m || '网络访问百度语音失败'
  if (errNo === 3302) {
    if (/token|invalid|expired|110/i.test(m)) return '百度语音鉴权失败：请检查设置里的 API Key / Secret'
    if (/qps|limit|并发/i.test(m)) return '百度语音调用超限（QPS），稍后再试'
    return m || '百度语音鉴权失败或调用超限'
  }
  if (errNo === 3305) return '百度语音日调用量已用尽，请在控制台开通/续费'
  if (errNo === 3304) return '百度语音并发超限，请稍后再说'
  if (errNo === 3301) return '没听清（音频太弱或太吵），请靠近麦克风再说'
  if (errNo === 3313 || errNo === 3314) return '说话太短，请再说长一点'
  return m || `百度识别错误 ${errNo}`
}

function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_RATE) return input
  const outLen = Math.max(1, Math.round(input.length * (TARGET_RATE / fromRate)))
  const out = new Float32Array(outLen)
  const scale = fromRate / TARGET_RATE
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(Math.floor(i * scale), input.length - 1)
    out[i] = input[idx] ?? 0
  }
  return out
}

function rmsOf(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / Math.max(1, buf.length))
}

function normalizeSpeech(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[.,。！？!?，、；;：:“”‘’「」『』（）()【】[\]…·~～]/g, '')
    .toLowerCase()
}

function matchesWordList(text: string, words: string[]): boolean {
  const n = normalizeSpeech(text)
  if (!n) return false
  return words.some((w) => {
    const nw = normalizeSpeech(w)
    return nw.length > 0 && (n === nw || n.includes(nw))
  })
}

/** 唤醒词（含谐音 / 模糊） */
function isWakePhrase(text: string): boolean {
  if (matchesWordList(text, WAKE_ALIASES)) return true
  const n = normalizeSpeech(text)
  // 「x龙」且声母像奶/耐/乃/奈
  if (/[龙龍]/.test(n) && /[奶耐乃奈]/.test(n)) return true
  return false
}

function isOnlyWakeWord(text: string): boolean {
  const n = normalizeSpeech(text)
  if (!n) return false
  if (WAKE_ALIASES.some((w) => n === normalizeSpeech(w))) return true
  // 整句很短且像唤醒谐音
  return n.length <= 6 && isWakePhrase(text)
}

type VadBuffers = {
  preRoll: Float32Array[]
  utter: Float32Array[]
  inUtter: boolean
  speechMs: number
  silenceMs: number
  utterMs: number
}

function emptyVad(): VadBuffers {
  return { preRoll: [], utter: [], inUtter: false, speechMs: 0, silenceMs: 0, utterMs: 0 }
}

/**
 * 奶龙实时对话：待命（唤醒词）→ 聆听指令 → 问答/朗读；
 * 播放中仅用打断词/唤醒词 ASR 打断，避免噪声误触。
 */
export function usePetLiveTalk() {
  const active = ref(false)
  const status = ref<PetLiveStatus>('idle')
  const error = ref('')
  const lastTranscript = ref('')

  let stream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let mute: GainNode | null = null

  let sampleRate = TARGET_RATE
  let speakStartedAt = 0
  /** 指令轮（识别+问答）进行中；不阻挡 speaking 打断采音 */
  let commandBusy = false
  let bargeBusy = false
  let wakeBusy = false

  let cmdVad = emptyVad()
  let wakeVad = emptyVad()
  let bargeVad = emptyVad()

  let sleepTimer: ReturnType<typeof setTimeout> | undefined

  let onUtterance: ((text: string) => Promise<void>) | null = null
  let onBargeIn: (() => void) | null = null
  let onWake: (() => void) | null = null
  let onHint: ((msg: string) => void) | null = null

  function setStatus(s: PetLiveStatus, err = '') {
    status.value = s
    error.value = err
  }

  function clearVad(v: VadBuffers) {
    v.preRoll = []
    v.utter = []
    v.inUtter = false
    v.speechMs = 0
    v.silenceMs = 0
    v.utterMs = 0
  }

  function clearAllVad() {
    clearVad(cmdVad)
    clearVad(wakeVad)
    clearVad(bargeVad)
  }

  function clearSleepTimer() {
    if (sleepTimer !== undefined) {
      clearTimeout(sleepTimer)
      sleepTimer = undefined
    }
  }

  function armSleepTimer() {
    clearSleepTimer()
    if (!active.value) return
    sleepTimer = setTimeout(() => {
      sleepTimer = undefined
      if (!active.value) return
      if (status.value !== 'listening') return
      if (commandBusy || cmdVad.inUtter) {
        armSleepTimer()
        return
      }
      clearVad(cmdVad)
      setStatus('sleeping')
    }, SLEEP_AFTER_MS)
  }

  function pushPreRoll(v: VadBuffers, chunk: Float32Array) {
    v.preRoll.push(chunk)
    let total = 0
    for (const c of v.preRoll) total += c.length
    const maxSamples = Math.floor((PRE_ROLL_MS / 1000) * sampleRate)
    while (total > maxSamples && v.preRoll.length > 1) {
      const dropped = v.preRoll.shift()
      total -= dropped?.length ?? 0
    }
  }

  function concatFloat(chunks: Float32Array[]): Float32Array {
    let n = 0
    for (const c of chunks) n += c.length
    const out = new Float32Array(n)
    let o = 0
    for (const c of chunks) {
      out.set(c, o)
      o += c.length
    }
    return out
  }

  async function recognizePcm16k(pcm: Float32Array): Promise<string> {
    const maxSamples = Math.floor(MAX_ASR_SEC * TARGET_RATE)
    const clipped = pcm.length > maxSamples ? pcm.subarray(pcm.length - maxSamples) : pcm
    const pcm16 = floatTo16BitPCM(clipped)
    const wav = encodeWavPcm16Mono(pcm16, TARGET_RATE)
    const base64 = arrayBufferToBase64(wav)
    let cfg: AppConfig
    try {
      cfg = await window.electronAPI.getConfig()
    } catch {
      throw new Error('无法读取配置')
    }
    const apiKey = cfg.baiduAsrApiKey?.trim()
    const secretKey = cfg.baiduAsrSecretKey?.trim()
    if (!apiKey || !secretKey) {
      throw new Error('请先在设置中填写百度语音 API Key / Secret Key')
    }
    const res = await Promise.race([
      window.electronAPI.baiduAsrRecognize({
        apiKey,
        secretKey,
        speechBase64: base64,
        len: wav.byteLength,
        devPid: 1537,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('识别超时，请检查网络或给百度域名设直连')), RECOGNIZE_CLIENT_TIMEOUT_MS)
      }),
    ])
    const errNo = Number((res as { err_no?: number }).err_no)
    console.info('[petLiveTalk] asr', {
      err_no: errNo,
      err_msg: res.err_msg,
      result: res.result?.[0],
      wavBytes: wav.byteLength,
    })
    if (Number.isFinite(errNo) && errNo !== 0) {
      throw new Error(explainBaiduAsrError(errNo, res.err_msg))
    }
    return (res.result?.[0] ?? '').trim()
  }

  /**
   * 往 VAD 缓冲推一帧；若切出完整句返回 pcm（设备采样率），否则 null。
   */
  function feedVad(
    v: VadBuffers,
    frame: Float32Array,
    frameMs: number,
    rms: number,
    maxUtterMs: number,
    opts?: { speechRms?: number; endSilenceMs?: number; minUtterMs?: number },
  ): Float32Array | null {
    const speechRms = opts?.speechRms ?? SPEECH_RMS
    const endSilenceMs = opts?.endSilenceMs ?? END_SILENCE_MS
    const minUtterMs = opts?.minUtterMs ?? MIN_UTTER_MS
    const copy = new Float32Array(frame)
    if (rms >= speechRms) {
      v.speechMs += frameMs
      v.silenceMs = 0
      if (!v.inUtter) {
        pushPreRoll(v, copy)
        if (v.speechMs >= START_SPEECH_MS) {
          v.inUtter = true
          v.utter = [...v.preRoll, copy]
          v.preRoll = []
          v.utterMs = v.speechMs
        }
      } else {
        v.utter.push(copy)
        v.utterMs += frameMs
      }
    } else {
      v.speechMs = Math.max(0, v.speechMs - frameMs * 0.5)
      if (!v.inUtter) {
        pushPreRoll(v, copy)
        return null
      }
      v.utter.push(copy)
      v.utterMs += frameMs
      v.silenceMs += frameMs
      if (v.silenceMs >= endSilenceMs && v.utterMs >= minUtterMs) {
        const chunks = [...v.preRoll, ...v.utter]
        clearVad(v)
        return concatFloat(chunks)
      }
    }
    if (v.inUtter && v.utterMs >= maxUtterMs) {
      const chunks = [...v.preRoll, ...v.utter]
      clearVad(v)
      return concatFloat(chunks)
    }
    return null
  }

  async function finishWakeUtterance(pcmNative: Float32Array) {
    if (wakeBusy || !active.value || status.value !== 'sleeping') return
    if (pcmNative.length < (WAKE_MIN_UTTER_MS / 1000) * sampleRate * 0.4) return
    wakeBusy = true
    onHint?.('正在听唤醒词…')
    try {
      const pcm16k = resampleTo16k(pcmNative, sampleRate)
      console.info('[petLiveTalk] wake utter', {
        samples: pcm16k.length,
        ms: Math.round((pcm16k.length / TARGET_RATE) * 1000),
        rms: Number(rmsOf(pcm16k).toFixed(4)),
      })
      const text = await recognizePcm16k(pcm16k)
      lastTranscript.value = text
      console.info('[petLiveTalk] wake result', text)
      if (!active.value || status.value !== 'sleeping') return
      if (isWakePhrase(text)) {
        clearVad(cmdVad)
        setStatus('listening')
        armSleepTimer()
        onWake?.()
        return
      }
      if (!text) {
        onHint?.('没听清，请再说「奶龙」（或点一下奶龙）')
      } else {
        onHint?.(`听到「${text.slice(0, 12)}」，请说「奶龙」`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[petLiveTalk] wake asr', msg)
      onHint?.(`${msg.slice(0, 40)} · 也可点一下奶龙唤醒`)
    } finally {
      wakeBusy = false
    }
  }

  async function finishBargeUtterance(pcmNative: Float32Array) {
    if (bargeBusy || !active.value || status.value !== 'speaking') return
    if (pcmNative.length < (MIN_UTTER_MS / 1000) * sampleRate * 0.5) return
    bargeBusy = true
    try {
      const text = await recognizePcm16k(resampleTo16k(pcmNative, sampleRate))
      lastTranscript.value = text
      console.info('[petLiveTalk] barge result', text)
      if (!active.value || status.value !== 'speaking') return
      if (matchesWordList(text, BARGE_WORDS) || isWakePhrase(text)) {
        onBargeIn?.()
      }
    } catch (e) {
      console.warn('[petLiveTalk] barge asr', e)
    } finally {
      bargeBusy = false
    }
  }

  async function finishCommandUtterance(pcmNative: Float32Array) {
    if (commandBusy || !active.value || status.value !== 'listening') return
    if (pcmNative.length < (MIN_UTTER_MS / 1000) * sampleRate * 0.5) return
    commandBusy = true
    clearSleepTimer()
    setStatus('recognizing')
    try {
      const pcm16k = resampleTo16k(pcmNative, sampleRate)
      const peak = rmsOf(pcm16k)
      console.info('[petLiveTalk] utter', {
        samples: pcm16k.length,
        ms: Math.round((pcm16k.length / TARGET_RATE) * 1000),
        rms: Number(peak.toFixed(4)),
        deviceRate: sampleRate,
      })
      const text = await recognizePcm16k(pcm16k)
      lastTranscript.value = text
      if (!active.value) return
      if (!text) {
        setStatus('error', peak < 0.008 ? '声音太小，请靠近麦克风' : '没听清，请再说一次')
        await new Promise((r) => setTimeout(r, 900))
        if (active.value) {
          setStatus('listening')
          armSleepTimer()
        }
        return
      }
      // 整句只是唤醒词：忽略，继续听指令
      if (isOnlyWakeWord(text)) {
        setStatus('listening')
        armSleepTimer()
        return
      }
      setStatus('waiting_reply')
      if (onUtterance) {
        await onUtterance(text)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus('error', msg)
      await new Promise((r) => setTimeout(r, 1200))
      if (active.value) {
        setStatus('listening')
        armSleepTimer()
      }
    } finally {
      commandBusy = false
      if (active.value && status.value === 'waiting_reply') {
        setStatus('listening')
        armSleepTimer()
      }
    }
  }

  function onAudio(frame: Float32Array) {
    if (!active.value) return

    const frameMs = (frame.length / sampleRate) * 1000
    const rms = rmsOf(frame)
    const st = status.value

    // 合成阶段不采打断，避免长合成被误杀
    if (st === 'synthesizing') return

    // 播放中：独立缓冲 + ASR 打断词（不看响度打断）
    if (st === 'speaking') {
      if (Date.now() - speakStartedAt < BARGE_GRACE_MS) return
      if (bargeBusy) return
      const pcm = feedVad(bargeVad, frame, frameMs, rms, MAX_BARGE_UTTER_MS)
      if (pcm) void finishBargeUtterance(pcm)
      return
    }

    // 待命：只认唤醒词（更灵敏切句）
    if (st === 'sleeping') {
      if (wakeBusy) return
      const pcm = feedVad(wakeVad, frame, frameMs, rms, MAX_BARGE_UTTER_MS, {
        speechRms: WAKE_SPEECH_RMS,
        endSilenceMs: WAKE_END_SILENCE_MS,
        minUtterMs: WAKE_MIN_UTTER_MS,
      })
      if (pcm) void finishWakeUtterance(pcm)
      return
    }

    // 指令聆听
    if (st === 'listening') {
      if (commandBusy) return
      const pcm = feedVad(cmdVad, frame, frameMs, rms, MAX_UTTER_MS)
      if (pcm) void finishCommandUtterance(pcm)
      return
    }

    // recognizing / waiting_reply：不采新指令
  }

  function startCaptureGraph() {
    if (!audioCtx || !stream) return
    sampleRate = audioCtx.sampleRate
    source = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(2048, 1, 1)
    mute = audioCtx.createGain()
    mute.gain.value = 0
    processor.onaudioprocess = (ev) => {
      onAudio(ev.inputBuffer.getChannelData(0))
    }
    source.connect(processor)
    processor.connect(mute)
    mute.connect(audioCtx.destination)
  }

  async function start(
    handler: (text: string) => Promise<void>,
    bargeInHandler?: () => void,
    wakeHandler?: () => void,
    hintHandler?: (msg: string) => void,
  ) {
    if (active.value) return
    onUtterance = handler
    onBargeIn = bargeInHandler ?? null
    onWake = wakeHandler ?? null
    onHint = hintHandler ?? null
    error.value = ''
    lastTranscript.value = ''
    clearAllVad()
    commandBusy = false
    bargeBusy = false
    wakeBusy = false
    clearSleepTimer()
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })
      audioCtx = new AudioContext()
      await audioCtx.resume()
      active.value = true
      startCaptureGraph()
      setStatus('sleeping')
    } catch (e) {
      await stop()
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : ''
      const msg =
        name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : e instanceof Error
            ? e.message
            : '无法打开麦克风'
      setStatus('error', msg)
      throw e
    }
  }

  async function stop() {
    active.value = false
    onUtterance = null
    onBargeIn = null
    onWake = null
    onHint = null
    commandBusy = false
    bargeBusy = false
    wakeBusy = false
    clearSleepTimer()
    clearAllVad()
    try {
      processor?.disconnect()
      source?.disconnect()
      mute?.disconnect()
    } catch {
      /* ignore */
    }
    processor = null
    source = null
    mute = null
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    if (audioCtx) {
      try {
        await audioCtx.close()
      } catch {
        /* ignore */
      }
    }
    audioCtx = null
    setStatus('idle')
  }

  function notifySynthesizing() {
    if (!active.value) return
    clearVad(bargeVad)
    clearSleepTimer()
    setStatus('synthesizing')
  }

  function notifySpeaking() {
    if (!active.value) return
    speakStartedAt = Date.now()
    clearVad(bargeVad)
    bargeBusy = false
    clearSleepTimer()
    setStatus('speaking')
  }

  function notifyReplyDone() {
    if (!active.value) return
    clearAllVad()
    commandBusy = false
    bargeBusy = false
    setStatus('listening')
    armSleepTimer()
  }

  /** 打断后继续听指令（不休眠） */
  function bargeIn() {
    if (!active.value) return
    clearAllVad()
    commandBusy = false
    bargeBusy = false
    setStatus('listening')
    armSleepTimer()
  }

  /** 点触奶龙：ASR 失败时的手动唤醒 */
  function forceWake() {
    if (!active.value) return
    if (status.value !== 'sleeping' && status.value !== 'error') return
    clearAllVad()
    wakeBusy = false
    setStatus('listening')
    armSleepTimer()
    onWake?.()
  }

  /** 手动回待命 */
  function goSleep() {
    if (!active.value) return
    clearAllVad()
    clearSleepTimer()
    commandBusy = false
    bargeBusy = false
    setStatus('sleeping')
  }

  return {
    active,
    status,
    error,
    lastTranscript,
    start,
    stop,
    notifySpeaking,
    notifySynthesizing,
    notifyReplyDone,
    bargeIn,
    forceWake,
    goSleep,
  }
}
