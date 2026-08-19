/**
 * 在普通浏览器（直接打开 Vite 的 127.0.0.1:5173）里没有 preload，需避免访问 undefined 导致白屏。
 * Electron 内由 preload 注入真实 API，此处不覆盖。
 */
import type { AppConfig, CreateChatProps, OnUpdatedCallback } from '../shared/types'
import { DEFAULT_CONFIG } from '../shared/types'

let browserMockConfig: AppConfig = { ...DEFAULT_CONFIG, providerConfigs: { ...DEFAULT_CONFIG.providerConfigs } }

function inferPlatformFromUserAgent(): NodeJS.Platform {
  if (typeof navigator === 'undefined') return 'win32'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'win32'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'darwin'
  return 'linux'
}

function install() {
  if (typeof window === 'undefined') return

  /** preload 未注入或旧构建缺少 electronEnv 时，App.vue 无法显示自定义标题栏，无边框窗口会顶栏全空 */
  if (!window.electronEnv) {
    window.electronEnv = { platform: inferPlatformFromUserAgent() }
  }

  if (window.electronAPI) return

  window.electronAPI = {
    startChat(_data: CreateChatProps) {
      console.warn('[VChat] 浏览器环境未连接主进程，无法发起对话；请使用 npm start 在 Electron 中运行。')
    },
    async abortChat() {
      return { ok: false, messageId: null }
    },
    onUpdateMessage(_callback: OnUpdatedCallback) {
      return () => {
        /* noop: 浏览器环境无 IPC 流 */
      }
    },
    showContextMenu(_id: number) {
      /* no-op */
    },
    onDeleteConversation(_callback: (id: number) => void) {
      /* no-op */
    },
    async copyImageToUserDir(sourcePath: string) {
      return sourcePath
    },
    /** 返回 data URL 以便 <img> 能预览；纯浏览器无主进程读盘，virtual-attachment 会导致裂图 */
    async saveUserAttachment(dataUrl: string, _fileName: string) {
      return dataUrl
    },
    getPathForFile(_file: File) {
      return ''
    },
    async importUserAttachment(_sourcePath: string, fileName: string) {
      throw new Error(`browser_no_import:${fileName}`)
    },
    async saveChatBackground(dataUrl: string) {
      return dataUrl
    },
    async readLocalImageAsDataUrl(_path: string) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X9n90AAAAASUVORK5CYII='
    },
    async getConfig() {
      return { ...browserMockConfig, providerConfigs: { ...browserMockConfig.providerConfigs } }
    },
    async pickAgentWorkspace() {
      return { ok: false as const, cancelled: true as const }
    },
    async workspaceGetRoot() {
      return { path: '' }
    },
    async workspaceList() {
      return { ok: false as const, error: 'browser' }
    },
    async workspaceRead() {
      return { ok: false as const, error: 'browser' }
    },
    async workspaceWrite() {
      return { ok: false as const, error: 'browser' }
    },
    async workspaceFindDefinition() {
      return { ok: false as const, error: 'browser' }
    },
    async terminalCreate() {
      return { ok: false as const, error: '终端需要 Electron 桌面端（npm start）' }
    },
    async terminalWrite() {
      return { ok: false, error: 'browser' }
    },
    async terminalInterrupt() {
      return { ok: true }
    },
    async terminalResize() {
      return { ok: true }
    },
    async terminalKill() {
      return { ok: true }
    },
    onTerminalData() {
      return () => undefined
    },
    onTerminalReady() {
      return () => undefined
    },
    onTerminalExit() {
      return () => undefined
    },
    onMenuToggleTerminal() {
      return () => undefined
    },
    onMenuToggleSidebar() {
      return () => undefined
    },
    onConfigChanged(_callback: () => void) {
      return () => undefined
    },
    async autoDetectLocation() {
      return { updated: false, config: browserMockConfig }
    },
    async updateConfig(config: Partial<AppConfig>) {
      browserMockConfig = {
        ...browserMockConfig,
        ...config,
        providerConfigs: {
          ...browserMockConfig.providerConfigs,
          ...(config.providerConfigs ?? {}),
        },
      }
      return browserMockConfig
    },
    async baiduAsrRecognize() {
      return { err_no: 0, result: ['（浏览器预览：未调用百度接口）'] }
    },
    onMenuNewConversation(_callback: () => void) {
      /* no-op */
    },
    onMenuOpenSettings(_callback: () => void) {
      /* no-op */
    },
    windowMinimize() {
      /* no-op */
    },
    windowToggleMaximize() {
      /* no-op */
    },
    windowClose() {
      /* no-op */
    },
    async isWindowMaximized() {
      return false
    },
    onWindowMaximizedState(_callback: (maximized: boolean) => void) {
      return () => {
        /* noop */
      }
    },
    async translateText(payload: { text: string; target: string }) {
      return { ok: true as const, text: payload.text }
    },
    async buildPptxFromMarkdown() {
      return { ok: false as const, error: 'PPTX export requires Electron (npm start)' }
    },
    onPptBuildProgress(_callback: (payload: { answerId?: number; current: number; total: number }) => void) {
      return () => undefined
    },
    async savePptxExportAs() {
      return { ok: false as const, error: 'PPTX export requires Electron (npm start)' }
    },
    async showPptxInFolder() {
      /* noop */
    },
    async openExternalUrl(url: string) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    async detectUserLocation() {
      return { ok: false as const, error: '定位需要 Electron 桌面端（npm start）' }
    },
    async generateImage() {
      return { ok: false as const, error: '图片生成需要 Electron 桌面端（npm start）' }
    },
    async saveGeneratedImageAs() {
      return { ok: false as const, error: '图片保存需要 Electron 桌面端（npm start）' }
    },
    async meetingAsrStart() {
      return { ok: false as const, error: '会议录音需要 Electron 桌面端（npm start）' }
    },
    async meetingAsrStop() {
      return { ok: false as const, error: '会议录音需要 Electron 桌面端（npm start）' }
    },
    async meetingAsrAbort() {
      return { ok: true }
    },
    meetingAsrSendAudio() {
      /* noop */
    },
    onMeetingAsrResult() {
      return () => undefined
    },
    onMeetingAsrError() {
      return () => undefined
    },
    async meetingSummarize() {
      return { ok: false, error: '会议总结需要 Electron 桌面端（npm start）' }
    },
    async meetingTranslate() {
      return { ok: false as const, error: '会议翻译需要 Electron 桌面端（npm start）' }
    },
    async suggestConversationTitle(payload: {
      messages?: { role: string; content: string }[]
    }) {
      const first = payload?.messages?.find((m) => m.role === 'user')?.content || ''
      const title = String(first).replace(/\s+/g, ' ').trim().slice(0, 28) || 'Chat'
      return { ok: true as const, title, source: 'fallback' as const }
    },
    onMeetingSummaryChunk() {
      return () => undefined
    },
    onMeetingSummaryDone() {
      return () => undefined
    },
    onMeetingSummaryError() {
      return () => undefined
    },
    async meetingDeleteAudio() {
      return { ok: true }
    },
    async meetingGetAudioUrl() {
      return { ok: false as const, error: 'browser' }
    },
    async meetingReadAudio() {
      return { ok: false as const, error: '会议录音需要 Electron 桌面端（npm start）' }
    },
    async meetingSaveAudioAs() {
      return { ok: false as const, error: '会议录音需要 Electron 桌面端（npm start）' }
    },
    async checkProviderConfigured() {
      return { ok: false as const, error: 'browser' }
    },
    onPetAvatarEvent() {
      return () => undefined
    },
    petDragBy() {
      /* noop */
    },
    async petClose() {
      return { ok: true }
    },
    async petSpeakText() {
      return { ok: false as const, error: 'browser' }
    },
    async petSpeakStop() {
      return { ok: true }
    },
    async petForceIdle() {
      return { ok: true }
    },
    async petTtsPing() {
      return { ok: false, baseUrl: 'http://127.0.0.1:9880', error: 'browser' }
    },
    async petTtsLogs() {
      return { logs: [] }
    },
    async petTtsLogsClear() {
      return { ok: true }
    },
    onPetTtsLog() {
      return () => {}
    },
    onPetTtsPhase() {
      return () => {}
    },
    petChatAsk() {},
    petChatAskResult() {},
    onPetChatAsk() {
      return () => {}
    },
    onPetChatAskResult() {
      return () => {}
    },
    async servicesGetStatus() {
      return {
        items: [
          {
            id: 'tts' as const,
            target: 'http://127.0.0.1:9880/tts',
            up: false,
            managed: false,
            starting: false,
            error: 'browser',
          },
          {
            id: 'voice-bot' as const,
            target: 'tcp://127.0.0.1:8765',
            up: false,
            managed: false,
            starting: false,
            error: 'browser',
          },
        ],
        vendorPipecat: false,
        vendorTts: false,
      }
    },
    async servicesStart() {
      return { ok: false, error: 'browser' }
    },
    async servicesGetLogs() {
      return { logs: [] }
    },
    async servicesClearLogs() {
      return { ok: true }
    },
    onServiceLog() {
      return () => {}
    },
  }
}

install()
