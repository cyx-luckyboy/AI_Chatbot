import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import iconv from 'iconv-lite'
import { getAgentWorkspacePath } from './agentToolRuntime'

type ShellSession = {
  id: string
  cwd: string
  /** 当前正在跑的一条命令（跑完即退出） */
  running: ChildProcessWithoutNullStreams | null
  killed: boolean
}

const sessions = new Map<string, ShellSession>()
let seq = 0

function resolveCwd(cwd?: string): string {
  const ws = getAgentWorkspacePath()
  if (cwd && cwd.trim()) return cwd
  if (ws) return ws
  return process.env.USERPROFILE || process.env.HOME || process.cwd()
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(channel, payload)
  }
}

function decodeChunk(buf: Buffer): string {
  if (process.platform !== 'win32') return buf.toString('utf8')
  const asUtf = buf.toString('utf8')
  if (!asUtf.includes('\uFFFD')) return asUtf
  try {
    return iconv.decode(buf, 'gbk')
  } catch {
    return asUtf
  }
}

function killProcessTree(proc: ChildProcessWithoutNullStreams) {
  const pid = proc.pid
  if (!pid) {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
    return
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    }
    return
  }
  try {
    proc.kill('SIGINT')
  } catch {
    try {
      proc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

function spawnCommand(command: string, cwd: string): ChildProcessWithoutNullStreams {
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
  if (process.platform === 'win32') {
    // 每条命令单独进程，结束后自然退出，避免管道壳挂死
    return spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        cwd,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  }
  const shell = process.env.SHELL || '/bin/bash'
  return spawn(shell, ['-lc', command], {
    cwd,
    env: {
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

export function createTerminalSession(opts?: {
  cols?: number
  rows?: number
  cwd?: string
}): { ok: true; id: string } | { ok: false; error: string } {
  try {
    const cwd = resolveCwd(opts?.cwd)
    const id = `sh-${Date.now()}-${++seq}`
    sessions.set(id, { id, cwd, running: null, killed: false })

    const banner =
      process.platform === 'win32'
        ? `\x1b[90m[终端] ${cwd}\x1b[0m\r\n\x1b[90m每条命令执行完会自动回到提示符；Ctrl+C 可中断当前命令\x1b[0m\r\n`
        : `\x1b[90m[terminal] ${cwd}\x1b[0m\r\n`

    setTimeout(() => broadcast('terminal-data', { id, data: banner }), 30)
    setTimeout(() => broadcast('terminal-ready', { id }), 40)
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 写入一整行命令并执行；空行忽略 */
export function writeTerminal(id: string, data: string): { ok: boolean; error?: string } {
  const s = sessions.get(id)
  if (!s || s.killed) return { ok: false, error: 'not_found' }

  const command = String(data || '').replace(/\r?\n$/g, '').trim()
  if (!command) {
    broadcast('terminal-ready', { id })
    return { ok: true }
  }

  if (s.running) {
    return { ok: false, error: 'busy' }
  }

  try {
    const proc = spawnCommand(command, s.cwd)
    s.running = proc

    proc.stdout.on('data', (buf: Buffer) => {
      broadcast('terminal-data', { id, data: decodeChunk(buf) })
    })
    proc.stderr.on('data', (buf: Buffer) => {
      broadcast('terminal-data', { id, data: decodeChunk(buf) })
    })
    proc.on('error', (err) => {
      broadcast('terminal-data', {
        id,
        data: `\r\n\x1b[31m[error] ${err.message}\x1b[0m\r\n`,
      })
    })
    proc.on('exit', (code) => {
      if (s.running === proc) s.running = null
      const exitCode = code ?? 0
      if (exitCode !== 0) {
        broadcast('terminal-data', {
          id,
          data: `\r\n\x1b[90m[exit ${exitCode}]\x1b[0m\r\n`,
        })
      } else {
        broadcast('terminal-data', { id, data: '\r\n' })
      }
      broadcast('terminal-ready', { id })
    })

    return { ok: true }
  } catch (e) {
    s.running = null
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function interruptTerminal(id: string): { ok: boolean } {
  const s = sessions.get(id)
  if (!s?.running) return { ok: true }
  const proc = s.running
  killProcessTree(proc)
  s.running = null
  broadcast('terminal-data', { id, data: '\r\n\x1b[33m^C\x1b[0m\r\n' })
  broadcast('terminal-ready', { id })
  return { ok: true }
}

export function resizeTerminal(
  _id: string,
  _cols: number,
  _rows: number,
): { ok: boolean; error?: string } {
  return { ok: true }
}

export function killTerminal(id: string): { ok: boolean } {
  const s = sessions.get(id)
  if (!s) return { ok: true }
  s.killed = true
  if (s.running) killProcessTree(s.running)
  s.running = null
  sessions.delete(id)
  return { ok: true }
}

export function killAllTerminals() {
  for (const id of [...sessions.keys()]) {
    killTerminal(id)
  }
}
