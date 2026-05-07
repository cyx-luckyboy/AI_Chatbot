import { computed, onMounted, onUnmounted, type ComputedRef, type Ref, ref, watch } from 'vue'
import type { AppConfig } from '../types'
import { recordingBlobToWavBase64 } from './wavEncode'

type SR = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): { new (): SR } | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR
    webkitSpeechRecognition?: new () => SR
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function speechLang(locale: string): string {
  if (locale === 'zh') return 'zh-CN'
  if (locale === 'en') return 'en-US'
  return 'zh-CN'
}

/**
 * 语音转写写入 model。
 * - **已填百度 Key 时优先百度**短时识别（国内可用，点一次开始录、再点结束识别，文字写入输入框）。
 * - **未配百度**且存在 Web Speech：实时上屏（依赖谷歌等云端，国内常不可用）。
 */
export function useVoiceInput(
  model: Ref<string | undefined>,
  locale: ComputedRef<string> | { value: string },
) {
  const Ctor = getSpeechRecognition()
  const webSpeechAvailable = Ctor != null

  const baiduConfigured = ref(false)

  async function refreshBaiduConfig() {
    try {
      const c = await window.electronAPI.getConfig()
      baiduConfigured.value = !!(c.baiduAsrApiKey?.trim() && c.baiduAsrSecretKey?.trim())
    } catch {
      baiduConfigured.value = false
    }
  }

  function onVisibilityRefresh() {
    if (document.visibilityState === 'visible') void refreshBaiduConfig()
  }

  function onWindowFocus() {
    void refreshBaiduConfig()
  }

  onMounted(() => {
    void refreshBaiduConfig()
    document.addEventListener('visibilitychange', onVisibilityRefresh)
    window.addEventListener('focus', onWindowFocus)
  })

  const supported = computed(() => webSpeechAvailable || baiduConfigured.value)

  const active = ref(false)
  const baiduSecondClickHint = ref(false)
  const lastErrorCode = ref<string | null>(null)
  const lastErrorDetail = ref<string | null>(null)
  let toggleBusy = false

  let rec: SR | null = null
  /** 本轮 Web Speech 开始前输入框已有内容，识别结果追加在其后 */
  const voicePrefix = ref('')
  /** 本轮是否收到过任何 onresult（用于结束时判断是否静默失败） */
  let webSessionHadResult = false
  let webNoInputWatchdog: ReturnType<typeof setTimeout> | null = null

  function clearWebNoInputWatchdog() {
    if (webNoInputWatchdog != null) {
      window.clearTimeout(webNoInputWatchdog)
      webNoInputWatchdog = null
    }
  }

  function armWebNoInputWatchdog() {
    clearWebNoInputWatchdog()
    webNoInputWatchdog = window.setTimeout(() => {
      webNoInputWatchdog = null
      if (!active.value || !rec) return
      if (webSessionHadResult) return
      lastErrorCode.value = 'voice-timeout-no-result'
      lastErrorDetail.value = null
      active.value = false
      stopWebSpeechInternal()
    }, 18000)
  }

  let mediaRecorder: MediaRecorder | null = null
  let mediaStream: MediaStream | null = null
  let baiduCollect: Blob[] = []

  const getLocale = () => (typeof locale === 'object' && 'value' in locale ? locale.value : locale)

  function syncLang() {
    if (rec) rec.lang = speechLang(getLocale())
  }

  watch(
    () => getLocale(),
    () => syncLang(),
  )

  function createRecognition(): SR {
    if (!Ctor) throw new Error('SpeechRecognition unavailable')
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.lang = speechLang(getLocale())

    r.onresult = (event: Event) => {
      webSessionHadResult = true
      clearWebNoInputWatchdog()
      const ev = event as unknown as {
        results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
      }
      let lineFinal = ''
      let lineInterim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i]
        const text = row[0]?.transcript ?? ''
        if (row.isFinal) lineFinal += text
        else lineInterim += text
      }
      model.value = `${voicePrefix.value}${lineFinal}${lineInterim}`
    }

    r.onerror = (event: Event) => {
      const err = (event as { error?: string }).error ?? ''
      if (err === 'aborted') return
      if (err === 'no-speech') {
        return
      }

      const fatal = new Set([
        'network',
        'not-allowed',
        'service-not-allowed',
        'audio-capture',
        'language-not-supported',
      ])
      if (fatal.has(err)) {
        clearWebNoInputWatchdog()
        lastErrorCode.value = err
        active.value = false
        stopWebSpeechInternal()
        return
      }
      clearWebNoInputWatchdog()
      lastErrorCode.value = 'speech-other-error'
      lastErrorDetail.value = err || 'unknown'
      active.value = false
      stopWebSpeechInternal()
      console.warn('[voice]', err)
    }

    const rNomatch = r as SR & { onnomatch?: ((e: Event) => void) | null }
    rNomatch.onnomatch = () => {
      clearWebNoInputWatchdog()
      if (!active.value) return
      lastErrorCode.value = 'voice-no-match'
      lastErrorDetail.value = null
      active.value = false
      stopWebSpeechInternal()
    }

    r.onend = () => {
      if (active.value && rec) {
        try {
          rec.start()
        } catch {
          /* InvalidStateError */
        }
      }
    }

    return r
  }

  function stopWebSpeechInternal() {
    if (rec) {
      rec.onend = null
      try {
        rec.abort()
      } catch {
        try {
          rec.stop()
        } catch {
          /* noop */
        }
      }
      rec = null
    }
  }

  function discardBaiduRecording() {
    baiduSecondClickHint.value = false
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
      } catch {
        /* noop */
      }
    }
    mediaRecorder = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    baiduCollect = []
  }

  async function stopBaiduRecordingBlob(): Promise<Blob | null> {
    baiduSecondClickHint.value = false
    const mr = mediaRecorder
    if (!mr) return null
    const mrx = mr as MediaRecorder & { requestData?: () => void }
    if (typeof mrx.requestData === 'function') {
      try {
        mrx.requestData()
      } catch {
        /* noop */
      }
    }
    await new Promise<void>((resolve) => {
      const ms = window.setTimeout(() => resolve(), 8000)
      const done = () => {
        window.clearTimeout(ms)
        resolve()
      }
      mr.onstop = done
      try {
        if (mr.state !== 'inactive') mr.stop()
        else done()
      } catch {
        done()
      }
    })
    mediaRecorder = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    const blob = new Blob(baiduCollect, { type: 'audio/webm' })
    baiduCollect = []
    const ok = blob.size > 0 ? blob : null
    active.value = false
    return ok
  }

  async function startBaiduRecording() {
    lastErrorCode.value = null
    lastErrorDetail.value = null
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStream = stream
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    mediaRecorder = recorder
    baiduCollect = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) baiduCollect.push(e.data)
    }
    recorder.start(250)
    active.value = true
    baiduSecondClickHint.value = true
  }

  async function runBaiduRecognize(cfg: AppConfig) {
    const blob = await stopBaiduRecordingBlob()
    if (!blob) {
      lastErrorCode.value = 'baidu-empty'
      return
    }
    let base64: string
    let len: number
    try {
      const wav = await recordingBlobToWavBase64(blob)
      base64 = wav.base64
      len = wav.len
    } catch (e) {
      lastErrorCode.value = 'baidu-decode'
      lastErrorDetail.value = e instanceof Error ? e.message : String(e)
      return
    }
    const apiKey = cfg.baiduAsrApiKey?.trim()
    const secretKey = cfg.baiduAsrSecretKey?.trim()
    if (!apiKey || !secretKey) {
      lastErrorCode.value = 'baidu-network'
      lastErrorDetail.value = 'missing API credentials'
      return
    }
    try {
      const devPid = getLocale() === 'en' ? 1737 : 1537
      const res = await window.electronAPI.baiduAsrRecognize({
        apiKey,
        secretKey,
        speechBase64: base64,
        len,
        devPid,
      })
      const errNo = Number((res as { err_no?: number }).err_no)
      if (Number.isFinite(errNo) && errNo !== 0) {
        lastErrorCode.value = 'baidu'
        lastErrorDetail.value = res.err_msg ?? `err_no=${errNo}`
        return
      }
      const text = (res.result?.[0] ?? '').trim()
      if (!text) {
        lastErrorCode.value = 'baidu-no-result'
        lastErrorDetail.value = null
        return
      }
      model.value = `${model.value ?? ''}${text}`
    } catch (e) {
      lastErrorCode.value = 'baidu-network'
      lastErrorDetail.value = e instanceof Error ? e.message : String(e)
    }
  }

  function stopWebSpeechToggle() {
    clearWebNoInputWatchdog()
    active.value = false
    stopWebSpeechInternal()
  }

  async function toggle() {
    if (toggleBusy) return
    toggleBusy = true
    try {
      await refreshBaiduConfig()
      let cfg: AppConfig
      try {
        cfg = await window.electronAPI.getConfig()
      } catch {
        cfg = { language: 'zh', fontSize: 14, providerConfigs: {} }
      }
      const useBaidu = !!(cfg.baiduAsrApiKey?.trim() && cfg.baiduAsrSecretKey?.trim())

      // 1) 已配置百度：优先走百度（避免国内 Web Speech / Google 静默失败）
      if (useBaidu) {
        if (active.value) {
          await runBaiduRecognize(cfg)
        } else {
          try {
            await startBaiduRecording()
          } catch (e) {
            const name = e && typeof e === 'object' && 'name' in e ? (e as { name: string }).name : ''
            if (name === 'NotAllowedError') lastErrorCode.value = 'not-allowed'
            else if (name === 'NotFoundError') lastErrorCode.value = 'audio-capture'
            else lastErrorCode.value = 'baidu-network'
            lastErrorDetail.value = e instanceof Error ? e.message : String(e)
            discardBaiduRecording()
            active.value = false
          }
        }
        return
      }

      // 2) 未配百度：Web Speech 实时（若环境支持）
      if (Ctor) {
        if (active.value) {
          const prefix = voicePrefix.value
          const appended = (model.value ?? '').slice(prefix.length).trim()
          stopWebSpeechToggle()
          if (!webSessionHadResult && !appended) {
            lastErrorCode.value = 'voice-empty-session'
            lastErrorDetail.value = null
          }
          webSessionHadResult = false
        } else {
          lastErrorCode.value = null
          lastErrorDetail.value = null
          voicePrefix.value = model.value ?? ''
          webSessionHadResult = false
          rec = createRecognition()
          active.value = true
          armWebNoInputWatchdog()
          try {
            rec.start()
          } catch (e) {
            console.error('[voice] start failed', e)
            active.value = false
            clearWebNoInputWatchdog()
            stopWebSpeechInternal()
            lastErrorCode.value = 'web-start-failed'
            lastErrorDetail.value = e instanceof Error ? e.message : String(e)
          }
        }
        return
      }

      lastErrorCode.value = 'voice-engine-unavailable'
      lastErrorDetail.value = null
      console.warn('[voice] no speech engine')
    } catch (e) {
      console.error('[voice] toggle failed', e)
      lastErrorCode.value = 'baidu-network'
      lastErrorDetail.value = e instanceof Error ? e.message : String(e)
      discardBaiduRecording()
      stopWebSpeechInternal()
      active.value = false
      baiduSecondClickHint.value = false
    } finally {
      toggleBusy = false
    }
  }

  function teardown() {
    clearWebNoInputWatchdog()
    stopWebSpeechToggle()
    discardBaiduRecording()
    active.value = false
  }

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityRefresh)
    window.removeEventListener('focus', onWindowFocus)
    teardown()
  })

  return {
    supported,
    active,
    toggle,
    lastErrorCode,
    lastErrorDetail,
    baiduSecondClickHint,
  }
}
