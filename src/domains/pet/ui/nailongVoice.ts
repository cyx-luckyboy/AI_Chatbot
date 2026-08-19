/** 点击奶龙：预置本地 wav（Windows SAPI 生成），避免透明窗 speechSynthesis 无声 */

export type NailongVoiceClip = {
  id: string
  text: string
  src: string
}

export const NAILONG_VOICE_CLIPS: NailongVoiceClip[] = [
  { id: '01', text: '嘿嘿，我才是奶龙！', src: './pet/nailong/voices/line_01.wav' },
  { id: '02', text: '你才是奶龙！你才是奶龙！', src: './pet/nailong/voices/line_02.wav' },
  { id: '03', text: '奶龙奶龙，嘿嘿嘿！', src: './pet/nailong/voices/line_03.wav' },
  { id: '04', text: '别戳啦，好痒呀！', src: './pet/nailong/voices/line_04.wav' },
  { id: '05', text: '今天也要开开心心哦！', src: './pet/nailong/voices/line_05.wav' },
  { id: '06', text: '有什么事找奶龙呀？', src: './pet/nailong/voices/line_06.wav' },
  { id: '07', text: '哼哼，本龙最厉害！', src: './pet/nailong/voices/line_07.wav' },
  { id: '08', text: '摸摸头，给你加油！', src: './pet/nailong/voices/line_08.wav' },
]

export { NAILONG_VOICE_CLIPS as NAILONG_CLICK_LINES }

let currentAudio: HTMLAudioElement | null = null

export function pickNailongClip(): NailongVoiceClip {
  return NAILONG_VOICE_CLIPS[Math.floor(Math.random() * NAILONG_VOICE_CLIPS.length)] ?? NAILONG_VOICE_CLIPS[0]
}

export function stopNailongAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.src = ''
    } catch {
      /* ignore */
    }
    currentAudio = null
  }
}

export function playNailongClip(
  clip: NailongVoiceClip,
  handlers?: { onStart?: () => void; onEnd?: () => void },
): HTMLAudioElement {
  stopNailongAudio()
  const audio = new Audio(clip.src)
  audio.volume = 1
  currentAudio = audio
  audio.onplay = () => handlers?.onStart?.()
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null
    handlers?.onEnd?.()
  }
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null
    handlers?.onEnd?.()
  }
  void audio.play().catch(() => {
    handlers?.onEnd?.()
  })
  return audio
}

/** 轻量「啵」一声 */
export function playPopBlip() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(620, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.14)
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.18)
    void ctx.resume()
    setTimeout(() => void ctx.close(), 350)
  } catch {
    /* ignore */
  }
}
