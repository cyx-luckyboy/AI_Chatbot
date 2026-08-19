import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { MAX_IMPORT_ATTACHMENT_BYTES } from '../domains/chat/attachmentLimits'
import { CreateChatProps, type ChatMessageProps, type TranslateTextResult, type TranslateTargetId } from '../shared/types'
import { buildChatSystemContexts } from '../domains/chat/chatSystemContext'
import { notifyLocationConfigChanged, runAutoLocationDetect } from '../domains/location/locationDetect'
import { fetchIpLocation, reverseGeocode } from '../domains/location/locationMain'
import { fetchWindowsGeolocationDetailed } from '../domains/location/locationWindows'
import { baiduAsrRecognize, type BaiduAsrRecognizePayload } from '../domains/speech/baiduAsrMain'
import { createProvider } from '../providers/createProvider'
import { configManager } from '../shared/config'
import { createContextMenu, updateMenu } from '../main/menu'
import fs from 'fs/promises'
import path from 'path'
import { lookup as mimeLookup } from 'mime-types'
import { writePptxFromMarkdown } from '../domains/media/ppt/pptBuildFile'
import {
  runWebSearchChatPipeline,
  shouldAutoWebSearch,
  streamChatToWindow,
} from '../domains/chat/webSearchFlow'
import { runAgentChatPipeline } from '../domains/workspace/agentChatFlow'
import { abortChatSession, beginChatSession, endChatSession } from '../domains/chat/chatAbort'
import {
  getAgentWorkspacePath,
  workspaceListDir,
  workspaceReadFile,
  workspaceWriteFile,
  workspaceFindDefinitions,
} from '../domains/workspace/agentToolRuntime'
import { isValidLocationText } from '../domains/location/userLocation'
import { generateImageMain } from '../domains/media/imageGenerateMain'
import type {
  BuildPptxResult,
  GenerateImageResult,
  ImageGenSizeId,
  PptBuildProgressPayload,
  SavePptxAsResult,
} from '../shared/types'
import { notifyPetChatStarted, notifyPetFromChatChunk, notifyPetForceIdle } from '../domains/pet/petChatBridge'
import {
  destroyPetWindow,
  getPetWindow,
  movePetWindowByDelta,
  syncPetWindowWithConfig,
} from '../domains/pet/petWindowMain'
import { speakPetText, stopNativeSpeak } from '../domains/pet/petSpeakMain'
import { clearPetTtsLogs, getPetTtsLogs, appendPetTtsLog } from '../domains/pet/petTtsLog'
import {
  clearServiceLogs,
  getServiceLogs,
  getServicesStatus,
  startService,
  type ServiceId,
} from '../domains/services/serviceMain'
import { hasJimengCredentials } from '../domains/media/jimengGenerateMain'
import {
  abortMeetingAsrSession,
  sendMeetingAsrAudio,
  startMeetingAsrSession,
  stopMeetingAsrSession,
} from '../domains/meeting/meetingSessionMain'
import { deleteMeetingAudio, resolveMeetingAudioPath, toSafeFileUrl } from '../domains/meeting/meetingAudioMain'
import { summarizeMeeting } from '../domains/meeting/meetingSummarizeMain'
import { meetingTranslateMain } from '../domains/meeting/meetingTranslateMain'
import {
  createTerminalSession,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  interruptTerminal,
} from '../domains/workspace/terminalMain'
import { suggestConversationTitleMain } from '../domains/chat/conversationTitleMain'
import type { SuggestConversationTitlePayload } from '../shared/types'
import { translateTextMain } from '../domains/media/translateMain'
import type {
  MeetingAsrStartPayload,
  MeetingAsrStopPayload,
  MeetingSummarizePayload,
  MeetingTranslatePayload,
} from '../shared/types'

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
    beginChatSession(messageId)
    notifyPetChatStarted(messageId)
    try {
      const provider = createProvider(providerName)
      /** 每条请求附带真实本地时间：界面时间戳仅存本地库，不会被模型读到，否则只能靠训练截止日瞎猜。 */
      const withSystem = [...buildChatSystemContexts(), ...messages]
      if (data.agentMode) {
        await runAgentChatPipeline(
          win,
          provider,
          { ...data, messages: withSystem },
          lang,
        )
      } else {
        const useWebPipeline = Boolean(data.webSearch) || shouldAutoWebSearch(withSystem)
        if (useWebPipeline) {
          await runWebSearchChatPipeline(
            win,
            provider,
            { ...data, messages: withSystem, webSearch: Boolean(data.webSearch) },
            lang,
          )
        } else {
          const ok = await streamChatToWindow(
            win,
            provider,
            withSystem,
            selectedModel,
            messageId,
            undefined,
            lang,
          )
          if (!ok) {
            /* streamChatToWindow 已发送结束/错误帧并通知桌宠 */
          }
        }
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
      notifyPetFromChatChunk(messageId, errorContent.data)
    } finally {
      endChatSession(messageId)
    }
  })

  ipcMain.handle('abort-chat', (_event, payload?: { messageId?: number }) => {
    const id = payload?.messageId
    const result = abortChatSession(typeof id === 'number' ? id : undefined)
    return result
  })

  ipcMain.on('pet-drag-by', (_event, payload: { dx?: number; dy?: number }) => {
    const dx = Number(payload?.dx) || 0
    const dy = Number(payload?.dy) || 0
    if (dx === 0 && dy === 0) return
    movePetWindowByDelta(dx, dy)
  })

  ipcMain.handle('pet-close', async () => {
    destroyPetWindow()
    await configManager.update({ desktopPetEnabled: false })
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('vchat-config-changed')
    }
    return { ok: true }
  })

  ipcMain.handle('pet-speak-text', async (_event, payload: { text?: string; rate?: number }) => {
    return speakPetText(String(payload?.text ?? ''), { rate: payload?.rate })
  })

  ipcMain.handle('pet-tts-logs', () => {
    return { logs: getPetTtsLogs() }
  })

  ipcMain.handle('pet-tts-logs-clear', () => {
    clearPetTtsLogs()
    return { ok: true }
  })

  ipcMain.handle('pet-tts-ping', async () => {
    const cfg = configManager.get()
    const base = String(cfg.nailongTtsBaseUrl || 'http://127.0.0.1:9880').replace(/\/$/, '')
    const t0 = Date.now()
    try {
      const u = new URL(base)
      const lib = u.protocol === 'https:' ? (await import('https')).default : (await import('http')).default
      const ok = await new Promise<boolean>((resolve) => {
        const req = lib.request(
          {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: '/tts',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
            timeout: 2500,
          },
          (res) => {
            res.resume()
            // 400 = 服务活着但参数不全；连接失败才算挂
            resolve((res.statusCode || 0) > 0)
          },
        )
        req.on('error', () => resolve(false))
        req.on('timeout', () => {
          req.destroy()
          resolve(false)
        })
        req.write('{}')
        req.end()
      })
      const latencyMs = Date.now() - t0
      appendPetTtsLog({
        level: ok ? 'ok' : 'error',
        stage: 'ping',
        message: ok ? `服务可达` : '服务不可达',
        ms: latencyMs,
        detail: { baseUrl: base },
      })
      return { ok, baseUrl: base, latencyMs }
    } catch (e) {
      const latencyMs = Date.now() - t0
      const error = e instanceof Error ? e.message : String(e)
      appendPetTtsLog({
        level: 'error',
        stage: 'ping',
        message: error,
        ms: latencyMs,
        detail: { baseUrl: base },
      })
      return { ok: false, baseUrl: base, error, latencyMs }
    }
  })

  ipcMain.handle('services-get-status', async () => getServicesStatus())

  ipcMain.handle('services-start', async (_event, payload: { id?: ServiceId }) => {
    const id = payload?.id
    if (id !== 'tts' && id !== 'voice-bot') {
      return { ok: false, error: 'invalid service id' }
    }
    return startService(id)
  })

  ipcMain.handle('services-get-logs', (_event, payload: { id?: ServiceId }) => {
    const id = payload?.id
    if (id !== 'tts' && id !== 'voice-bot') {
      return { logs: [] }
    }
    return { logs: getServiceLogs(id) }
  })

  ipcMain.handle('services-clear-logs', (_event, payload: { id?: ServiceId }) => {
    const id = payload?.id
    if (id === 'tts' || id === 'voice-bot') clearServiceLogs(id)
    return { ok: true }
  })

  ipcMain.handle('pet-speak-stop', () => {
    stopNativeSpeak()
    return { ok: true }
  })

  ipcMain.handle('pet-force-idle', (_event, payload?: { messageId?: number }) => {
    const mid = payload?.messageId
    notifyPetForceIdle(typeof mid === 'number' ? mid : undefined)
    stopNativeSpeak()
    return { ok: true }
  })

  /** 桌宠 → 主窗：发起对话 / 搜索 */
  ipcMain.on('pet-chat-ask', (_event, payload: { text?: string; forceSearch?: boolean; requestId?: string }) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    if (!win) {
      const pet = getPetWindow()
      pet?.webContents.send('pet-chat-ask-result', {
        ok: false,
        error: 'no_main_window',
        requestId: payload?.requestId,
      })
      return
    }
    win.webContents.send('pet-chat-ask', {
      text: String(payload?.text ?? ''),
      forceSearch: Boolean(payload?.forceSearch),
      requestId: payload?.requestId,
    })
  })

  ipcMain.on(
    'pet-chat-ask-result',
    (_event, result: { ok: boolean; error?: string; conversationId?: number; webSearch?: boolean; requestId?: string }) => {
      const pet = getPetWindow()
      if (!pet || pet.isDestroyed()) return
      pet.webContents.send('pet-chat-ask-result', result)
    },
  )

  // Config handlers
  ipcMain.handle('get-config', () => {
    return configManager.get()
  })

  ipcMain.handle('pick-agent-workspace', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    const current = (configManager.get().agentWorkspacePath || '').trim()
    const result = await dialog.showOpenDialog(win, {
      title: '选择 Agent 工作区',
      properties: ['openDirectory', 'createDirectory'],
      ...(current ? { defaultPath: current } : {}),
    })
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false as const, cancelled: true as const }
    }
    const agentWorkspacePath = result.filePaths[0]
    await configManager.update({ agentWorkspacePath })
    win.webContents.send('vchat-config-changed')
    return { ok: true as const, path: agentWorkspacePath }
  })

  ipcMain.handle('workspace-get-root', () => {
    return { path: getAgentWorkspacePath() }
  })

  ipcMain.handle('workspace-list', async (_event, payload?: { path?: string }) => {
    try {
      if (!getAgentWorkspacePath()) {
        return { ok: false as const, error: 'no_workspace' }
      }
      const entries = await workspaceListDir(payload?.path || '.')
      return { ok: true as const, entries }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })

  ipcMain.handle('workspace-read', async (_event, payload: { path: string }) => {
    try {
      if (!getAgentWorkspacePath()) {
        return { ok: false as const, error: 'no_workspace' }
      }
      const file = await workspaceReadFile(payload?.path || '')
      return { ok: true as const, ...file }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })

  ipcMain.handle(
    'workspace-write',
    async (_event, payload: { path: string; content: string }) => {
      try {
        if (!getAgentWorkspacePath()) {
          return { ok: false as const, error: 'no_workspace' }
        }
        const r = await workspaceWriteFile(payload?.path || '', payload?.content ?? '')
        return { ok: true as const, ...r }
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    },
  )

  ipcMain.handle(
    'workspace-find-definition',
    async (_event, payload: { symbol: string; fromPath?: string }) => {
      try {
        if (!getAgentWorkspacePath()) {
          return { ok: false as const, error: 'no_workspace' }
        }
        const hits = await workspaceFindDefinitions(payload?.symbol || '', payload?.fromPath)
        return { ok: true as const, hits }
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    },
  )

  ipcMain.handle(
    'terminal-create',
    async (_event, payload?: { cols?: number; rows?: number; cwd?: string }) => {
      return createTerminalSession(payload)
    },
  )
  ipcMain.handle('terminal-write', (_event, payload: { id: string; data: string }) => {
    return writeTerminal(payload?.id || '', payload?.data ?? '')
  })
  ipcMain.handle('terminal-interrupt', (_event, payload: { id: string }) => {
    return interruptTerminal(payload?.id || '')
  })
  ipcMain.handle(
    'terminal-resize',
    (_event, payload: { id: string; cols: number; rows: number }) => {
      return resizeTerminal(payload?.id || '', payload?.cols || 80, payload?.rows || 24)
    },
  )
  ipcMain.handle('terminal-kill', (_event, payload: { id: string }) => {
    return killTerminal(payload?.id || '')
  })

  ipcMain.handle('baidu-asr-recognize', async (_event, payload: BaiduAsrRecognizePayload) => {
    return baiduAsrRecognize(payload)
  })

  ipcMain.handle('meeting-asr-start', async (event, payload: MeetingAsrStartPayload) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    return startMeetingAsrSession(win, payload.meetingId, payload.devPid)
  })

  ipcMain.on('meeting-asr-audio', (_event, payload: { meetingId: number; pcm: ArrayBuffer }) => {
    if (!payload?.meetingId || !payload.pcm) return
    const buf = Buffer.from(payload.pcm)
    if (buf.length > 512 * 1024) return
    sendMeetingAsrAudio(payload.meetingId, buf)
  })

  ipcMain.handle('meeting-asr-stop', async (_event, payload: MeetingAsrStopPayload) => {
    return stopMeetingAsrSession(payload.meetingId)
  })

  ipcMain.handle('meeting-asr-abort', async (_event, payload: { meetingId: number }) => {
    abortMeetingAsrSession(payload.meetingId)
    return { ok: true }
  })

  ipcMain.handle('meeting-delete-audio', async (_event, payload: { audioFileName: string }) => {
    try {
      await deleteMeetingAudio(payload.audioFileName)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('meeting-get-audio-url', async (_event, payload: { audioFileName: string }) => {
    try {
      const abs = resolveMeetingAudioPath(payload.audioFileName)
      await fs.stat(abs)
      return { ok: true as const, url: toSafeFileUrl(abs) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('meeting-read-audio', async (_event, payload: { audioFileName: string }) => {
    try {
      const abs = resolveMeetingAudioPath(payload.audioFileName)
      const st = await fs.stat(abs)
      if (!st.isFile()) throw new Error('NOT_FILE')
      if (st.size > 100 * 1024 * 1024) throw new Error('TOO_LARGE')
      const buf = await fs.readFile(abs)
      return {
        ok: true as const,
        mime: 'audio/wav',
        data: Uint8Array.from(buf),
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(
    'meeting-save-audio-as',
    async (_event, payload: { audioFileName: string; suggestedName?: string }): Promise<SavePptxAsResult> => {
      try {
        const abs = resolveMeetingAudioPath(payload.audioFileName)
        await fs.stat(abs)
        const win = BrowserWindow.getFocusedWindow()
        const safe = (payload.suggestedName ?? payload.audioFileName).replace(/[<>:"/\\|?*]/g, '_')
        const r = await dialog.showSaveDialog(win ?? undefined, {
          title: '保存会议录音',
          defaultPath: safe.endsWith('.wav') ? safe : `${safe}.wav`,
          filters: [{ name: 'WAV 音频', extensions: ['wav'] }],
        })
        if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
        await fs.copyFile(abs, r.filePath)
        return { ok: true, path: r.filePath }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )

  ipcMain.handle('check-provider-configured', (_event, payload: { providerName: string }) => {
    try {
      createProvider(payload.providerName)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('meeting-summarize', async (event, payload: MeetingSummarizePayload) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    try {
      await summarizeMeeting(win, payload)
      return { ok: true as const }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      win.webContents.send('meeting-summary-error', { meetingId: payload.meetingId, error })
      return { ok: false as const, error }
    }
  })

  ipcMain.handle('update-config', async (event, newConfig) => {
    const prev = configManager.get()
    const updatedConfig = await configManager.update(newConfig)
    // 如果语言发生变化，更新菜单
    if (newConfig.language) {
      updateMenu(mainWindow)
    }
    if (typeof newConfig.desktopPetEnabled === 'boolean' && newConfig.desktopPetEnabled !== prev.desktopPetEnabled) {
      syncPetWindowWithConfig(Boolean(updatedConfig.desktopPetEnabled))
    }
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('vchat-config-changed')
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

  /** 会议记录翻译：优先用所选 LLM，失败时回退免费在线 API */
  ipcMain.handle('meeting-translate', async (_event, payload: MeetingTranslatePayload) => {
    return meetingTranslateMain(payload)
  })

  /** 根据对话片段让模型生成短标题（工作台 Agent 历史命名等） */
  ipcMain.handle('suggest-conversation-title', async (_event, payload: SuggestConversationTitlePayload) => {
    return suggestConversationTitleMain(payload)
  })

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
        quality?: import('../shared/types').PptGenQualityId
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
      payload: { prompt: string; size: ImageGenSizeId; model?: import('../domains/media/jimengModels').JimengImageModelId },
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
