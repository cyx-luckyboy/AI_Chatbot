import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import https from 'https'
import { URL } from 'url'
import { app } from 'electron'
import { configManager } from '../../shared/config'
import { appendPetTtsLog, broadcastPetTtsPhase, previewTextForLog } from './petTtsLog'

let speakingProc: ReturnType<typeof spawn> | null = null
let playProc: ReturnType<typeof spawn> | null = null
/** 每次 stop / 新开播递增；用于识别「被打断」而不误回退系统机械音 */
let speakEpoch = 0
/** 串行化朗读，避免重叠合成/播放互相 kill */
let speakChain: Promise<unknown> = Promise.resolve()

export type PetSpeakTiming = {
  synthesizeMs?: number
  playMs?: number
  totalMs: number
  audioBytes?: number
  httpStatus?: number
}

export type PetSpeakResult = {
  ok: boolean
  error?: string
  engine?: 'nailong' | 'system'
  cancelled?: boolean
  timing?: PetSpeakTiming
}

function httpRequest(
  urlStr: string,
  opts: { method?: string; headers?: Record<string, string>; body?: Buffer | string; timeoutMs?: number },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const lib = u.protocol === 'https:' ? https : http
    const bodyBuf =
      opts.body == null ? null : Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body, 'utf8')
    // 必须带 Content-Length：GPT-SoVITS/uvicorn 对 chunked 请求常读到空 body → 400 → 回退系统机械音
    const headers: Record<string, string> = { ...(opts.headers || {}) }
    if (bodyBuf) {
      headers['Content-Length'] = String(bodyBuf.length)
    }
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers,
        timeout: opts.timeoutMs ?? 120_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('TTS_TIMEOUT'))
    })
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

function sniffAudioExt(buf: Buffer, contentType?: string): 'wav' | 'mp3' | 'ogg' | 'webm' {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3'
  if (ct.includes('ogg')) return 'ogg'
  if (ct.includes('webm')) return 'webm'
  if (ct.includes('wav') || ct.includes('wave')) return 'wav'
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav'
  if (buf.length >= 3 && buf.slice(0, 3).toString('ascii') === 'ID3') return 'mp3'
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'
  return 'wav'
}

/**
 * 按句拆成短块：首包尽量短以降低「合成中」等待；后续块可稍长。
 */
export function splitTtsChunks(text: string, firstMax = 28, maxChars = 44): string[] {
  const clean = text
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
  if (!clean) return []

  const parts = clean
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
  const units: string[] = []
  for (const p of parts.length ? parts : [clean]) {
    if (p.length <= maxChars) {
      units.push(p)
      continue
    }
    const byComma = p.split(/(?<=[，,、])/).map((s) => s.trim()).filter(Boolean)
    for (const c of byComma.length ? byComma : [p]) {
      if (c.length <= maxChars) units.push(c)
      else {
        for (let i = 0; i < c.length; i += maxChars) units.push(c.slice(i, i + maxChars))
      }
    }
  }

  const chunks: string[] = []
  let buf = ''
  const flush = () => {
    if (buf) {
      chunks.push(buf)
      buf = ''
    }
  }
  for (const u of units) {
    const limit = chunks.length === 0 ? firstMax : maxChars
    if (!buf) {
      buf = u
      // 首包：有完整短句就立即出块
      if (chunks.length === 0 && (buf.length >= Math.min(12, firstMax) || /[。！？!?]$/.test(buf))) {
        flush()
      } else if (buf.length >= limit) {
        flush()
      }
      continue
    }
    if (buf.length + u.length <= (chunks.length === 0 ? firstMax : maxChars)) {
      buf += u
      if (chunks.length === 0 && /[。！？!?]$/.test(buf)) flush()
    } else {
      flush()
      buf = u
      if (chunks.length === 0 && /[。！？!?]$/.test(buf)) flush()
    }
  }
  flush()
  return chunks.length > 0 ? chunks : [clean.slice(0, maxChars)]
}

/** 调用本地奶龙/GPT-SoVITS HTTP 接口，返回音频文件路径 */
export async function synthesizeNailongTtsToFile(
  text: string,
): Promise<
  | { ok: true; file: string; synthesizeMs: number; audioBytes: number; httpStatus: number }
  | { ok: false; error: string; synthesizeMs: number }
> {
  const cfg = configManager.get()
  const base = String(cfg.nailongTtsBaseUrl || 'http://127.0.0.1:9880').replace(/\/$/, '')
  const t = text
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  if (!t) return { ok: false, error: 'empty', synthesizeMs: 0 }

  const t0 = Date.now()
  appendPetTtsLog({
    level: 'info',
    stage: 'synthesize',
    message: `POST ${base}/tts`,
    textPreview: previewTextForLog(t),
    detail: { chars: t.length, baseUrl: base },
  })

  const attempts: Array<() => Promise<{ buf: Buffer; status: number } | null>> = [
    // GPT-SoVITS api_v2 POST /tts
    async () => {
      const body = JSON.stringify({
        text: t,
        text_lang: 'zh',
        text_language: 'zh',
        prompt_lang: 'zh',
        prompt_language: 'zh',
        // GPT-SoVITS api_v2 必填：相对 API 进程工作目录
        ref_audio_path: 'reference.wav',
        prompt_text: '啊，我才不要这样，好害羞啊。',
        media_type: 'wav',
        streaming_mode: false,
        // cut0：按标点切，短块合成更快
        text_split_method: 'cut0',
        batch_size: 1,
        parallel_infer: true,
      })
      const r = await httpRequest(`${base}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'audio/wav,application/octet-stream,*/*',
        },
        body,
        // 单块超时；长文靠分块流水线，不必等整篇
        timeoutMs: 55_000,
      })
      if (r.status >= 200 && r.status < 300 && r.body.length > 100) {
        return { buf: r.body, status: r.status }
      }
      const detail = r.body.slice(0, 200).toString('utf8').replace(/\s+/g, ' ')
      throw new Error(`TTS_HTTP_${r.status}${detail ? `: ${detail}` : ''}`)
    },
  ]

  let audio: Buffer | null = null
  let httpStatus = 0
  let lastErr = 'TTS_UNREACHABLE'
  for (const fn of attempts) {
    try {
      const got = await fn()
      if (got) {
        audio = got.buf
        httpStatus = got.status
        break
      }
      lastErr = 'TTS_BAD_RESPONSE'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  const synthesizeMs = Date.now() - t0
  if (!audio) {
    appendPetTtsLog({
      level: 'error',
      stage: 'synthesize',
      message: `失败：${lastErr}`,
      ms: synthesizeMs,
      textPreview: previewTextForLog(t),
      detail: { baseUrl: base },
    })
    return {
      ok: false,
      error:
        lastErr === 'TTS_TIMEOUT' || /TTS_TIMEOUT/i.test(lastErr)
          ? `奶龙 TTS 合成超时（请确认 ${base} 已启动）`
          : `奶龙 TTS 未响应（${lastErr}）。请先启动本地服务：${base}`,
      synthesizeMs,
    }
  }

  const ext = sniffAudioExt(audio)
  const file = path.join(os.tmpdir(), `vchat-nailong-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`)
  fs.writeFileSync(file, audio)
  appendPetTtsLog({
    level: 'ok',
    stage: 'synthesize',
    message: `合成成功 ${audio.length} bytes`,
    ms: synthesizeMs,
    engine: 'nailong',
    textPreview: previewTextForLog(t),
    detail: { httpStatus, bytes: audio.length, ext },
  })
  return { ok: true, file, synthesizeMs, audioBytes: audio.length, httpStatus }
}

function killSpeakProcesses() {
  if (speakingProc && !speakingProc.killed) {
    try {
      speakingProc.kill()
    } catch {
      /* ignore */
    }
  }
  speakingProc = null
  if (playProc && !playProc.killed) {
    try {
      playProc.kill()
    } catch {
      /* ignore */
    }
  }
  playProc = null
}

function playAudioFileBlocking(filePath: string): Promise<{ ok: boolean; error?: string }> {
  // 只停上一首，不 bump speakEpoch（否则当前这次朗读会被误判为 cancelled）
  killSpeakProcesses()
  if (process.platform !== 'win32') {
    return Promise.resolve({ ok: false, error: 'play_windows_only' })
  }
  const ps1 = path.join(os.tmpdir(), `vchat-pet-play-${Date.now()}.ps1`)
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Volume = 1
$p.Open([Uri]@'
${filePath.replace(/'/g, "''")}
'@)
$deadline = (Get-Date).AddSeconds(3)
while (-not $p.NaturalDuration.HasTimeSpan) {
  Start-Sleep -Milliseconds 50
  if ((Get-Date) -gt $deadline) { break }
}
$p.Play()
if ($p.NaturalDuration.HasTimeSpan) {
  $ms = [int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 200
  Start-Sleep -Milliseconds $ms
} else {
  Start-Sleep -Seconds 8
}
$p.Stop()
$p.Close()
`
  try {
    fs.writeFileSync(ps1, script, 'utf8')
  } catch (e) {
    return Promise.resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }

  return new Promise((resolve) => {
    playProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { windowsHide: true },
    )
    playProc.on('error', (err) => {
      playProc = null
      try {
        fs.unlinkSync(ps1)
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: err.message })
    })
    playProc.on('close', (code) => {
      playProc = null
      try {
        fs.unlinkSync(ps1)
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      resolve(code === 0 ? { ok: true } : { ok: false, error: `exit_${code}` })
    })
  })
}

/** Windows：主进程 System.Speech 输出到默认设备（副窗 Audio/speechSynthesis 常无声） */
export function speakTextNative(text: string, opts?: { rate?: number }): Promise<{ ok: boolean; error?: string }> {
  const t = String(text || '').trim().slice(0, 240)
  if (!t) return Promise.resolve({ ok: false, error: 'empty' })

  killSpeakProcesses()

  if (process.platform !== 'win32') {
    return Promise.resolve({ ok: false, error: 'native_tts_windows_only' })
  }

  const rate = typeof opts?.rate === 'number' ? Math.max(-5, Math.min(5, Math.round(opts.rate))) : 2
  const tmp = path.join(os.tmpdir(), `vchat-pet-speak-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  const ps1 = path.join(os.tmpdir(), `vchat-pet-speak-${Date.now()}.ps1`)

  try {
    fs.writeFileSync(tmp, t, 'utf8')
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = ${rate}
$s.Volume = 100
$s.SetOutputToDefaultAudioDevice()
try {
  $zh = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -like 'zh*' } | Select-Object -First 1
  if ($null -ne $zh) { [void]$s.SelectVoice($zh.Name) }
} catch {}
$text = Get-Content -LiteralPath @'
${tmp.replace(/'/g, "''")}
'@ -Encoding UTF8 -Raw
$s.Speak([string]$text)
$s.Dispose()
Remove-Item -LiteralPath @'
${tmp.replace(/'/g, "''")}
'@ -Force -ErrorAction SilentlyContinue
`
    fs.writeFileSync(ps1, script, 'utf8')
  } catch (e) {
    return Promise.resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }

  return new Promise((resolve) => {
    speakingProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { windowsHide: true },
    )
    speakingProc.on('error', (err) => {
      speakingProc = null
      try {
        fs.unlinkSync(ps1)
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: err.message })
    })
    speakingProc.on('close', (code) => {
      speakingProc = null
      try {
        fs.unlinkSync(ps1)
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      resolve(code === 0 ? { ok: true } : { ok: false, error: `exit_${code}` })
    })
  })
}

/** 桌宠说话：优先奶龙本地 TTS；仅未开启奶龙音色时才用系统音（避免“机械声”误当作成功） */
export function speakPetText(
  text: string,
  opts?: { rate?: number; forceSystem?: boolean },
): Promise<PetSpeakResult> {
  const run = async (): Promise<PetSpeakResult> => {
    const t = String(text || '').trim()
    if (!t) return { ok: false, error: 'empty', timing: { totalMs: 0 } }

    const totalT0 = Date.now()
    const epoch = ++speakEpoch
    killSpeakProcesses()
    const cfg = configManager.get()
    const nailongOn = cfg.nailongTtsEnabled !== false
    const preferNailong = !opts?.forceSystem && (nailongOn || Boolean(cfg.desktopPetEnabled))
    const allowSystemFallback = opts?.forceSystem === true || nailongOn === false
    const preview = previewTextForLog(t)

    appendPetTtsLog({
      level: 'info',
      stage: 'start',
      message: preferNailong ? '开始朗读（优先奶龙）' : '开始朗读（系统音）',
      textPreview: preview,
      detail: {
        chars: t.length,
        nailongOn,
        preferNailong,
        allowSystemFallback,
        baseUrl: String(cfg.nailongTtsBaseUrl || 'http://127.0.0.1:9880'),
      },
    })

    if (preferNailong) {
      const piped = await speakNailongPipelined(t, epoch, totalT0, preview)
      if (piped) return piped
      if (!allowSystemFallback) {
        broadcastPetTtsPhase('idle')
        return {
          ok: false,
          engine: 'nailong',
          error: '奶龙 TTS 失败',
          timing: { totalMs: Date.now() - totalT0 },
        }
      }
      appendPetTtsLog({
        level: 'warn',
        stage: 'fallback',
        message: '回退系统语音',
        textPreview: preview,
      })
    }

    const sysT0 = Date.now()
    const r = await speakTextNative(t, opts)
    const playMs = Date.now() - sysT0
    if (epoch !== speakEpoch) {
      return {
        ok: false,
        cancelled: true,
        error: 'cancelled',
        timing: { totalMs: Date.now() - totalT0, playMs },
      }
    }
    const totalMs = Date.now() - totalT0
    appendPetTtsLog({
      level: r.ok ? 'ok' : 'error',
      stage: 'done',
      message: r.ok ? `系统语音完成（${playMs}ms）` : r.error || 'fail',
      ms: totalMs,
      engine: 'system',
      textPreview: preview,
    })
    return { ...r, engine: 'system', timing: { totalMs, playMs } }
  }

  const next = speakChain.then(run, run)
  speakChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/**
 * 分块合成+播放流水线：首包短句尽快出声，播放时预取下一块。
 * 成功/取消返回结果；合成失败返回 null 以便上层回退系统音。
 */
async function speakNailongPipelined(
  fullText: string,
  epoch: number,
  totalT0: number,
  preview: string,
): Promise<PetSpeakResult | null> {
  const chunks = splitTtsChunks(fullText.slice(0, 480), 26, 44)
  appendPetTtsLog({
    level: 'info',
    stage: 'start',
    message: `分块朗读 ${chunks.length} 段`,
    textPreview: preview,
    detail: { chunks: chunks.length, firstChars: chunks[0]?.length ?? 0 },
  })

  type SynResult = Awaited<ReturnType<typeof synthesizeNailongTtsToFile>>
  const unlinkQuiet = (file?: string) => {
    if (!file) return
    try {
      fs.unlinkSync(file)
    } catch {
      /* ignore */
    }
  }

  broadcastPetTtsPhase('synthesizing')
  let pending: Promise<SynResult> = synthesizeNailongTtsToFile(chunks[0])
  let totalSynMs = 0
  let totalPlayMs = 0
  let totalBytes = 0
  let lastHttp = 0
  let firstChunk = true

  for (let i = 0; i < chunks.length; i++) {
    const syn = await pending
    if (epoch !== speakEpoch) {
      if (syn.ok) unlinkQuiet(syn.file)
      broadcastPetTtsPhase('idle')
      appendPetTtsLog({
        level: 'warn',
        stage: 'cancelled',
        message: firstChunk ? '合成后被打断' : '分块播放中被打断',
        ms: Date.now() - totalT0,
        textPreview: preview,
      })
      return {
        ok: false,
        cancelled: true,
        error: 'cancelled',
        timing: {
          totalMs: Date.now() - totalT0,
          synthesizeMs: totalSynMs || syn.synthesizeMs,
          playMs: totalPlayMs,
        },
      }
    }
    if (!syn.ok) {
      appendPetTtsLog({
        level: 'error',
        stage: 'synthesize',
        message: syn.error,
        ms: syn.synthesizeMs,
        engine: 'nailong',
        textPreview: preview,
      })
      broadcastPetTtsPhase('idle')
      return null
    }

    totalSynMs += syn.synthesizeMs
    totalBytes += syn.audioBytes
    lastHttp = syn.httpStatus

    if (i + 1 < chunks.length) {
      pending = synthesizeNailongTtsToFile(chunks[i + 1])
    }

    if (firstChunk) {
      broadcastPetTtsPhase('playing')
      firstChunk = false
    }
    appendPetTtsLog({
      level: 'info',
      stage: 'play',
      message: `播放分块 ${i + 1}/${chunks.length}`,
      engine: 'nailong',
      textPreview: previewTextForLog(chunks[i]),
      detail: { synthesizeMs: syn.synthesizeMs, audioBytes: syn.audioBytes },
    })
    const playT0 = Date.now()
    const played = await playAudioFileBlocking(syn.file)
    totalPlayMs += Date.now() - playT0

    if (epoch !== speakEpoch) {
      broadcastPetTtsPhase('idle')
      appendPetTtsLog({
        level: 'warn',
        stage: 'cancelled',
        message: '播放中被打断',
        ms: Date.now() - totalT0,
        engine: 'nailong',
        textPreview: preview,
        detail: { playMs: totalPlayMs, synthesizeMs: totalSynMs },
      })
      return {
        ok: false,
        cancelled: true,
        error: 'cancelled',
        timing: {
          totalMs: Date.now() - totalT0,
          synthesizeMs: totalSynMs,
          playMs: totalPlayMs,
          audioBytes: totalBytes,
          httpStatus: lastHttp,
        },
      }
    }
    if (!played.ok) {
      appendPetTtsLog({
        level: 'error',
        stage: 'play',
        message: `播放失败：${played.error || 'play_failed'}`,
        engine: 'nailong',
        textPreview: preview,
      })
      broadcastPetTtsPhase('idle')
      return null
    }
  }

  const totalMs = Date.now() - totalT0
  broadcastPetTtsPhase('idle')
  appendPetTtsLog({
    level: 'ok',
    stage: 'done',
    message: `奶龙音色完成（${chunks.length} 段；合成累计 ${totalSynMs}ms + 播放 ${totalPlayMs}ms）`,
    ms: totalMs,
    engine: 'nailong',
    textPreview: preview,
    detail: {
      synthesizeMs: totalSynMs,
      playMs: totalPlayMs,
      totalMs,
      audioBytes: totalBytes,
      chunks: chunks.length,
    },
  })
  return {
    ok: true,
    engine: 'nailong',
    timing: {
      totalMs,
      synthesizeMs: totalSynMs,
      playMs: totalPlayMs,
      audioBytes: totalBytes,
      httpStatus: lastHttp,
    },
  }
}

export function stopNativeSpeak() {
  speakEpoch++
  killSpeakProcesses()
  broadcastPetTtsPhase('idle')
}

export function resolvePetVoiceDir(): string {
  const candidates = [
    path.join(process.cwd(), 'public', 'pet', 'nailong', 'voices'),
    path.join(app.getAppPath(), 'public', 'pet', 'nailong', 'voices'),
    path.join(__dirname, '../renderer/main_window/pet/nailong/voices'),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* ignore */
    }
  }
  return candidates[0]
}
