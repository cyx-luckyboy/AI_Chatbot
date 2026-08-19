// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { ipcRenderer, contextBridge, webUtils } from 'electron'
import type {
  CreateChatProps,
  OnUpdatedCallback,
  AppConfig,
  UpdatgedStreamData,
  TranslateTextResult,
  TranslateTargetId,
  BuildPptxResult,
  GenerateImageResult,
  ImageGenSizeId,
  PptBuildProgressPayload,
  SavePptxAsResult,
  MeetingAsrStartPayload,
  MeetingAsrStartResult,
  MeetingAsrStopPayload,
  MeetingAsrStopResult,
  MeetingAsrResultPayload,
  MeetingSummarizePayload,
  MeetingTranslatePayload,
  MeetingSummaryDonePayload,
  PetAvatarEvent,
  SuggestConversationTitlePayload,
  SuggestConversationTitleResult,
} from '../shared/types'
import type { BaiduAsrRecognizePayload, BaiduAsrRecognizeResult } from '../domains/speech/baiduAsrMain'
// import { contextBridge, ipcRenderer } from 'electron';

/** IPC 结构化克隆不接受 Vue/Pinia 的 Proxy；JSON 往返可去掉 Proxy，并丢掉函数等不可序列化字段 */
function cloneForIpc<T>(data: T): T {
  try {
    return JSON.parse(
      JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    ) as T
  } catch (e) {
    console.error('[preload] cloneForIpc failed', e)
    throw e
  }
}

contextBridge.exposeInMainWorld('electronEnv', {
  platform: process.platform,
})

contextBridge.exposeInMainWorld('electronAPI', {
  startChat: (data: CreateChatProps) => ipcRenderer.send('start-chat', cloneForIpc(data)),
  abortChat: (payload?: { messageId?: number }) =>
    ipcRenderer.invoke('abort-chat', cloneForIpc(payload ?? {})) as Promise<{
      ok: boolean
      messageId: number | null
    }>,
  onUpdateMessage: (callback: OnUpdatedCallback) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as UpdatgedStreamData)
    ipcRenderer.on('update-message', handler)
    return () => ipcRenderer.removeListener('update-message', handler)
  },
  showContextMenu: (id: number) => ipcRenderer.send('show-context-menu', id),
  onDeleteConversation: (callback: (id: number) => void) => ipcRenderer.on('delete-conversation', (_event, id) => callback(id)),
  copyImageToUserDir: (sourcePath: string) => ipcRenderer.invoke('copy-image-to-user-dir', sourcePath),
  saveUserAttachment: (dataUrl: string, fileName: string) =>
    ipcRenderer.invoke('save-user-attachment', { dataUrl, fileName }),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  importUserAttachment: (sourcePath: string, fileName: string) =>
    ipcRenderer.invoke('import-user-attachment', { sourcePath, fileName }) as Promise<string>,
  saveChatBackground: (dataUrl: string) =>
    ipcRenderer.invoke('save-chat-background', dataUrl) as Promise<string>,
  readLocalImageAsDataUrl: (absPath: string) =>
    ipcRenderer.invoke('read-local-image-as-data-url', absPath) as Promise<string>,
  getConfig: () => ipcRenderer.invoke('get-config'),
  pickAgentWorkspace: () =>
    ipcRenderer.invoke('pick-agent-workspace') as Promise<
      { ok: true; path: string } | { ok: false; cancelled?: boolean; error?: string }
    >,
  workspaceGetRoot: () =>
    ipcRenderer.invoke('workspace-get-root') as Promise<{ path: string }>,
  workspaceList: (payload?: { path?: string }) =>
    ipcRenderer.invoke('workspace-list', cloneForIpc(payload ?? {})) as Promise<
      | { ok: true; entries: { name: string; path: string; kind: 'file' | 'dir' }[] }
      | { ok: false; error: string }
    >,
  workspaceRead: (payload: { path: string }) =>
    ipcRenderer.invoke('workspace-read', cloneForIpc(payload)) as Promise<
      { ok: true; path: string; content: string } | { ok: false; error: string }
    >,
  workspaceWrite: (payload: { path: string; content: string }) =>
    ipcRenderer.invoke('workspace-write', cloneForIpc(payload)) as Promise<
      { ok: true; path: string; bytes: number } | { ok: false; error: string }
    >,
  workspaceFindDefinition: (payload: { symbol: string; fromPath?: string }) =>
    ipcRenderer.invoke('workspace-find-definition', cloneForIpc(payload)) as Promise<
      | { ok: true; hits: { path: string; line: number; column: number }[] }
      | { ok: false; error: string }
    >,
  terminalCreate: (payload?: { cols?: number; rows?: number; cwd?: string }) =>
    ipcRenderer.invoke('terminal-create', cloneForIpc(payload ?? {})) as Promise<
      { ok: true; id: string } | { ok: false; error: string }
    >,
  terminalWrite: (payload: { id: string; data: string }) =>
    ipcRenderer.invoke('terminal-write', cloneForIpc(payload)) as Promise<{ ok: boolean; error?: string }>,
  terminalInterrupt: (payload: { id: string }) =>
    ipcRenderer.invoke('terminal-interrupt', cloneForIpc(payload)) as Promise<{ ok: boolean }>,
  terminalResize: (payload: { id: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('terminal-resize', cloneForIpc(payload)) as Promise<{ ok: boolean; error?: string }>,
  terminalKill: (payload: { id: string }) =>
    ipcRenderer.invoke('terminal-kill', cloneForIpc(payload)) as Promise<{ ok: boolean }>,
  onTerminalData: (callback: (payload: { id: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { id: string; data: string })
    ipcRenderer.on('terminal-data', handler)
    return () => ipcRenderer.removeListener('terminal-data', handler)
  },
  onTerminalReady: (callback: (payload: { id: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { id: string })
    ipcRenderer.on('terminal-ready', handler)
    return () => ipcRenderer.removeListener('terminal-ready', handler)
  },
  onTerminalExit: (callback: (payload: { id: string; exitCode: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { id: string; exitCode: number })
    ipcRenderer.on('terminal-exit', handler)
    return () => ipcRenderer.removeListener('terminal-exit', handler)
  },
  onMenuToggleTerminal: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu-toggle-terminal', handler)
    return () => ipcRenderer.removeListener('menu-toggle-terminal', handler)
  },
  onMenuToggleSidebar: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu-toggle-sidebar', handler)
    return () => ipcRenderer.removeListener('menu-toggle-sidebar', handler)
  },
  autoDetectLocation: () =>
    ipcRenderer.invoke('auto-detect-location') as Promise<{ updated: boolean; config: AppConfig }>,
  onConfigChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('vchat-config-changed', handler)
    return () => ipcRenderer.removeListener('vchat-config-changed', handler)
  },
  updateConfig: (config: Partial<AppConfig>) =>
    ipcRenderer.invoke('update-config', cloneForIpc(config)),
  baiduAsrRecognize: (payload: BaiduAsrRecognizePayload) =>
    ipcRenderer.invoke('baidu-asr-recognize', cloneForIpc(payload)) as Promise<BaiduAsrRecognizeResult>,
  meetingAsrStart: (payload: MeetingAsrStartPayload) =>
    ipcRenderer.invoke('meeting-asr-start', cloneForIpc(payload)) as Promise<MeetingAsrStartResult>,
  meetingAsrStop: (payload: MeetingAsrStopPayload) =>
    ipcRenderer.invoke('meeting-asr-stop', cloneForIpc(payload)) as Promise<MeetingAsrStopResult>,
  meetingAsrAbort: (payload: { meetingId: number }) =>
    ipcRenderer.invoke('meeting-asr-abort', cloneForIpc(payload)) as Promise<{ ok: boolean }>,
  meetingAsrSendAudio: (payload: { meetingId: number; pcm: ArrayBuffer }) => {
    ipcRenderer.send('meeting-asr-audio', { meetingId: payload.meetingId, pcm: payload.pcm })
  },
  onMeetingAsrResult: (callback: (payload: MeetingAsrResultPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as MeetingAsrResultPayload)
    ipcRenderer.on('meeting-asr-result', handler)
    return () => ipcRenderer.removeListener('meeting-asr-result', handler)
  },
  onMeetingAsrError: (callback: (payload: { meetingId: number; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { meetingId: number; error: string })
    ipcRenderer.on('meeting-asr-error', handler)
    return () => ipcRenderer.removeListener('meeting-asr-error', handler)
  },
  meetingSummarize: (payload: MeetingSummarizePayload) =>
    ipcRenderer.invoke('meeting-summarize', cloneForIpc(payload)) as Promise<{ ok: boolean; error?: string }>,
  meetingTranslate: (payload: MeetingTranslatePayload) =>
    ipcRenderer.invoke('meeting-translate', cloneForIpc(payload)) as Promise<TranslateTextResult>,
  suggestConversationTitle: (payload: SuggestConversationTitlePayload) =>
    ipcRenderer.invoke('suggest-conversation-title', cloneForIpc(payload)) as Promise<SuggestConversationTitleResult>,
  onMeetingSummaryChunk: (callback: (payload: { meetingId: number; partial: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { meetingId: number; partial: string })
    ipcRenderer.on('meeting-summary-chunk', handler)
    return () => ipcRenderer.removeListener('meeting-summary-chunk', handler)
  },
  onMeetingSummaryDone: (callback: (payload: MeetingSummaryDonePayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as MeetingSummaryDonePayload)
    ipcRenderer.on('meeting-summary-done', handler)
    return () => ipcRenderer.removeListener('meeting-summary-done', handler)
  },
  onMeetingSummaryError: (callback: (payload: { meetingId: number; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { meetingId: number; error: string })
    ipcRenderer.on('meeting-summary-error', handler)
    return () => ipcRenderer.removeListener('meeting-summary-error', handler)
  },
  meetingDeleteAudio: (payload: { audioFileName: string }) =>
    ipcRenderer.invoke('meeting-delete-audio', cloneForIpc(payload)) as Promise<{ ok: boolean; error?: string }>,
  meetingGetAudioUrl: (payload: { audioFileName: string }) =>
    ipcRenderer.invoke('meeting-get-audio-url', cloneForIpc(payload)) as Promise<
      { ok: true; url: string } | { ok: false; error: string }
    >,
  meetingReadAudio: (payload: { audioFileName: string }) =>
    ipcRenderer.invoke('meeting-read-audio', cloneForIpc(payload)) as Promise<
      | { ok: true; mime: string; data: Uint8Array }
      | { ok: false; error: string }
    >,
  meetingSaveAudioAs: (payload: { audioFileName: string; suggestedName?: string }) =>
    ipcRenderer.invoke('meeting-save-audio-as', cloneForIpc(payload)) as Promise<SavePptxAsResult>,
  checkProviderConfigured: (payload: { providerName: string }) =>
    ipcRenderer.invoke('check-provider-configured', cloneForIpc(payload)) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  onMenuNewConversation: (callback: () => void) => ipcRenderer.on('menu-new-conversation', () => callback()),
  onMenuOpenSettings: (callback: () => void) => ipcRenderer.on('menu-open-settings', () => callback()),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window-maximize-toggle'),
  windowClose: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,
  onWindowMaximizedState: (callback: (maximized: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, v: unknown) => callback(Boolean(v))
    ipcRenderer.on('window-maximized-state', handler)
    return () => ipcRenderer.removeListener('window-maximized-state', handler)
  },
  translateText: (payload: { text: string; target: TranslateTargetId }) =>
    ipcRenderer.invoke('translate-text', cloneForIpc(payload)) as Promise<TranslateTextResult>,
  buildPptxFromMarkdown: (payload: {
    markdown: string
    suggestedName?: string
    answerId?: number
    quality?: import('../shared/types').PptGenQualityId
  }) => ipcRenderer.invoke('build-pptx-from-markdown', cloneForIpc(payload)) as Promise<BuildPptxResult>,
  onPptBuildProgress: (callback: (payload: PptBuildProgressPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as PptBuildProgressPayload)
    ipcRenderer.on('ppt-build-progress', handler)
    return () => ipcRenderer.removeListener('ppt-build-progress', handler)
  },
  savePptxExportAs: (sourcePath: string) =>
    ipcRenderer.invoke('save-pptx-export-as', { sourcePath }) as Promise<SavePptxAsResult>,
  showPptxInFolder: (filePath: string) => ipcRenderer.invoke('show-pptx-in-folder', filePath),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url) as Promise<void>,
  detectUserLocation: (payload?: { mode?: 'ip' | 'gps'; latitude?: number; longitude?: number }) =>
    ipcRenderer.invoke('detect-user-location', payload ?? { mode: 'ip' }) as Promise<
      | {
          ok: true
          locationCity: string
          locationRegion: string
          locationCountry: string
          locationLatitude?: number
          locationLongitude?: number
          locationSource: string
          locationUpdatedAt: string
        }
      | { ok: false; error: string }
    >,
  generateImage: (payload: {
    prompt: string
    size: ImageGenSizeId
    model?: import('../domains/media/jimengModels').JimengImageModelId
  }) => ipcRenderer.invoke('generate-image', cloneForIpc(payload)) as Promise<GenerateImageResult>,
  saveGeneratedImageAs: (sourcePath: string) =>
    ipcRenderer.invoke('save-generated-image-as', { sourcePath }) as Promise<SavePptxAsResult>,
  onPetAvatarEvent: (callback: (payload: PetAvatarEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as PetAvatarEvent)
    ipcRenderer.on('pet-avatar-event', handler)
    return () => ipcRenderer.removeListener('pet-avatar-event', handler)
  },
  petDragBy: (dx: number, dy: number) => ipcRenderer.send('pet-drag-by', { dx, dy }),
  petClose: () => ipcRenderer.invoke('pet-close') as Promise<{ ok: boolean }>,
  petSpeakText: (payload: { text: string; rate?: number }) =>
    ipcRenderer.invoke('pet-speak-text', cloneForIpc(payload)) as Promise<{
      ok: boolean
      error?: string
      engine?: 'nailong' | 'system'
      cancelled?: boolean
      timing?: {
        synthesizeMs?: number
        playMs?: number
        totalMs: number
        audioBytes?: number
        httpStatus?: number
      }
    }>,
  petSpeakStop: () => ipcRenderer.invoke('pet-speak-stop') as Promise<{ ok: boolean }>,
  petForceIdle: (payload?: { messageId?: number }) =>
    ipcRenderer.invoke('pet-force-idle', cloneForIpc(payload ?? {})) as Promise<{ ok: boolean }>,
  petTtsPing: () =>
    ipcRenderer.invoke('pet-tts-ping') as Promise<{ ok: boolean; baseUrl: string; error?: string }>,
  petTtsLogs: () =>
    ipcRenderer.invoke('pet-tts-logs') as Promise<{
      logs: Array<{
        id: string
        at: string
        level: 'info' | 'ok' | 'warn' | 'error'
        stage: string
        message: string
        ms?: number
        engine?: 'nailong' | 'system'
        textPreview?: string
        detail?: Record<string, string | number | boolean | undefined>
      }>
    }>,
  petTtsLogsClear: () => ipcRenderer.invoke('pet-tts-logs-clear') as Promise<{ ok: boolean }>,
  onPetTtsLog: (
    callback: (entry: {
      id: string
      at: string
      level: 'info' | 'ok' | 'warn' | 'error'
      stage: string
      message: string
      ms?: number
      engine?: 'nailong' | 'system'
      textPreview?: string
      detail?: Record<string, string | number | boolean | undefined>
    }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(
        value as {
          id: string
          at: string
          level: 'info' | 'ok' | 'warn' | 'error'
          stage: string
          message: string
          ms?: number
          engine?: 'nailong' | 'system'
          textPreview?: string
          detail?: Record<string, string | number | boolean | undefined>
        },
      )
    ipcRenderer.on('pet-tts-log', handler)
    return () => ipcRenderer.removeListener('pet-tts-log', handler)
  },
  onPetTtsPhase: (callback: (payload: { phase: 'idle' | 'synthesizing' | 'playing' }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { phase: 'idle' | 'synthesizing' | 'playing' })
    ipcRenderer.on('pet-tts-phase', handler)
    return () => ipcRenderer.removeListener('pet-tts-phase', handler)
  },
  petChatAsk: (payload: { text: string; forceSearch?: boolean; requestId?: string }) =>
    ipcRenderer.send('pet-chat-ask', cloneForIpc(payload)),
  petChatAskResult: (result: {
    ok: boolean
    error?: string
    conversationId?: number
    webSearch?: boolean
    requestId?: string
  }) => ipcRenderer.send('pet-chat-ask-result', cloneForIpc(result)),
  onPetChatAsk: (
    callback: (payload: { text: string; forceSearch?: boolean; requestId?: string }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value as { text: string; forceSearch?: boolean; requestId?: string })
    ipcRenderer.on('pet-chat-ask', handler)
    return () => ipcRenderer.removeListener('pet-chat-ask', handler)
  },
  onPetChatAskResult: (
    callback: (result: {
      ok: boolean
      error?: string
      conversationId?: number
      webSearch?: boolean
      requestId?: string
    }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(
        value as {
          ok: boolean
          error?: string
          conversationId?: number
          webSearch?: boolean
          requestId?: string
        },
      )
    ipcRenderer.on('pet-chat-ask-result', handler)
    return () => ipcRenderer.removeListener('pet-chat-ask-result', handler)
  },
  servicesGetStatus: () =>
    ipcRenderer.invoke('services-get-status') as Promise<{
      items: Array<{
        id: 'tts' | 'voice-bot'
        target: string
        up: boolean
        latencyMs?: number
        detail?: string
        error?: string
        managed: boolean
        starting: boolean
      }>
      vendorPipecat: boolean
      vendorTts: boolean
    }>,
  servicesStart: (id: 'tts' | 'voice-bot') =>
    ipcRenderer.invoke('services-start', { id }) as Promise<{
      ok: boolean
      error?: string
      alreadyRunning?: boolean
    }>,
  servicesGetLogs: (id: 'tts' | 'voice-bot') =>
    ipcRenderer.invoke('services-get-logs', { id }) as Promise<{
      logs: Array<{
        id: string
        at: string
        level: 'info' | 'ok' | 'warn' | 'error'
        stream: 'stdout' | 'stderr' | 'system'
        message: string
      }>
    }>,
  servicesClearLogs: (id: 'tts' | 'voice-bot') =>
    ipcRenderer.invoke('services-clear-logs', { id }) as Promise<{ ok: boolean }>,
  onServiceLog: (
    callback: (payload: {
      serviceId: 'tts' | 'voice-bot'
      entry: {
        id: string
        at: string
        level: 'info' | 'ok' | 'warn' | 'error'
        stream: 'stdout' | 'stderr' | 'system'
        message: string
      }
    }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(
        value as {
          serviceId: 'tts' | 'voice-bot'
          entry: {
            id: string
            at: string
            level: 'info' | 'ok' | 'warn' | 'error'
            stream: 'stdout' | 'stderr' | 'system'
            message: string
          }
        },
      )
    ipcRenderer.on('service-log', handler)
    return () => ipcRenderer.removeListener('service-log', handler)
  },
})