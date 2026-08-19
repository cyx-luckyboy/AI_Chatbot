<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PetAvatarEvent } from '../../../shared/types'
import { useThreeNailongPet } from './useThreeNailongPet'
import { markdownToPlainText } from '../../speech/speechPlain'
import { pickNailongClip, playPopBlip, stopNailongAudio } from './nailongVoice'
import { usePetLiveTalk } from './usePetLiveTalk'

const canvasHost = ref<HTMLDivElement | null>(null)
const statusLabel = ref('idle')
const loadError = ref('')
const subtitle = ref('')
const chatOpen = ref(false)
const draft = ref('')
const forceSearch = ref(false)
const askBusy = ref(false)
const askError = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const voiceHint = ref('')

let autoSpeak = true
let dragOrigin: { screenX: number; screenY: number } | null = null
let unsubAvatar: (() => void) | null = null
let unsubConfig: (() => void) | null = null
let unsubAskResult: (() => void) | null = null
let stopLiveWatch: (() => void) | null = null
let mouthRaf = 0
let movedDist = 0
let clickBusy = false
let pendingAskId: string | null = null
let speakingMessageId: number | null = null
/** 防止合成/播放过程中被 thinking/idle 事件误 stop */
let speakInFlight = false
/** 实时对话一轮：等奶龙说完再 resolve，继续聆听 */
let liveTurnResolve: (() => void) | null = null
let liveTurnTimer: ReturnType<typeof setTimeout> | undefined
let thinkingWatchTimer: ReturnType<typeof setTimeout> | undefined
let unsubTtsPhase: (() => void) | null = null
/** speakViaMain 合成进度定时器，进入 playing 时清掉 */
let speakProgressTimer: ReturnType<typeof setInterval> | undefined
const THINKING_TIMEOUT_MS = 90_000
/** 实时对话最多朗读字数（分块流水线可较快出声，不必再截成 48 字） */
const LIVE_SPEAK_MAX_CHARS = 220

function clipLiveSpeakText(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= LIVE_SPEAK_MAX_CHARS) return t
  const slice = t.slice(0, LIVE_SPEAK_MAX_CHARS)
  const cut = slice.match(/^[\s\S]*[。！？!?；;]/)
  return `${cut ? cut[0] : slice}…`
}

const pet = useThreeNailongPet()
const live = usePetLiveTalk()

function clearThinkingWatch() {
  if (thinkingWatchTimer !== undefined) {
    clearTimeout(thinkingWatchTimer)
    thinkingWatchTimer = undefined
  }
}

function armThinkingWatch() {
  clearThinkingWatch()
  thinkingWatchTimer = setTimeout(() => {
    thinkingWatchTimer = undefined
    if (statusLabel.value !== 'thinking' && !askBusy.value) return
    console.warn('[pet] thinking timeout — reset idle')
    askBusy.value = false
    pendingAskId = null
    finishLiveTurn()
    stopSpeak()
    if (live.active.value) {
      live.notifyReplyDone()
      statusLabel.value = '聆听中'
      pet.setState('idle')
    } else {
      statusLabel.value = 'idle'
      pet.setState('idle')
    }
    pet.showBubble('想太久了…再说一次吧', 4000)
  }, THINKING_TIMEOUT_MS)
}

function finishLiveTurn() {
  if (liveTurnTimer !== undefined) {
    clearTimeout(liveTurnTimer)
    liveTurnTimer = undefined
  }
  const r = liveTurnResolve
  liveTurnResolve = null
  r?.()
}

async function refreshConfig() {
  try {
    const cfg = await window.electronAPI.getConfig()
    autoSpeak = cfg.desktopPetAutoSpeak !== false
  } catch {
    /* ignore */
  }
}

function stopSpeak() {
  stopNailongAudio()
  void window.electronAPI.petSpeakStop()
  if (mouthRaf) {
    cancelAnimationFrame(mouthRaf)
    mouthRaf = 0
  }
  pet.setMouthOpen(0)
  pet.setSpeaking(false)
  subtitle.value = ''
}

function startMouthLoop(durationMs = 2200) {
  const t0 = performance.now()
  const tick = (now: number) => {
    if (now - t0 > durationMs) {
      pet.setMouthOpen(0)
      mouthRaf = 0
      return
    }
    const t = (now - t0) / 1000
    pet.setMouthOpen(0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 14)))
    mouthRaf = requestAnimationFrame(tick)
  }
  mouthRaf = requestAnimationFrame(tick)
}

function finishSpeak(opts?: { resumeLive?: boolean }) {
  pet.setSpeaking(false)
  pet.setMouthOpen(0)
  subtitle.value = ''
  clickBusy = false
  speakingMessageId = null
  if (mouthRaf) {
    cancelAnimationFrame(mouthRaf)
    mouthRaf = 0
  }
  if (live.active.value && opts?.resumeLive !== false) {
    live.notifyReplyDone()
    statusLabel.value = '聆听中'
    pet.setState('idle')
    finishLiveTurn()
  } else if (!live.active.value) {
    statusLabel.value = 'idle'
    pet.setState('idle')
  }
}

async function speakViaMain(text: string, estimatedMs?: number) {
  let t = text.trim()
  if (!t) {
    finishSpeak()
    return
  }
  if (live.active.value) {
    t = clipLiveSpeakText(t)
  }
  speakInFlight = true
  // 合成阶段不启用 barge-in；真正播放时由 pet-tts-phase 切入 speaking
  if (live.active.value) live.notifySynthesizing()
  statusLabel.value = live.active.value ? '合成中' : 'speaking'
  pet.setState('speaking')
  pet.setSpeaking(true)
  subtitle.value = t
  const synthStarted = Date.now()
  if (speakProgressTimer) clearInterval(speakProgressTimer)
  const tickProgress = () => {
    const sec = Math.max(1, Math.round((Date.now() - synthStarted) / 1000))
    pet.showBubble(`合成嗓音中…${sec}s`, 3000)
    statusLabel.value = `合成中 ${sec}s`
  }
  tickProgress()
  speakProgressTimer = setInterval(tickProgress, 1000)
  startMouthLoop(estimatedMs ?? Math.min(10000, 900 + t.length * 100))
  try {
    const r = await window.electronAPI.petSpeakText({ text: t, rate: 2 })
    if (speakProgressTimer) {
      clearInterval(speakProgressTimer)
      speakProgressTimer = undefined
    }
    if (r?.cancelled) {
      pet.showBubble('朗读被打断', 2000)
      finishSpeak({ resumeLive: true })
      return
    }
    if (r?.ok === false && r.error) {
      console.warn('[pet] speak failed', r.error)
      statusLabel.value = 'tts-fail'
      const msg = /TIMEOUT|超时/i.test(r.error)
        ? '合成超时：TTS 太忙或未启动，请检查 9880'
        : '嗓子哑了…请确认奶龙 TTS（9880）'
      pet.showBubble(msg, 4500)
      finishSpeak()
      return
    }
    if (r?.ok) {
      pet.showBubble(t, Math.min(5000, 1400 + t.length * 90))
    }
  } catch (e) {
    console.warn('[pet] speak error', e)
  } finally {
    if (speakProgressTimer) {
      clearInterval(speakProgressTimer)
      speakProgressTimer = undefined
    }
    speakInFlight = false
  }
  finishSpeak()
}

function onAvatarEvent(ev: PetAvatarEvent) {
  if (ev.state === 'thinking') {
    // 合成/播放中绝不 stop，避免长 TTS 被 thinking/force-idle 误杀
    if (speakInFlight) return
    if (speakingMessageId != null && ev.messageId === speakingMessageId) return
    stopSpeak()
    speakingMessageId = null
    clickBusy = false
    statusLabel.value = live.active.value ? '思考中' : 'thinking'
    pet.setState('thinking')
    armThinkingWatch()
    return
  }
  if (ev.state === 'idle' || ev.isError) {
    if (speakInFlight) return
    if (speakingMessageId != null && ev.messageId === speakingMessageId && !ev.isError) return
    clearThinkingWatch()
    stopSpeak()
    speakingMessageId = null
    clickBusy = false
    askBusy.value = false
    if (ev.isError) {
      finishLiveTurn()
      if (live.active.value) {
        live.notifyReplyDone()
        statusLabel.value = '聆听中'
      } else {
        statusLabel.value = 'idle'
      }
      pet.setState('idle')
      return
    }
    if (!live.active.value) {
      statusLabel.value = 'idle'
      pet.setState('idle')
    }
    return
  }
  if (ev.state === 'speaking') {
    if (speakInFlight) return
    clearThinkingWatch()
    askBusy.value = false
    speakingMessageId = ev.messageId ?? null
    if (autoSpeak && ev.text) {
      void speakViaMain(markdownToPlainText(ev.text).slice(0, 480))
    } else {
      speakingMessageId = null
      finishLiveTurn()
      if (live.active.value) {
        live.notifyReplyDone()
        statusLabel.value = '聆听中'
      } else {
        statusLabel.value = 'idle'
      }
      pet.setState('idle')
    }
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('.pet-panel, .pet-close, .pet-chat-btn, .pet-voice-btn')) return
  movedDist = 0
  dragOrigin = { screenX: e.screenX, screenY: e.screenY }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragOrigin) return
  const dx = e.screenX - dragOrigin.screenX
  const dy = e.screenY - dragOrigin.screenY
  movedDist += Math.abs(dx) + Math.abs(dy)
  dragOrigin = { screenX: e.screenX, screenY: e.screenY }
  if (movedDist > 6) window.electronAPI.petDragBy(dx, dy)
}

function onPointerUp(e: PointerEvent) {
  const wasDrag = movedDist > 10
  dragOrigin = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const t = e.target as HTMLElement | null
  if (t?.closest('.pet-panel, .pet-close, .pet-chat-btn, .pet-voice-btn')) return
  if (!wasDrag) void onTapSpeak()
}

function onClickClose() {
  void live.stop()
  void window.electronAPI.petClose()
}

async function toggleChat() {
  chatOpen.value = !chatOpen.value
  askError.value = ''
  voiceHint.value = ''
  if (chatOpen.value) {
    await nextTick()
    inputEl.value?.focus()
  }
}

async function onTapSpeak() {
  // 待命时点一下奶龙也可唤醒（百度听不清/网络差时的兜底）
  if (live.active.value && (live.status.value === 'sleeping' || live.status.value === 'error')) {
    live.forceWake()
    return
  }
  if (clickBusy || askBusy.value || chatOpen.value || live.active.value) return
  clickBusy = true
  const clip = pickNailongClip()
  playPopBlip()
  pet.tap({ line: clip.text })
  await speakViaMain(clip.text, 3200)
}

function handleBargeIn() {
  if (!live.active.value) return
  stopSpeak()
  askBusy.value = false
  pendingAskId = null
  finishLiveTurn()
  live.bargeIn()
  statusLabel.value = '聆听中'
  pet.setState('idle')
  pet.showBubble('好，你说…', 1800)
}

function handleWake() {
  if (!live.active.value) return
  statusLabel.value = '聆听中'
  pet.setState('idle')
  pet.showBubble('我在！请说～', 2500)
}

function handleLiveHint(msg: string) {
  voiceHint.value = msg
  pet.showBubble(msg, 3200)
}

/** 实时对话一轮：发问并等到奶龙说完 */
async function handleLiveUtterance(text: string) {
  const t = text.trim()
  if (!t) return
  draft.value = t
  askBusy.value = true
  askError.value = ''
  voiceHint.value = ''
  pendingAskId = `pet-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  statusLabel.value = '思考中'
  pet.setState('thinking')
  armThinkingWatch()
  pet.showBubble(`你：${t.slice(0, 40)}`, 2500)

  await new Promise<void>((resolve) => {
    liveTurnResolve = resolve
    liveTurnTimer = setTimeout(() => {
      liveTurnTimer = undefined
      if (liveTurnResolve) {
        askBusy.value = false
        finishLiveTurn()
      }
    }, THINKING_TIMEOUT_MS)
    window.electronAPI.petChatAsk({
      text: t,
      forceSearch: forceSearch.value,
      requestId: pendingAskId,
    })
  })
}

async function toggleVoice() {
  voiceHint.value = ''
  askError.value = ''

  if (live.active.value) {
    finishLiveTurn()
    await live.stop()
    stopSpeak()
    askBusy.value = false
    statusLabel.value = 'idle'
    pet.setState('idle')
    pet.showBubble('结束实时对话', 2000)
    return
  }

  try {
    const cfg = await window.electronAPI.getConfig()
    if (!cfg.baiduAsrApiKey?.trim() || !cfg.baiduAsrSecretKey?.trim()) {
      throw new Error('请先在设置中填写百度语音 API Key / Secret Key')
    }
    stopSpeak()
    await live.start(handleLiveUtterance, handleBargeIn, handleWake, handleLiveHint)
    statusLabel.value = '待命中'
    pet.setState('idle')
    pet.showBubble('说『奶龙』或点一下奶龙唤醒', 4500)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '无法开始实时对话'
    voiceHint.value = msg
    statusLabel.value = '需配置语音'
    chatOpen.value = true
    pet.showBubble(msg, 4000)
  }
}

function submitAsk() {
  const text = draft.value.trim()
  if (!text || askBusy.value) return
  askBusy.value = true
  askError.value = ''
  voiceHint.value = ''
  pendingAskId = `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  statusLabel.value = 'thinking'
  pet.setState('thinking')
  armThinkingWatch()
  chatOpen.value = true
  window.electronAPI.petChatAsk({
    text,
    forceSearch: forceSearch.value,
    requestId: pendingAskId,
  })
  draft.value = ''
}

function onAskKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitAsk()
  }
}

function syncLiveStatusLabel() {
  if (!live.active.value) return
  const s = live.status.value
  if (s === 'sleeping') {
    statusLabel.value = '待命中'
  } else if (s === 'listening') statusLabel.value = '聆听中'
  else if (s === 'recognizing') statusLabel.value = '识别中'
  else if (s === 'waiting_reply') statusLabel.value = '思考中'
  else if (s === 'synthesizing') statusLabel.value = '合成中'
  else if (s === 'speaking') statusLabel.value = 'speaking'
  else if (s === 'error') {
    statusLabel.value = '语音异常'
    if (live.error.value) {
      voiceHint.value = live.error.value
      pet.showBubble(live.error.value, 3500)
    }
  }
}

onMounted(async () => {
  document.documentElement.classList.add('pet-window')
  document.body.classList.add('pet-window')
  await refreshConfig()
  unsubConfig = window.electronAPI.onConfigChanged(() => {
    void refreshConfig()
  })
  unsubAvatar = window.electronAPI.onPetAvatarEvent(onAvatarEvent)
  unsubTtsPhase = window.electronAPI.onPetTtsPhase((p) => {
    if (!live.active.value || !speakInFlight) return
    if (p.phase === 'synthesizing') {
      live.notifySynthesizing()
      statusLabel.value = '合成中'
      pet.showBubble('合成嗓音中…', 12000)
    } else if (p.phase === 'playing') {
      if (speakProgressTimer) {
        clearInterval(speakProgressTimer)
        speakProgressTimer = undefined
      }
      live.notifySpeaking()
      statusLabel.value = 'speaking'
      if (subtitle.value) pet.showBubble(subtitle.value, Math.min(6000, 1400 + subtitle.value.length * 60))
    }
  })
  unsubAskResult = window.electronAPI.onPetChatAskResult((r) => {
    if (pendingAskId && r.requestId && r.requestId !== pendingAskId) return
    pendingAskId = null
    if (!r.ok) {
      clearThinkingWatch()
      askBusy.value = false
      askError.value = r.error || 'failed'
      chatOpen.value = true
      pet.showBubble(r.error || '这次没问成功', 4000)
      finishLiveTurn()
      if (live.active.value) {
        live.notifyReplyDone()
        statusLabel.value = '聆听中'
        pet.setState('idle')
      } else {
        statusLabel.value = 'idle'
        pet.setState('idle')
        void speakViaMain('唔，这次没问成功，稍后再试试吧。', 2800)
      }
    }
  })

  let prevLiveStatus = live.status.value
  stopLiveWatch = watch([live.status, live.active], () => {
    syncLiveStatusLabel()
    const s = live.status.value
    if (live.active.value && s === 'sleeping' && prevLiveStatus !== 'sleeping' && prevLiveStatus !== 'idle') {
      // 空闲回待命（开麦首次由 toggleVoice 提示，这里避免重复）
      if (prevLiveStatus === 'listening') {
        pet.showBubble('待命中，说『奶龙』继续', 3000)
      }
    }
    prevLiveStatus = s
  })

  if (canvasHost.value) {
    try {
      await pet.mount(canvasHost.value)
      statusLabel.value = 'idle'
      pet.setState('idle')
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : String(err)
    }
  }
})

onUnmounted(() => {
  clearThinkingWatch()
  finishLiveTurn()
  stopSpeak()
  stopLiveWatch?.()
  void live.stop()
  unsubAvatar?.()
  unsubTtsPhase?.()
  unsubAskResult?.()
  unsubConfig?.()
  pet.destroy()
  document.documentElement.classList.remove('pet-window')
  document.body.classList.remove('pet-window')
})
</script>

<template>
  <div
    class="pet-root"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <button type="button" class="pet-chat-btn" title="和奶龙文字对话" @click.stop="toggleChat">聊</button>
    <button
      type="button"
      class="pet-voice-btn"
      :class="{ active: live.active }"
      :title="live.active ? '再点结束实时对话' : '开始实时对话（说奶龙唤醒）'"
      @click.stop="toggleVoice"
    >
      麦
    </button>
    <button type="button" class="pet-close" title="关闭桌宠" @click.stop="onClickClose">×</button>
    <div ref="canvasHost" class="pet-canvas" />
    <div v-if="loadError" class="pet-fallback">
      <p>奶龙加载失败</p>
      <p class="pet-fallback-detail">{{ loadError }}</p>
    </div>
    <div v-else class="pet-hud">
      <span class="pet-status">{{ statusLabel }}</span>
      <span v-if="subtitle" class="pet-sub">{{ subtitle }}</span>
      <span class="pet-hint">「麦」待命 · 说「奶龙」对话 · 「聊」打字</span>
    </div>

    <div v-if="chatOpen" class="pet-panel" @pointerdown.stop @click.stop>
      <div class="pet-panel-title">和奶龙说话</div>
      <textarea
        ref="inputEl"
        v-model="draft"
        class="pet-input"
        rows="3"
        placeholder="打字发送；或点「麦」后说「奶龙」唤醒"
        :disabled="askBusy"
        @keydown="onAskKeydown"
      />
      <label class="pet-search-toggle">
        <input v-model="forceSearch" type="checkbox" :disabled="askBusy" />
        强制联网搜索
      </label>
      <p v-if="askError" class="pet-ask-error">{{ askError }}</p>
      <p v-if="voiceHint" class="pet-ask-error">{{ voiceHint }}</p>
      <div class="pet-panel-actions">
        <button
          type="button"
          class="pet-panel-mic"
          :class="{ active: live.active }"
          @click="toggleVoice"
        >
          {{ live.active ? '结束实时对话' : '开始实时对话' }}
        </button>
        <button type="button" class="pet-send" :disabled="askBusy || !draft.trim()" @click="submitAsk">
          {{ askBusy ? '思考中…' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pet-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
  user-select: none;
  cursor: grab;
}
.pet-root:active {
  cursor: grabbing;
}
.pet-canvas {
  width: 100%;
  height: 100%;
}
.pet-close,
.pet-chat-btn {
  position: absolute;
  top: 6px;
  z-index: 10;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.45);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.pet-close {
  right: 8px;
  font-size: 18px;
}
.pet-chat-btn {
  right: 74px;
}
.pet-voice-btn {
  position: absolute;
  top: 6px;
  right: 40px;
  z-index: 10;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 28px;
  text-align: center;
  padding: 0;
  cursor: pointer;
}
.pet-voice-btn.active {
  background: rgba(22, 163, 74, 0.9);
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.45);
}
.pet-hud {
  position: absolute;
  left: 10px;
  right: 72px;
  bottom: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}
.pet-status {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.45);
  color: #e2e8f0;
  font-size: 11px;
}
.pet-sub {
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.55);
  color: #fef9c3;
  font-size: 12px;
  line-height: 1.35;
  word-break: break-word;
}
.pet-hint {
  font-size: 10px;
  color: rgba(254, 243, 199, 0.8);
}
.pet-fallback {
  position: absolute;
  inset: 40px 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
  color: #f8fafc;
  text-align: center;
  font-size: 13px;
}
.pet-fallback-detail {
  font-size: 11px;
  opacity: 0.85;
  word-break: break-word;
}
.pet-panel {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 56px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.88);
  color: #f8fafc;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  cursor: default;
}
.pet-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #fde68a;
}
.pet-input {
  width: 100%;
  resize: none;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.9);
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.4;
  padding: 8px 10px;
  box-sizing: border-box;
}
.pet-input:focus {
  outline: 1px solid rgba(251, 191, 36, 0.55);
}
.pet-search-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
}
.pet-ask-error {
  margin: 0;
  font-size: 11px;
  color: #fca5a5;
}
.pet-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.pet-panel-mic {
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  background: transparent;
  color: #e2e8f0;
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
}
.pet-panel-mic.active {
  background: rgba(190, 24, 93, 0.75);
  border-color: transparent;
  color: #fff;
}
.pet-send {
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  background: linear-gradient(180deg, #fbbf24, #f59e0b);
  color: #78350f;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pet-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

<style>
html.pet-window,
body.pet-window {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent !important;
}
html.pet-window #app {
  width: 100%;
  height: 100%;
  background: transparent;
}
.nailong-bubble {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 8;
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 14px;
  background: linear-gradient(180deg, #fffbeb, #fef3c7);
  color: #78350f;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  box-shadow: 0 8px 20px rgba(120, 53, 15, 0.22);
  transform: translate(-50%, 6px) scale(0.9);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.nailong-bubble.is-show {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
</style>
