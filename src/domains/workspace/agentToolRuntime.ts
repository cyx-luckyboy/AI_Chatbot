import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { shell } from 'electron'
import iconv from 'iconv-lite'
import { configManager } from '../../shared/config'
import { isChatAborted, registerChatChild } from '../chat/chatAbort'

export type AgentToolName =
  | 'list_dir'
  | 'read_file'
  | 'write_file'
  | 'search_files'
  | 'run_command'
  | 'open_path'
  | 'open_in_editor'
  | 'open_url'

export type AgentToolCall = {
  id: string
  name: string
  arguments: string
}

const MAX_READ_CHARS = 80_000
const MAX_WRITE_CHARS = 200_000
const MAX_LIST_ENTRIES = 200
const MAX_SEARCH_HITS = 40
const MAX_SEARCH_FILE_BYTES = 512 * 1024
const MAX_CMD_OUTPUT = 100_000
const DEFAULT_CMD_TIMEOUT_MS = 45_000
const MAX_CMD_TIMEOUT_MS = 120_000

const BLOCKED_CMD_RE =
  /\b(format\s+[a-z]:|shutdown|restart-computer|rm\s+-rf\s+[\\/]|del\s+\/[sS]\s+[\\/]|reg\s+delete|Remove-Item\s+.*-Recurse\s+.*[\\/]\s*$|mkfs|diskpart)\b/i

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_dir',
      description:
        'List files and folders under a path relative to the workspace root. Always use this before inventing file names.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path inside workspace. Use "." for workspace root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a text file inside the workspace. Path may be relative or absolute under workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path inside workspace (relative preferred).' },
          max_chars: {
            type: 'number',
            description: `Optional max characters to return (default ${MAX_READ_CHARS}).`,
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description:
        'Create or overwrite a text file inside the workspace. Parent folders are created automatically. You MUST call this tool to actually create/edit files — do not only describe the content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path inside workspace (relative preferred).' },
          content: { type: 'string', description: 'Full file content to write.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for a literal string in text files under a relative directory.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal substring to find.' },
          path: {
            type: 'string',
            description: 'Relative directory to search. Default ".".',
          },
          glob: {
            type: 'string',
            description: 'Optional filename suffix filter, e.g. ".ts" or ".vue".',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description:
        'Run a shell command with cwd set to the workspace. Prefer non-interactive commands. Output is truncated. For GUI apps (pygame games, etc.) on Windows prefer: start "" python "rel\\path.py" so the agent is not blocked; or just tell the user to run it locally. To open VS Code/Cursor prefer open_in_editor instead.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
          timeout_ms: {
            type: 'number',
            description: `Optional timeout in ms (default ${DEFAULT_CMD_TIMEOUT_MS}, max ${MAX_CMD_TIMEOUT_MS}).`,
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_path',
      description:
        'Open a workspace file or folder with the OS default associated application (e.g. .py in default Python IDE, .sln in Visual Studio, folder in Explorer). Non-blocking.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path inside workspace. Use "." for workspace root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_in_editor',
      description:
        'Open a workspace file or folder in the user\'s configured code editor (VS Code `code`, Cursor `cursor`, etc.). Non-blocking. Use this when the user asks to open the project/compiler/IDE.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file or folder path. Default "." (workspace root).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_url',
      description:
        'Open a URL or a local workspace HTML/file in the system default browser. Use after write_file when creating an HTML page/demo/game so the user can view it immediately. Accepts https?:// URLs or a relative path like "demo/index.html".',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'http(s) URL, or a workspace-relative path to an HTML/file (e.g. games/snake.html).',
          },
        },
        required: ['url'],
      },
    },
  },
]

export function getAgentWorkspacePath(): string {
  return (configManager.get().agentWorkspacePath || '').trim()
}

/** 把模型给的路径规范成工作区内相对路径；拒绝逃逸 */
export function normalizeWorkspaceRelPath(input: string): string {
  const workspace = getAgentWorkspacePath()
  if (!workspace) {
    throw new Error('未设置 Agent 工作区：请先在输入栏选择工作区文件夹。')
  }
  const root = path.resolve(workspace)
  let raw = String(input || '').trim().replace(/^["']|["']$/g, '')
  if (!raw || raw === '.' || raw === './' || raw === '.\\') return '.'

  // file:///E:/foo → E:\foo
  if (/^file:\/\//i.test(raw)) {
    try {
      raw = decodeURIComponent(raw.replace(/^file:\/\//i, ''))
      if (/^\/[A-Za-z]:\//.test(raw)) raw = raw.slice(1)
    } catch {
      /* keep raw */
    }
  }

  raw = raw.replace(/\//g, path.sep)

  const rootLower = root.toLowerCase()
  const rawLower = raw.toLowerCase()
  // 绝对路径且落在工作区内 → 转相对
  if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    const abs = path.resolve(raw)
    const absLower = abs.toLowerCase()
    if (absLower === rootLower) return '.'
    if (absLower.startsWith(rootLower + path.sep.toLowerCase()) || absLower.startsWith(rootLower + '\\') || absLower.startsWith(rootLower + '/')) {
      return path.relative(root, abs) || '.'
    }
    throw new Error(`路径越界，禁止访问工作区外：${input}`)
  }

  // 误带工作区前缀的相对写法
  if (rawLower.startsWith(rootLower + path.sep.toLowerCase()) || rawLower.startsWith(rootLower + '\\')) {
    return path.relative(root, path.resolve(raw)) || '.'
  }

  const joined = path.resolve(root, raw)
  const rel = path.relative(root, joined)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界，禁止访问工作区外：${input}`)
  }
  return rel || '.'
}

async function resolveInsideWorkspace(inputPath: string): Promise<string> {
  const workspace = getAgentWorkspacePath()
  if (!workspace) {
    throw new Error('未设置 Agent 工作区：请先在输入栏选择工作区文件夹。')
  }
  const root = path.resolve(workspace)
  const rel = normalizeWorkspaceRelPath(inputPath)
  const joined = path.resolve(root, rel)

  const relCheck = path.relative(root, joined)
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error(`路径越界，禁止访问工作区外：${inputPath}`)
  }

  try {
    const real = await fs.realpath(joined)
    const realRoot = await fs.realpath(root)
    const relReal = path.relative(realRoot, real)
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`路径越界，禁止访问工作区外：${inputPath}`)
    }
    return real
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code !== 'ENOENT') throw e
    // 新建文件：确保祖先目录链不逃逸；缺失的中间目录稍后 mkdir
    let cursor = path.dirname(joined)
    while (true) {
      try {
        const realCursor = await fs.realpath(cursor)
        const realRoot = await fs.realpath(root).catch(() => root)
        const relCursor = path.relative(realRoot, realCursor)
        if (relCursor.startsWith('..') || path.isAbsolute(relCursor)) {
          throw new Error(`路径越界，禁止访问工作区外：${inputPath}`)
        }
        break
      } catch (e2) {
        const err2 = e2 as NodeJS.ErrnoException
        if (err2?.message?.includes('路径越界')) throw e2
        if (err2?.code !== 'ENOENT') throw e2
        const parent = path.dirname(cursor)
        if (parent === cursor) break
        const relParent = path.relative(root, parent)
        if (relParent.startsWith('..') || path.isAbsolute(relParent)) {
          throw new Error(`路径越界，禁止访问工作区外：${inputPath}`)
        }
        cursor = parent
      }
    }
    return joined
  }
}

/** 尽量解析模型给的 tool arguments（允许轻微损坏的 JSON） */
export function parseToolArguments(raw: string): Record<string, unknown> {
  const s0 = String(raw || '').trim()
  if (!s0) return {}

  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      /* ignore */
    }
    return null
  }

  let hit = tryParse(s0)
  if (hit) return hit

  // 去掉 markdown 围栏
  const fenced = s0.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  hit = tryParse(fenced)
  if (hit) return hit

  // 截取第一个 { ... } 平衡括号
  const start = s0.indexOf('{')
  if (start >= 0) {
    let depth = 0
    let end = -1
    for (let i = start; i < s0.length; i++) {
      const ch = s0[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > start) {
      hit = tryParse(s0.slice(start, end + 1))
      if (hit) return hit
    }
  }

  // write_file 常见：content 含未转义换行 → 用正则抽 path + content
  const pathMatch = /"path"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(s0)
  const contentKey = /"content"\s*:\s*/i.exec(s0)
  if (pathMatch && contentKey && contentKey.index != null) {
    let after = s0.slice(contentKey.index + contentKey[0].length).trim()
    if (after.startsWith('"')) {
      // 扫描到最后一个未转义引号前（宽松）
      let i = 1
      let out = ''
      while (i < after.length) {
        const ch = after[i]
        if (ch === '\\' && i + 1 < after.length) {
          out += after[i + 1]
          i += 2
          continue
        }
        if (ch === '"') break
        out += ch
        i++
      }
      return {
        path: JSON.parse(`"${pathMatch[1]}"`),
        content: out,
      }
    }
  }

  return {}
}

function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return fallback
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

async function listDir(rel: string): Promise<string> {
  const abs = await resolveInsideWorkspace(rel || '.')
  const entries = await fs.readdir(abs, { withFileTypes: true })
  const lines = entries.slice(0, MAX_LIST_ENTRIES).map((e) => {
    const mark = e.isDirectory() ? 'dir ' : 'file'
    return `${mark}\t${e.name}`
  })
  const more =
    entries.length > MAX_LIST_ENTRIES ? `\n… and ${entries.length - MAX_LIST_ENTRIES} more` : ''
  const body = lines.join('\n') + more
  return body || '(empty)'
}

async function readFileTool(rel: string, maxChars?: number): Promise<string> {
  const abs = await resolveInsideWorkspace(rel)
  const st = await fs.stat(abs)
  if (!st.isFile()) throw new Error(`不是文件：${rel}`)
  const limit = Math.min(Math.max(1, maxChars ?? MAX_READ_CHARS), MAX_READ_CHARS)
  const text = await fs.readFile(abs, 'utf-8')
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n\n…[truncated, total ${text.length} chars]`
}

async function writeFileTool(rel: string, content: string): Promise<string> {
  if (content.length > MAX_WRITE_CHARS) {
    throw new Error(`内容过长（>${MAX_WRITE_CHARS} 字符）`)
  }
  const abs = await resolveInsideWorkspace(rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
  const shown = normalizeWorkspaceRelPath(rel)
  return `OK wrote ${content.length} chars → ${shown}\nabs: ${abs}`
}

async function walkFiles(dir: string, suffix: string, out: string[], limit: number): Promise<void> {
  if (out.length >= limit) return
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (out.length >= limit) return
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === '.vite') {
      continue
    }
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walkFiles(full, suffix, out, limit)
    } else if (e.isFile()) {
      if (!suffix || e.name.toLowerCase().endsWith(suffix.toLowerCase())) {
        out.push(full)
      }
    }
  }
}

async function searchFiles(query: string, relDir: string, globSuffix: string): Promise<string> {
  const q = query.trim()
  if (!q) throw new Error('query 不能为空')
  const root = await resolveInsideWorkspace(relDir || '.')
  const files: string[] = []
  await walkFiles(root, globSuffix || '', files, 800)
  const workspace = path.resolve(getAgentWorkspacePath())
  const hits: string[] = []
  for (const file of files) {
    if (hits.length >= MAX_SEARCH_HITS) break
    try {
      const st = await fs.stat(file)
      if (st.size > MAX_SEARCH_FILE_BYTES) continue
      const text = await fs.readFile(file, 'utf-8')
      const idx = text.indexOf(q)
      if (idx < 0) continue
      const line = text.slice(0, idx).split(/\r?\n/).length
      const rel = path.relative(workspace, file)
      const snippet = text
        .slice(Math.max(0, idx - 40), Math.min(text.length, idx + q.length + 40))
        .replace(/\s+/g, ' ')
      hits.push(`${rel}:${line}: ${snippet}`)
    } catch {
      /* skip binary / unreadable */
    }
  }
  if (!hits.length) return 'No matches.'
  const more = files.length >= 800 ? '\n… search file walk capped' : ''
  return hits.join('\n') + more
}

function runCommand(command: string, timeoutMs?: number): Promise<string> {
  const cmd = command.trim()
  if (!cmd) return Promise.reject(new Error('command 不能为空'))
  if (BLOCKED_CMD_RE.test(cmd)) {
    return Promise.reject(new Error('命令被安全策略拒绝（危险操作）'))
  }
  const workspace = getAgentWorkspacePath()
  if (!workspace) return Promise.reject(new Error('未设置 Agent 工作区'))
  const timeout = Math.min(
    Math.max(1_000, timeoutMs ?? DEFAULT_CMD_TIMEOUT_MS),
    MAX_CMD_TIMEOUT_MS,
  )

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd: path.resolve(workspace),
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        // 尽量让子进程输出 UTF-8，减少 Windows 乱码
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })
    registerChatChild(child)
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill()
    }, timeout)

    const take = (buf: Buffer, which: 'out' | 'err') => {
      const s = decodeCommandOutput(buf)
      if (which === 'out') stdout += s
      else stderr += s
      if (stdout.length + stderr.length > MAX_CMD_OUTPUT * 2) {
        killed = true
        child.kill()
      }
    }

    child.stdout?.on('data', (b: Buffer) => take(b, 'out'))
    child.stderr?.on('data', (b: Buffer) => take(b, 'err'))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (isChatAborted()) {
        resolve(`exit=${code ?? 'null'} (aborted by user)\n${clipOut(stdout, stderr)}`)
        return
      }
      const clip = (s: string) =>
        s.length > MAX_CMD_OUTPUT ? `${s.slice(0, MAX_CMD_OUTPUT)}\n…[truncated]` : s
      const parts = [
        `exit=${code ?? 'null'}${killed ? ' (killed)' : ''}`,
        clip(stdout) && `stdout:\n${clip(stdout)}`,
        clip(stderr) && `stderr:\n${clip(stderr)}`,
      ].filter(Boolean)
      resolve(parts.join('\n\n'))
    })
  })
}

function clipOut(stdout: string, stderr: string): string {
  const clip = (s: string) =>
    s.length > MAX_CMD_OUTPUT ? `${s.slice(0, MAX_CMD_OUTPUT)}\n…[truncated]` : s
  const parts = [
    clip(stdout) && `stdout:\n${clip(stdout)}`,
    clip(stderr) && `stderr:\n${clip(stderr)}`,
  ].filter(Boolean)
  return parts.join('\n\n')
}

/** Windows 控制台常为 GBK；优先 UTF-8，失败再试 GBK */
function decodeCommandOutput(buf: Buffer): string {
  const asUtf8 = buf.toString('utf-8')
  if (!asUtf8.includes('\uFFFD')) return asUtf8
  try {
    return iconv.decode(buf, 'gbk')
  } catch {
    return asUtf8
  }
}

function launchDetached(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      shell: true,
      windowsHide: false,
      env: { ...process.env },
    })
    let settled = false
    child.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
    // 分离启动：短暂等待以捕获立刻失败（命令不存在）
    setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.unref()
      } catch {
        /* ignore */
      }
      resolve()
    }, 400)
  })
}

async function openPathTool(rel: string): Promise<string> {
  const abs = await resolveInsideWorkspace(rel || '.')
  const err = await shell.openPath(abs)
  if (err) throw new Error(err)
  return `Opened with default app: ${abs}`
}

async function openInEditorTool(rel: string): Promise<string> {
  const abs = await resolveInsideWorkspace(rel || '.')
  const workspace = path.resolve(getAgentWorkspacePath())
  const preferred = (configManager.get().agentEditorCommand || '').trim()
  const candidates = preferred
    ? [preferred]
    : process.platform === 'win32'
      ? ['code', 'cursor', 'code.cmd', 'cursor.cmd']
      : ['code', 'cursor']

  const errors: string[] = []
  for (const cmd of candidates) {
    try {
      await launchDetached(cmd, [abs], workspace)
      return `Opened in editor \`${cmd}\`: ${abs}`
    } catch (e) {
      errors.push(`${cmd}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 回退：系统默认关联程序
  const err = await shell.openPath(abs)
  if (err) {
    throw new Error(
      `无法打开编辑器（已尝试：${candidates.join(', ')}）。${errors.join('; ') || err}。请在设置中填写「Agent 编辑器命令」，例如 code 或 cursor。`,
    )
  }
  return `Editor CLI not found; opened with default app: ${abs}`
}

async function openUrlTool(raw: string): Promise<string> {
  const input = String(raw || '').trim()
  if (!input) throw new Error('url 不能为空')

  // http(s) 外链
  if (/^https?:\/\//i.test(input)) {
    let parsed: URL
    try {
      parsed = new URL(input)
    } catch {
      throw new Error(`无效 URL：${input}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('仅支持 http/https')
    }
    await shell.openExternal(parsed.href)
    return `Opened in browser: ${parsed.href}`
  }

  // file:// — 仅允许指向工作区内文件
  if (/^file:/i.test(input)) {
    let filePath: string
    try {
      filePath = decodeURIComponent(input.replace(/^file:\/\//i, ''))
      if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1)
      filePath = filePath.replace(/\//g, path.sep)
    } catch {
      throw new Error(`无效 file URL：${input}`)
    }
    const abs = await resolveInsideWorkspace(filePath)
    const href = pathToFileURL(abs).href
    await shell.openExternal(href)
    return `Opened local file in browser: ${abs}`
  }

  // 工作区相对路径（典型：写完 HTML 后打开）
  const abs = await resolveInsideWorkspace(input)
  const st = await fs.stat(abs)
  if (st.isDirectory()) {
    throw new Error('open_url 需要文件路径或 http(s) URL，不能是目录。打开文件夹请用 open_path。')
  }
  const href = pathToFileURL(abs).href
  await shell.openExternal(href)
  return `Opened in browser: ${abs}\n(${href})`
}

export async function executeAgentTool(call: AgentToolCall): Promise<string> {
  const name = (call.name || '').trim() as AgentToolName
  const args = parseToolArguments(call.arguments)
  try {
    switch (name) {
      case 'list_dir':
        return await listDir(asString(args.path, '.'))
      case 'read_file':
        return await readFileTool(asString(args.path), asNumber(args.max_chars))
      case 'write_file': {
        const p = asString(args.path)
        const content = asString(args.content)
        if (!p) return 'Error: write_file 缺少 path'
        return await writeFileTool(p, content)
      }
      case 'search_files':
        return await searchFiles(
          asString(args.query),
          asString(args.path, '.'),
          asString(args.glob),
        )
      case 'run_command':
        return await runCommand(asString(args.command), asNumber(args.timeout_ms))
      case 'open_path':
        return await openPathTool(asString(args.path, '.'))
      case 'open_in_editor':
        return await openInEditorTool(asString(args.path, '.'))
      case 'open_url':
        return await openUrlTool(asString(args.url) || asString(args.path))
      default:
        return `Unknown tool: ${call.name}`
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** 工作台 UI：列目录（主进程 IPC） */
export async function workspaceListDir(relPath = '.'): Promise<
  { name: string; path: string; kind: 'file' | 'dir' }[]
> {
  const abs = await resolveInsideWorkspace(relPath || '.')
  const entries = await fs.readdir(abs, { withFileTypes: true })
  const base = normalizeWorkspaceRelPath(relPath || '.')
  return entries
    .filter((e) => e.name !== 'node_modules' && e.name !== '.git')
    .map((e) => {
      const childRel =
        !base || base === '.' ? e.name : `${base.replace(/\\/g, '/')}/${e.name}`.replace(/\\/g, '/')
      return {
        name: e.name,
        path: childRel.replace(/\\/g, '/'),
        kind: (e.isDirectory() ? 'dir' : 'file') as 'file' | 'dir',
      }
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}

/** 工作台 UI：读文本文件 */
export async function workspaceReadFile(relPath: string): Promise<{ path: string; content: string }> {
  const content = await readFileTool(relPath)
  return { path: normalizeWorkspaceRelPath(relPath), content }
}

/** 工作台 UI：写文本文件 */
export async function workspaceWriteFile(
  relPath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  await writeFileTool(relPath, content)
  return { path: normalizeWorkspaceRelPath(relPath), bytes: content.length }
}

export type WorkspaceDefinitionHit = {
  path: string
  line: number
  column: number
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 在工作区源码中查找符号定义（供编辑器 Ctrl+单击跳转） */
export async function workspaceFindDefinitions(
  symbol: string,
  fromPath?: string,
): Promise<WorkspaceDefinitionHit[]> {
  const name = symbol.trim()
  if (!name || !/^[\w$]+$/.test(name)) return []
  const workspace = getAgentWorkspacePath()
  if (!workspace) return []

  const root = path.resolve(workspace)
  const files: string[] = []
  await walkFiles(root, '', files, 600)
  const codeExt = /\.(ts|tsx|js|jsx|mjs|cjs|vue|py|go|rs|java|kt|cs|cpp|c|h|hpp|rb|php|swift)$/i
  const fromNorm = fromPath ? normalizeWorkspaceRelPath(fromPath).replace(/\\/g, '/') : ''

  const patterns: RegExp[] = [
    new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(name)}\\b`),
    new RegExp(
      `(?:export\\s+)?(?:default\\s+)?(?:const|let|var)\\s+${escapeRegExp(name)}\\b\\s*=`,
    ),
    new RegExp(`(?:export\\s+)?(?:default\\s+)?class\\s+${escapeRegExp(name)}\\b`),
    new RegExp(`(?:export\\s+)?(?:type|interface|enum)\\s+${escapeRegExp(name)}\\b`),
    new RegExp(`(?:async\\s+)?def\\s+${escapeRegExp(name)}\\b`),
    new RegExp(`^\\s*class\\s+${escapeRegExp(name)}\\b`, 'm'),
    new RegExp(`(?:pub\\s+)?(?:async\\s+)?fn\\s+${escapeRegExp(name)}\\b`),
    new RegExp(`func\\s+${escapeRegExp(name)}\\b`),
  ]

  const hits: WorkspaceDefinitionHit[] = []
  for (const file of files) {
    if (!codeExt.test(file)) continue
    if (hits.length >= 20) break
    try {
      const st = await fs.stat(file)
      if (st.size > MAX_SEARCH_FILE_BYTES) continue
      const text = await fs.readFile(file, 'utf-8')
      const rel = normalizeWorkspaceRelPath(path.relative(workspace, file)).replace(/\\/g, '/')
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i]
        for (const re of patterns) {
          const m = re.exec(lineText)
          if (!m) continue
          const nameAt = lineText.indexOf(name, m.index ?? 0)
          hits.push({
            path: rel,
            line: i + 1,
            column: nameAt >= 0 ? nameAt + 1 : Math.max(1, (m.index ?? 0) + 1),
          })
          break
        }
        if (hits.length >= 20) break
      }
    } catch {
      /* skip */
    }
  }

  // 当前文件优先；同路径的排前面
  hits.sort((a, b) => {
    const aCur = fromNorm && a.path === fromNorm ? 0 : 1
    const bCur = fromNorm && b.path === fromNorm ? 0 : 1
    if (aCur !== bCur) return aCur - bCur
    return a.path.localeCompare(b.path) || a.line - b.line
  })
  return hits
}

/** Anthropic tools 定义（从 OpenAI 风格转换） */
export function toAnthropicToolDefinitions(): {
  name: string
  description: string
  input_schema: Record<string, unknown>
}[] {
  return AGENT_TOOL_DEFINITIONS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: {
      type: 'object',
      ...(t.function.parameters as Record<string, unknown>),
    },
  }))
}
