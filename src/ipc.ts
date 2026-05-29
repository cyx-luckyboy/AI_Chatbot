import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { MAX_IMPORT_ATTACHMENT_BYTES } from './attachmentLimits'
import { CreateChatProps, type ChatMessageProps, type TranslateTextResult, type TranslateTargetId } from './types'
import { buildChatSystemContexts } from './chatSystemContext'
import { notifyLocationConfigChanged, runAutoLocationDetect } from './locationDetect'
import { fetchIpLocation, reverseGeocode } from './locationMain'
import { fetchWindowsGeolocationDetailed } from './locationWindows'
import { baiduAsrRecognize, type BaiduAsrRecognizePayload } from './baiduAsrMain'
import { createProvider } from './providers/createProvider'
import { configManager } from './config'
import { createContextMenu, updateMenu } from './menu'
import fs from 'fs/promises'
import path from 'path'
import { lookup as mimeLookup } from 'mime-types'
import { writePptxFromMarkdown } from './pptBuildFile'
import {
  runWebSearchChatPipeline,
  shouldAutoWebSearch,
  streamChatToWindow,
} from './webSearchFlow'
import { isValidLocationText } from './userLocation'
import { generateImageMain } from './imageGenerateMain'
import type {
  BuildPptxResult,
  GenerateImageResult,
  ImageGenSizeId,
  PptBuildProgressPayload,
  SavePptxAsResult,
} from './types'
import { hasJimengCredentials } from './jimengGenerateMain'

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
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    const lang = data.uiLang === 'en' ? 'en' : 'zh'
    try {
      const provider = createProvider(providerName)
      /** 每条请求附带真实本地时间：界面时间戳仅存本地库，不会被模型读到，否则只能靠训练截止日瞎猜。 */
      const withSystem = [...buildChatSystemContexts(), ...messages]
      const useWebPipeline = Boolean(data.webSearch) || shouldAutoWebSearch(withSystem)
      if (useWebPipeline) {
        await runWebSearchChatPipeline(
          win,
          provider,
          { ...data, messages: withSystem, webSearch: Boolean(data.webSearch) },
          lang,
        )
      } else {
        await streamChatToWindow(win, provider, withSystem, selectedModel, messageId)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorContent = {
        messageId,
        data: {
          is_end: true,
          result: error instanceof Error ? error.message : '与AI服务通信时发生错误',
          is_error: true,
          replace: true,
        },
      }
      win.webContents.send('update-message', errorContent)
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

  /** 大文件：从磁盘路径复制到 userData/attachments，避免渲染进程 base64 占满内存 */
  ipcMain.handle(
    'import-user-attachment',
    async (_event, payload: { sourcePath: string; fileName: string }) => {
      let st: Awaited<ReturnType<typeof fs.stat>>
      try {
        st = await fs.stat(payload.sourcePath)
      } catch {
        throw new Error('file_not_found')
      }
      if (!st.isFile()) throw new Error('not_a_file')
      if (st.size > MAX_IMPORT_ATTACHMENT_BYTES) throw new Error('too_large')

      const userDataPath = app.getPath('userData')
      const dir = path.join(userDataPath, 'attachments')
      await fs.mkdir(dir, { recursive: true })
      const safe = sanitizeBasename(payload.fileName)
      const destPath = path.join(
        dir,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      )
      await fs.copyFile(payload.sourcePath, destPath)
      return destPath
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

  /** 将模型 Markdown 转为 .pptx，写入 userData/exports */
  ipcMain.handle(
    'build-pptx-from-markdown',
    async (
      event,
      payload: {
        markdown: string
        suggestedName?: string
        answerId?: number
        quality?: import('./types').PptGenQualityId
      },
    ): Promise<BuildPptxResult> => {
      try {
        const dir = path.join(app.getPath('userData'), 'exports')
        const quality = payload.quality ?? 'fast'
        const premium = quality === 'premium' && hasJimengCredentials()
        const sendProgress = (current: number, total: number) => {
          const data: PptBuildProgressPayload = {
            answerId: payload.answerId,
            current,
            total,
          }
          event.sender.send('ppt-build-progress', data)
        }
        if (premium) sendProgress(0, 1)

        const result = await writePptxFromMarkdown(
          payload.markdown,
          dir,
          payload.suggestedName,
          {
            quality,
            onBackgroundProgress: premium ? sendProgress : undefined,
          },
        )

        let warning: string | undefined
        if (premium && result.backgroundCount === 0 && result.slideCount > 0) {
          warning =
            '精美模式未能生成 AI 背景图，请检查即梦 AK/SK；已使用主题配色导出可编辑 PPT。'
        } else if (result.backgroundFailed > 0) {
          warning = `部分 AI 背景生成失败（${result.backgroundFailed} 张），已用主题色替代。`
        } else if (quality === 'premium' && !hasJimengCredentials()) {
          warning = '未配置即梦 AK/SK，已按快速模式（无 AI 背景）导出。'
        }

        return {
          ok: true,
          path: result.path,
          slideCount: result.slideCount,
          backgroundCount: result.backgroundCount,
          backgroundFailed: result.backgroundFailed,
          ...(warning ? { warning } : {}),
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[build-pptx-from-markdown]', e)
        return { ok: false, error: msg }
      }
    },
  )

  ipcMain.handle(
    'save-pptx-export-as',
    async (_event, payload: { sourcePath: string }): Promise<SavePptxAsResult> => {
      try {
        const win = BrowserWindow.getFocusedWindow()
        const base = path.basename(payload.sourcePath)
        const r = await dialog.showSaveDialog(win ?? undefined, {
          title: '保存 PowerPoint',
          defaultPath: base,
          filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
        })
        if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
        await fs.copyFile(payload.sourcePath, r.filePath)
        return { ok: true, path: r.filePath }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )

  ipcMain.handle('show-pptx-in-folder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('auto-detect-location', async () => {
    const updated = await runAutoLocationDetect()
    return { updated, config: configManager.get() }
  })

  ipcMain.handle(
    'detect-user-location',
    async (
      _event,
      payload?: { mode?: 'ip' | 'gps'; latitude?: number; longitude?: number },
    ) => {
      const mode = payload?.mode ?? 'ip'
      const now = new Date().toISOString()
      let detected: {
        city: string
        region: string
        country: string
        latitude?: number
        longitude?: number
        source: 'ip' | 'gps'
      } | null = null

      if (mode === 'gps') {
        let lat = payload?.latitude
        let lng = payload?.longitude
        if (lat == null || lng == null) {
          const win = await fetchWindowsGeolocationDetailed()
          if (win.ok) {
            lat = win.lat
            lng = win.lng
          } else if (win.code === 'disabled' || win.code === 'denied') {
            return {
              ok: false as const,
              error:
                'Windows 未允许本应用使用位置。请打开：设置 → 隐私和安全性 → 位置 → 开启定位，并开启「允许桌面应用访问位置」；若弹出权限对话框请选择允许。也可手动填写城市。',
            }
          } else if (win.code === 'timeout') {
            return {
              ok: false as const,
              error: '本机定位超时。请连接 Wi‑Fi、开启 Windows 位置服务后重试，或手动填写城市。',
            }
          } else if (process.platform === 'win32') {
            return {
              ok: false as const,
              error:
                '本机定位失败（未获取到坐标）。请确认 Windows 位置服务已开启；控制台中的 Google 403 来自浏览器备用方案，与本机定位无关。建议直接手动填写城市。',
            }
          }
        }
        if (lat != null && lng != null) {
          detected =
            (await reverseGeocode(lat, lng)) ?? {
              city: '',
              region: '',
              country: '',
              latitude: lat,
              longitude: lng,
              source: 'gps',
            }
        } else if (process.platform !== 'win32') {
          return {
            ok: false as const,
            error: 'BROWSER_GPS_FALLBACK',
          }
        } else {
          return {
            ok: false as const,
            error: '本机定位失败，请手动填写城市。',
          }
        }
      } else {
        detected = await fetchIpLocation()
      }

      if (!detected || (!detected.city.trim() && !detected.region.trim())) {
        return {
          ok: false as const,
          error:
            '无法从网络获取城市（可能被防火墙拦截）。请检查能否访问外网，或直接在上方手动填写城市后保存。',
        }
      }

      if (!isValidLocationText(detected.city) || !isValidLocationText(detected.region)) {
        return {
          ok: false as const,
          error: '定位结果编码异常，请重试「IP 自动定位」或手动填写城市（如：杭州）。',
        }
      }

      const patch = {
        locationEnabled: true,
        locationCity: detected.city,
        locationRegion: detected.region,
        locationCountry: detected.country,
        locationLatitude: detected.latitude,
        locationLongitude: detected.longitude,
        locationSource: detected.source,
        locationUpdatedAt: now,
      }
      await configManager.update(patch)
      notifyLocationConfigChanged()
      return { ok: true as const, ...patch }
    },
  )

  ipcMain.handle('open-external-url', async (_event, rawUrl: string) => {
    const u = String(rawUrl ?? '').trim()
    if (!u) return
    let parsed: URL
    try {
      parsed = new URL(u)
    } catch {
      throw new Error('invalid url')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    await shell.openExternal(parsed.href)
  })

  ipcMain.handle(
    'generate-image',
    async (
      _event,
      payload: { prompt: string; size: ImageGenSizeId; model?: import('./jimengModels').JimengImageModelId },
    ): Promise<GenerateImageResult> => {
      return generateImageMain(payload.prompt, payload.size, payload.model)
    },
  )

  ipcMain.handle(
    'save-generated-image-as',
    async (_event, payload: { sourcePath: string }): Promise<SavePptxAsResult> => {
      try {
        const win = BrowserWindow.getFocusedWindow()
        const base = path.basename(payload.sourcePath)
        const r = await dialog.showSaveDialog(win ?? undefined, {
          title: '保存图片',
          defaultPath: base.endsWith('.png') ? base : `${base}.png`,
          filters: [{ name: 'PNG 图片', extensions: ['png'] }],
        })
        if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
        await fs.copyFile(payload.sourcePath, r.filePath)
        return { ok: true, path: r.filePath }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
}
