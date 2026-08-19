import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import net from 'net'
import path from 'path'
import { BrowserWindow } from 'electron'
import { configManager } from '../../shared/config'

export type ServiceId = 'tts' | 'voice-bot'

export type ServiceLogLevel = 'info' | 'ok' | 'warn' | 'error'

export type ServiceLogEntry = {
  id: string
  at: string
  level: ServiceLogLevel
  stream: 'stdout' | 'stderr' | 'system'
  message: string
}

export type ServiceStatusItem = {
  id: ServiceId
  target: string
  up: boolean
  latencyMs?: number
  detail?: string
  error?: string
  managed: boolean
  starting: boolean
}

export type ServicesStatusResult = {
  items: ServiceStatusItem[]
  vendorPipecat: boolean
  vendorTts: boolean
}

const MAX_LOGS = 200

type Managed = {
  proc: ChildProcessWithoutNullStreams | null
  logs: ServiceLogEntry[]
  starting: boolean
}

const managed = new Map<ServiceId, Managed>([
  ['tts', { proc: null, logs: [], starting: false }],
  ['voice-bot', { proc: null, logs: [], starting: false }],
])

function getRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(__dirname, '..', '..', '..'),
    path.join(__dirname, '..', '..'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'scripts', 'start-tts.ps1'))) return c
  }
  return process.cwd()
}

function readDotEnv(root: string): Record<string, string> {
  const map: Record<string, string> = {}
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return map
  const text = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (k) map[k] = v
  }
  return map
}

function voiceEndpoint(): { host: string; port: number } {
  const env = readDotEnv(getRepoRoot())
  return {
    host: (env.PIPECAT_HOST || '127.0.0.1').trim(),
    port: parseInt(env.PIPECAT_PORT || '8765', 10) || 8765,
  }
}

function ttsBaseUrl(): string {
  const cfg = configManager.get()
  return String(cfg.nailongTtsBaseUrl || 'http://127.0.0.1:9880').replace(/\/$/, '')
}

function broadcastLog(serviceId: ServiceId, entry: ServiceLogEntry) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('service-log', { serviceId, entry })
      } catch {
        /* ignore */
      }
    }
  }
}

function makeLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendLog(serviceId: ServiceId, partial: Omit<ServiceLogEntry, 'id' | 'at'>): ServiceLogEntry {
  const m = managed.get(serviceId)!
  const entry: ServiceLogEntry = {
    id: makeLogId(),
    at: new Date().toISOString(),
    ...partial,
  }
  m.logs.push(entry)
  while (m.logs.length > MAX_LOGS) m.logs.shift()
  broadcastLog(serviceId, entry)
  return entry
}

function testTcp(host: string, port: number, timeoutMs = 1500): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now()
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Date.now() - t0, error })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, `timeout ${timeoutMs}ms`))
    socket.once('error', (e) => finish(false, e.message))
    socket.connect(port, host)
  })
}

function testTtsHttp(baseUrl: string, timeoutMs = 2500): Promise<{ ok: boolean; ms: number; detail?: string; error?: string }> {
  const t0 = Date.now()
  return new Promise((resolve) => {
    try {
      const u = new URL(`${baseUrl.replace(/\/$/, '')}/tts`)
      const lib = u.protocol === 'https:' ? https : http
      const body = Buffer.from('{}')
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) },
          timeout: timeoutMs,
        },
        (res) => {
          res.resume()
          resolve({
            ok: (res.statusCode || 0) > 0,
            ms: Date.now() - t0,
            detail: `HTTP ${res.statusCode}`,
          })
        },
      )
      req.on('error', (e) => resolve({ ok: false, ms: Date.now() - t0, error: e.message }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ ok: false, ms: Date.now() - t0, error: `timeout ${timeoutMs}ms` })
      })
      req.write(body)
      req.end()
    } catch (e) {
      resolve({
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })
}

async function probeTts(): Promise<Omit<ServiceStatusItem, 'id' | 'managed' | 'starting'>> {
  const base = ttsBaseUrl()
  const r = await testTtsHttp(base)
  return {
    target: `${base}/tts`,
    up: r.ok,
    latencyMs: r.ms,
    detail: r.detail,
    error: r.error,
  }
}

async function probeVoiceBot(): Promise<Omit<ServiceStatusItem, 'id' | 'managed' | 'starting'>> {
  const { host, port } = voiceEndpoint()
  const r = await testTcp(host, port)
  return {
    target: `tcp://${host}:${port}`,
    up: r.ok,
    latencyMs: r.ms,
    detail: r.ok ? 'accepting TCP' : undefined,
    error: r.error,
  }
}

export async function getServicesStatus(): Promise<ServicesStatusResult> {
  const root = getRepoRoot()
  const [ttsProbe, voiceProbe] = await Promise.all([probeTts(), probeVoiceBot()])
  const ttsM = managed.get('tts')!
  const voiceM = managed.get('voice-bot')!
  return {
    items: [
      {
        id: 'tts',
        ...ttsProbe,
        managed: Boolean(ttsM.proc && !ttsM.proc.killed),
        starting: ttsM.starting,
      },
      {
        id: 'voice-bot',
        ...voiceProbe,
        managed: Boolean(voiceM.proc && !voiceM.proc.killed),
        starting: voiceM.starting,
      },
    ],
    vendorPipecat: fs.existsSync(path.join(root, 'vendor', 'pipecat', 'pyproject.toml')),
    vendorTts: fs.existsSync(path.join(root, 'vendor', 'GPT-SoVITS')),
  }
}

function scriptFor(id: ServiceId): string {
  const root = getRepoRoot()
  const name = id === 'tts' ? 'start-tts.ps1' : 'start-voice-bot.ps1'
  return path.join(root, 'scripts', name)
}

function wireProcess(serviceId: ServiceId, proc: ChildProcessWithoutNullStreams) {
  const m = managed.get(serviceId)!
  m.proc = proc

  const onData = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    const text = chunk.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trimEnd()
      if (!trimmed) continue
      appendLog(serviceId, {
        level: stream === 'stderr' ? 'warn' : 'info',
        stream,
        message: trimmed,
      })
    }
  }

  proc.stdout.on('data', (c) => onData('stdout', c))
  proc.stderr.on('data', (c) => onData('stderr', c))
  proc.on('error', (e) => {
    appendLog(serviceId, { level: 'error', stream: 'system', message: e.message })
    m.starting = false
    m.proc = null
  })
  proc.on('exit', (code, signal) => {
    appendLog(serviceId, {
      level: code === 0 ? 'info' : 'warn',
      stream: 'system',
      message: `process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    })
    m.starting = false
    m.proc = null
  })
}

async function waitUntilUp(id: ServiceId, timeoutMs = 120_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const status = id === 'tts' ? await probeTts() : await probeVoiceBot()
    if (status.up) return true
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

export async function startService(id: ServiceId): Promise<{ ok: boolean; error?: string; alreadyRunning?: boolean }> {
  const m = managed.get(id)
  if (!m) return { ok: false, error: 'unknown service' }

  const current = id === 'tts' ? await probeTts() : await probeVoiceBot()
  if (current.up) {
    return { ok: true, alreadyRunning: true }
  }

  if (m.proc && !m.proc.killed) {
    return { ok: true, alreadyRunning: true }
  }

  if (m.starting) {
    return { ok: true, alreadyRunning: true }
  }

  const script = scriptFor(id)
  if (!fs.existsSync(script)) {
    const err = `启动脚本不存在: ${script}`
    appendLog(id, { level: 'error', stream: 'system', message: err })
    return { ok: false, error: err }
  }

  m.starting = true
  appendLog(id, { level: 'info', stream: 'system', message: `starting: ${script}` })

  try {
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      {
        cwd: getRepoRoot(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env },
      },
    )
    wireProcess(id, proc)

    void waitUntilUp(id).then((up) => {
      m.starting = false
      if (up) {
        appendLog(id, { level: 'ok', stream: 'system', message: 'service is up' })
      } else {
        appendLog(id, { level: 'warn', stream: 'system', message: 'started but health check still failing' })
      }
    })

    return { ok: true }
  } catch (e) {
    m.starting = false
    const err = e instanceof Error ? e.message : String(e)
    appendLog(id, { level: 'error', stream: 'system', message: err })
    return { ok: false, error: err }
  }
}

export function getServiceLogs(id: ServiceId): ServiceLogEntry[] {
  return [...(managed.get(id)?.logs || [])]
}

export function clearServiceLogs(id: ServiceId): void {
  const m = managed.get(id)
  if (m) m.logs = []
}

export function shutdownManagedServices(): void {
  for (const [id, m] of managed) {
    if (m.proc && !m.proc.killed) {
      try {
        m.proc.kill()
        appendLog(id, { level: 'info', stream: 'system', message: 'stopped on app quit' })
      } catch {
        /* ignore */
      }
    }
    m.proc = null
    m.starting = false
  }
}
