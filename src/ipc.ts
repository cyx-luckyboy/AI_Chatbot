import { ipcMain, BrowserWindow, app } from 'electron'
import { CreateChatProps, type ChatMessageProps, type TranslateTextResult, type TranslateTargetId } from './types'
import { buildSystemClockContext } from './chatClockContext'
import { baiduAsrRecognize, type BaiduAsrRecognizePayload } from './baiduAsrMain'
import { createProvider } from './providers/createProvider'
import { configManager } from './config'
import { createContextMenu, updateMenu } from './menu'
import fs from 'fs/promises'
import path from 'path'
import { lookup as mimeLookup } from 'mime-types'

function parseDataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Invalid data URL')
  const header = dataUrl.slice(0, comma).trim()
  const payload = dataUrl.slice(comma + 1)
  const mimeMatch = /^data:([^;]+)/i.exec(header)
  const mime = mimeMatch?.[1]?.trim() || 'application/octet-stream'
  const isBase64 = /;base64/i.test(header)
  const buffer = isBase64
    ? Buffer.from(payload.replace(/\s/g, ''), 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  return { buffer, mime }
}

function extFromMime(mime: string): string {
  let ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]+/gi, '').slice(0, 8) || 'bin'
  if (ext === 'jpeg') ext = 'jpg'
  return ext
}

function sanitizeBasename(name: string): string {
  const base = path.basename(name).replace(/^\.+/, '') || 'file'
  return base.replace(/[^\w.\-()\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g, '_').slice(0, 180)
}

const LIBRE_TRANSLATE_URLS = ['https://libretranslate.com/translate', 'https://libretranslate.de/translate']

function mapTranslateTargetToLibre(target: TranslateTargetId): string {
  if (target === 'en') return 'en'
  if (target === 'zh-Hans') return 'zh'
  return 'zt'
}

async function translateLibre(text: string, target: TranslateTargetId): Promise<string | null> {
  const ltTarget = mapTranslateTargetToLibre(target)
  const body = JSON.stringify({
    q: text,
    source: 'auto',
    target: ltTarget,
    format: 'text',
  })
  for (const url of LIBRE_TRANSLATE_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(28_000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { translatedText?: string }
      if (typeof data.translatedText === 'string' && data.translatedText.length > 0) {
        return data.translatedText
      }
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

/** Lingva（Google 翻译前端镜像），GET 适合较短文本；部分实例对繁体目标码返回 400，繁体仅走 Libre/MyMemory */
async function translateLingva(text: string, target: TranslateTargetId): Promise<string | null> {
  if (text.length > 1600) return null
  if (target === 'zh-Hant') return null
  const tgt = target === 'en' ? 'en' : 'zh'
  const encoded = encodeURIComponent(text)
  const bases = ['https://lingva.ml', 'https://translate.plausibility.cloud']
  for (const base of bases) {
    try {
      const url = `${base}/api/v1/auto/${tgt}/${encoded}`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(26_000),
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) continue
      const data = (await res.json()) as { translation?: string }
      const out = data.translation?.trim()
      if (out) return out
    } catch {
      /* next mirror */
    }
  }
  return null
}

/** MyMemory 免费接口作后备 */
async function translateMyMemory(text: string, target: TranslateTargetId): Promise<string | null> {
  const langpair =
    target === 'en' ? 'auto|en' : target === 'zh-Hans' ? 'auto|zh-CN' : 'auto|zh-TW'
  const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(28_000) })
    if (!res.ok) return null
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
    }
    const t = data.responseData?.translatedText?.trim()
    if (t && data.responseStatus === 200) return t
  } catch {
    /* noop */
  }
  return null
}

async function translateTextMain(text: string, target: TranslateTargetId): Promise<TranslateTextResult> {
  const raw = text.trim()
  if (!raw) return { ok: false, error: 'EMPTY' }

  let out = await translateLibre(raw, target)
  if (!out) out = await translateLingva(raw, target)
  if (!out) out = await translateMyMemory(raw, target)
  if (!out?.trim()) {
    return { ok: false, error: 'FAILED' }
  }
  return { ok: true, text: out.trim() }
}

export function setupIPC(mainWindow: BrowserWindow) {
  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window-maximize-toggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window-is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  const broadcastMaximizedState = () => {
    mainWindow.webContents.send('window-maximized-state', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', broadcastMaximizedState)
  mainWindow.on('unmaximize', broadcastMaximizedState)

  // Context menu handler
  ipcMain.on('show-context-menu', (event, id) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    createContextMenu(win, id)
  })

  // Chat handler
  ipcMain.on('start-chat', async (event, data: CreateChatProps) => {
    const { providerName, messages, messageId, selectedModel } = data
    try {
      const provider = createProvider(providerName)
      /** 每条请求附带真实本地时间：界面时间戳仅存本地库，不会被模型读到，否则只能靠训练截止日瞎猜。 */
      const withClock: ChatMessageProps[] = [buildSystemClockContext(), ...messages]
      const stream = await provider.chat(withClock, selectedModel)
      for await (const chunk of stream) {
        const content = {
          messageId,
          data: chunk
        }
        mainWindow.webContents.send('update-message', content)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorContent = {
        messageId,
        data: {
          is_end: true,
          result: error instanceof Error ? error.message : '与AI服务通信时发生错误',
          is_error: true
        }
      }
      mainWindow.webContents.send('update-message', errorContent)
    }
  })

  // Config handlers
  ipcMain.handle('get-config', () => {
    return configManager.get()
  })

  ipcMain.handle('baidu-asr-recognize', async (_event, payload: BaiduAsrRecognizePayload) => {
    return baiduAsrRecognize(payload)
  })

  ipcMain.handle('update-config', async (event, newConfig) => {
    const updatedConfig = await configManager.update(newConfig)
    // 如果语言发生变化，更新菜单
    if (newConfig.language) {
      updateMenu(mainWindow)
    }
    return updatedConfig
  })

  /** 将 userData 下的本地图片读成 data URL，供 CSS 背景与设置预览（避免 CSS 中 safe-file 被错误解析） */
  ipcMain.handle('read-local-image-as-data-url', async (_event, absPath: string) => {
    const normalized = path.resolve(absPath.trim())
    const userRoot = path.resolve(app.getPath('userData'))
    const prefix = userRoot.endsWith(path.sep) ? userRoot.toLowerCase() : userRoot.toLowerCase() + path.sep
    if (!normalized.toLowerCase().startsWith(prefix)) {
      throw new Error('PATH_NOT_ALLOWED')
    }
    const st = await fs.stat(normalized)
    if (!st.isFile()) throw new Error('NOT_FILE')
    if (st.size > 12 * 1024 * 1024) throw new Error('TOO_LARGE')
    const mimeType = mimeLookup(normalized) || 'application/octet-stream'
    if (!mimeType.startsWith('image/')) throw new Error('NOT_IMAGE')
    const buf = await fs.readFile(normalized)
    return `data:${mimeType};base64,${buf.toString('base64')}`
  })

  /** 设置页：聊天背景图（data URL → userData/backgrounds） */
  ipcMain.handle('save-chat-background', async (_event, dataUrl: string) => {
    const maxBytes = 12 * 1024 * 1024
    const { buffer, mime } = parseDataUrlToBuffer(dataUrl)
    if (!mime.startsWith('image/')) {
      throw new Error('NOT_IMAGE')
    }
    if (buffer.length > maxBytes) {
      throw new Error('TOO_LARGE')
    }
    const userDataPath = app.getPath('userData')
    const dir = path.join(userDataPath, 'backgrounds')
    await fs.mkdir(dir, { recursive: true })
    const ext = extFromMime(mime)
    const destPath = path.join(dir, `chat-bg-${Date.now()}.${ext}`)
    await fs.writeFile(destPath, buffer)
    return destPath
  })

  // File handling
  /** `source` 为本地绝对路径，或渲染进程 `FileReader` 得到的 `data:image/...;base64,...`（无可靠 `File.path` 时用后者）。 */
  ipcMain.handle('copy-image-to-user-dir', async (_event, source: string) => {
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')
    await fs.mkdir(imagesDir, { recursive: true })
    const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    if (source.startsWith('data:')) {
      const { buffer, mime } = parseDataUrlToBuffer(source)
      const ext = mime.startsWith('image/') ? extFromMime(mime) : 'png'
      const destPath = path.join(imagesDir, `img-${unique()}.${ext}`)
      await fs.writeFile(destPath, buffer)
      return destPath
    }

    const baseName = path.basename(source)
    const destPath = path.join(imagesDir, `img-${unique()}-${baseName}`)
    await fs.copyFile(source, destPath)
    return destPath
  })

  /** 在线翻译（LibreTranslate，失败时用 MyMemory），主进程请求无 CORS 限制 */
  ipcMain.handle(
    'translate-text',
    async (_event, payload: { text: string; target: TranslateTargetId }) => {
      return translateTextMain(payload.text, payload.target)
    },
  )

  /** 通用附件：data URL 写入 userData/attachments */
  ipcMain.handle(
    'save-user-attachment',
    async (_event, payload: { dataUrl: string; fileName: string }) => {
      const userDataPath = app.getPath('userData')
      const dir = path.join(userDataPath, 'attachments')
      await fs.mkdir(dir, { recursive: true })
      const { buffer, mime } = parseDataUrlToBuffer(payload.dataUrl)
      const safe = sanitizeBasename(payload.fileName)
      const hasExt = path.extname(safe).length > 0
      const suffix = hasExt ? '' : `.${extFromMime(mime)}`
      const destPath = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}${suffix}`)
      await fs.writeFile(destPath, buffer)
      return destPath
    },
  )
}
