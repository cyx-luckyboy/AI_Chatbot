// Types for window.electronAPI (preload bridge)


import type {
  AppConfig,
  CreateChatProps,
  OnUpdatedCallback,
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

interface ElectronEnv {
  platform: NodeJS.Platform
}

interface ElectronAPI {
  startChat: (data: CreateChatProps) => void
  abortChat: (payload?: { messageId?: number }) => Promise<{ ok: boolean; messageId: number | null }>
  onUpdateMessage: (callback: OnUpdatedCallback) => () => void
  showContextMenu: (id: number) => void
  onDeleteConversation: (callback: (id: number) => void) => void
  /** 本地文件绝对路径，或 `data:image/...;base64,...`（推荐，因 `<input type=file>` 在渲染进程常无 `path`）。 */
  copyImageToUserDir: (pathOrDataUrl: string) => Promise<string>
  saveUserAttachment: (dataUrl: string, fileName: string) => Promise<string>
  /** Electron：从 `<input type=file>` 的 File 取本地绝对路径（大文件勿再 readAsDataURL） */
  getPathForFile: (file: File) => string
  /** 主进程按路径复制附件，上限见 attachmentLimits（默认 50MB） */
  importUserAttachment: (sourcePath: string, fileName: string) => Promise<string>
  saveChatBackground: (dataUrl: string) => Promise<string>
  readLocalImageAsDataUrl: (absPath: string) => Promise<string>
  getConfig: () => Promise<AppConfig>
  pickAgentWorkspace: () => Promise<
    { ok: true; path: string } | { ok: false; cancelled?: boolean; error?: string }
  >
  workspaceGetRoot: () => Promise<{ path: string }>
  workspaceList: (payload?: { path?: string }) => Promise<
    | { ok: true; entries: { name: string; path: string; kind: 'file' | 'dir' }[] }
    | { ok: false; error: string }
  >
  workspaceRead: (payload: { path: string }) => Promise<
    { ok: true; path: string; content: string } | { ok: false; error: string }
  >
  workspaceWrite: (payload: { path: string; content: string }) => Promise<
    { ok: true; path: string; bytes: number } | { ok: false; error: string }
  >
  workspaceFindDefinition: (payload: { symbol: string; fromPath?: string }) => Promise<
    | { ok: true; hits: { path: string; line: number; column: number }[] }
    | { ok: false; error: string }
  >
  terminalCreate: (payload?: {
    cols?: number
    rows?: number
    cwd?: string
  }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  terminalWrite: (payload: { id: string; data: string }) => Promise<{ ok: boolean; error?: string }>
  terminalInterrupt: (payload: { id: string }) => Promise<{ ok: boolean }>
  terminalResize: (payload: {
    id: string
    cols: number
    rows: number
  }) => Promise<{ ok: boolean; error?: string }>
  terminalKill: (payload: { id: string }) => Promise<{ ok: boolean }>
  onTerminalData: (callback: (payload: { id: string; data: string }) => void) => () => void
  onTerminalReady: (callback: (payload: { id: string }) => void) => () => void
  onTerminalExit: (callback: (payload: { id: string; exitCode: number }) => void) => () => void
  onMenuToggleTerminal: (callback: () => void) => () => void
  onMenuToggleSidebar: (callback: () => void) => () => void
  autoDetectLocation: () => Promise<{ updated: boolean; config: AppConfig }>
  onConfigChanged: (callback: () => void) => () => void
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig>
  baiduAsrRecognize: (payload: BaiduAsrRecognizePayload) => Promise<BaiduAsrRecognizeResult>
  meetingAsrStart: (payload: MeetingAsrStartPayload) => Promise<MeetingAsrStartResult>
  meetingAsrStop: (payload: MeetingAsrStopPayload) => Promise<MeetingAsrStopResult>
  meetingAsrAbort: (payload: { meetingId: number }) => Promise<{ ok: boolean }>
  meetingAsrSendAudio: (payload: { meetingId: number; pcm: ArrayBuffer }) => void
  onMeetingAsrResult: (callback: (payload: MeetingAsrResultPayload) => void) => () => void
  onMeetingAsrError: (callback: (payload: { meetingId: number; error: string }) => void) => () => void
  meetingSummarize: (payload: MeetingSummarizePayload) => Promise<{ ok: boolean; error?: string }>
  meetingTranslate: (payload: MeetingTranslatePayload) => Promise<TranslateTextResult>
  suggestConversationTitle: (
    payload: SuggestConversationTitlePayload,
  ) => Promise<SuggestConversationTitleResult>
  onMeetingSummaryChunk: (callback: (payload: { meetingId: number; partial: string }) => void) => () => void
  onMeetingSummaryDone: (callback: (payload: MeetingSummaryDonePayload) => void) => () => void
  onMeetingSummaryError: (callback: (payload: { meetingId: number; error: string }) => void) => () => void
  meetingDeleteAudio: (payload: { audioFileName: string }) => Promise<{ ok: boolean; error?: string }>
  meetingGetAudioUrl: (payload: { audioFileName: string }) => Promise<
    { ok: true; url: string } | { ok: false; error: string }
  >
  meetingReadAudio: (payload: { audioFileName: string }) => Promise<
    | { ok: true; mime: string; data: Uint8Array }
    | { ok: false; error: string }
  >
  meetingSaveAudioAs: (payload: { audioFileName: string; suggestedName?: string }) => Promise<SavePptxAsResult>
  checkProviderConfigured: (payload: { providerName: string }) => Promise<
    { ok: true } | { ok: false; error: string }
  >
  onMenuNewConversation: (callback: () => void) => void
  onMenuOpenSettings: (callback: () => void) => void
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowClose: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximizedState: (callback: (maximized: boolean) => void) => () => void
  translateText: (payload: { text: string; target: TranslateTargetId }) => Promise<TranslateTextResult>
  buildPptxFromMarkdown: (payload: {
    markdown: string
    suggestedName?: string
    answerId?: number
    quality?: import('../shared/types').PptGenQualityId
  }) => Promise<BuildPptxResult>
  onPptBuildProgress: (callback: (payload: PptBuildProgressPayload) => void) => () => void
  savePptxExportAs: (sourcePath: string) => Promise<SavePptxAsResult>
  showPptxInFolder: (filePath: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  detectUserLocation: (payload?: {
    mode?: 'ip' | 'gps'
    latitude?: number
    longitude?: number
  }) => Promise<
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
  >
  generateImage: (payload: {
    prompt: string
    size: ImageGenSizeId
    model?: import('../domains/media/jimengModels').JimengImageModelId
  }) => Promise<GenerateImageResult>
  saveGeneratedImageAs: (sourcePath: string) => Promise<SavePptxAsResult>
  onPetAvatarEvent: (callback: (payload: PetAvatarEvent) => void) => () => void
  petDragBy: (dx: number, dy: number) => void
  petClose: () => Promise<{ ok: boolean }>
  petSpeakText: (payload: { text: string; rate?: number }) => Promise<{
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
  }>
  petSpeakStop: () => Promise<{ ok: boolean }>
  petForceIdle: (payload?: { messageId?: number }) => Promise<{ ok: boolean }>
  petTtsPing: () => Promise<{ ok: boolean; baseUrl: string; error?: string; latencyMs?: number }>
  petTtsLogs: () => Promise<{
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
  }>
  petTtsLogsClear: () => Promise<{ ok: boolean }>
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
  ) => () => void
  onPetTtsPhase: (
    callback: (payload: { phase: 'idle' | 'synthesizing' | 'playing' }) => void,
  ) => () => void
  petChatAsk: (payload: { text: string; forceSearch?: boolean; requestId?: string }) => void
  petChatAskResult: (result: {
    ok: boolean
    error?: string
    conversationId?: number
    webSearch?: boolean
    requestId?: string
  }) => void
  onPetChatAsk: (
    callback: (payload: { text: string; forceSearch?: boolean; requestId?: string }) => void,
  ) => () => void
  onPetChatAskResult: (
    callback: (result: {
      ok: boolean
      error?: string
      conversationId?: number
      webSearch?: boolean
      requestId?: string
    }) => void,
  ) => () => void
  servicesGetStatus: () => Promise<{
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
  }>
  servicesStart: (id: 'tts' | 'voice-bot') => Promise<{
    ok: boolean
    error?: string
    alreadyRunning?: boolean
  }>
  servicesGetLogs: (id: 'tts' | 'voice-bot') => Promise<{
    logs: Array<{
      id: string
      at: string
      level: 'info' | 'ok' | 'warn' | 'error'
      stream: 'stdout' | 'stderr' | 'system'
      message: string
    }>
  }>
  servicesClearLogs: (id: 'tts' | 'voice-bot') => Promise<{ ok: boolean }>
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
  ) => () => void
}

declare global {
  interface Window {
    electronEnv: ElectronEnv
    electronAPI: ElectronAPI
  }
}

export {}
