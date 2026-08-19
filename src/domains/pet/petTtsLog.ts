import { BrowserWindow } from 'electron'

export type PetTtsLogLevel = 'info' | 'ok' | 'warn' | 'error'

export type PetTtsLogEntry = {
  id: string
  at: string
  level: PetTtsLogLevel
  /** 简短阶段名：start / synthesize / play / done / fail … */
  stage: string
  message: string
  /** 本阶段或累计耗时（毫秒） */
  ms?: number
  engine?: 'nailong' | 'system'
  textPreview?: string
  detail?: Record<string, string | number | boolean | undefined>
}

const MAX_LOGS = 80
const logs: PetTtsLogEntry[] = []

function broadcast(entry: PetTtsLogEntry) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('pet-tts-log', entry)
      } catch {
        /* ignore */
      }
    }
  }
}

/** 桌宠：合成中 / 播放中，用于禁止合成阶段误打断 */
export type PetTtsPhase = 'idle' | 'synthesizing' | 'playing'

export function broadcastPetTtsPhase(phase: PetTtsPhase) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('pet-tts-phase', { phase })
      } catch {
        /* ignore */
      }
    }
  }
}

export function appendPetTtsLog(
  partial: Omit<PetTtsLogEntry, 'id' | 'at'> & { at?: string },
): PetTtsLogEntry {
  const entry: PetTtsLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: partial.at || new Date().toISOString(),
    level: partial.level,
    stage: partial.stage,
    message: partial.message,
    ms: partial.ms,
    engine: partial.engine,
    textPreview: partial.textPreview,
    detail: partial.detail,
  }
  logs.push(entry)
  while (logs.length > MAX_LOGS) logs.shift()

  const msPart = entry.ms != null ? ` ${entry.ms}ms` : ''
  const eng = entry.engine ? ` [${entry.engine}]` : ''
  const line = `[petTTS]${eng} ${entry.stage}: ${entry.message}${msPart}`
  if (entry.level === 'error') console.error(line, entry.detail || '')
  else if (entry.level === 'warn') console.warn(line, entry.detail || '')
  else console.log(line, entry.detail || '')

  broadcast(entry)
  return entry
}

export function getPetTtsLogs(): PetTtsLogEntry[] {
  return [...logs]
}

export function clearPetTtsLogs(): void {
  logs.length = 0
}

export function previewTextForLog(text: string, max = 36): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}
