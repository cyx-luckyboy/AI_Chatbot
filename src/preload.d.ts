// src/preload.d.ts

import type {
  AppConfig,
  CreateChatProps,
  OnUpdatedCallback,
  TranslateTextResult,
  TranslateTargetId,
} from './types'
import type { BaiduAsrRecognizePayload, BaiduAsrRecognizeResult } from './baiduAsrMain'

interface ElectronEnv {
  platform: NodeJS.Platform
}

interface ElectronAPI {
  startChat: (data: CreateChatProps) => void
  onUpdateMessage: (callback: OnUpdatedCallback) => () => void
  showContextMenu: (id: number) => void
  onDeleteConversation: (callback: (id: number) => void) => void
  /** 本地文件绝对路径，或 `data:image/...;base64,...`（推荐，因 `<input type=file>` 在渲染进程常无 `path`）。 */
  copyImageToUserDir: (pathOrDataUrl: string) => Promise<string>
  saveUserAttachment: (dataUrl: string, fileName: string) => Promise<string>
  saveChatBackground: (dataUrl: string) => Promise<string>
  readLocalImageAsDataUrl: (absPath: string) => Promise<string>
  getConfig: () => Promise<AppConfig>
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig>
  baiduAsrRecognize: (payload: BaiduAsrRecognizePayload) => Promise<BaiduAsrRecognizeResult>
  onMenuNewConversation: (callback: () => void) => void
  onMenuOpenSettings: (callback: () => void) => void
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowClose: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximizedState: (callback: (maximized: boolean) => void) => () => void
  translateText: (payload: { text: string; target: TranslateTargetId }) => Promise<TranslateTextResult>
}

declare global {
  interface Window {
    electronEnv: ElectronEnv
    electronAPI: ElectronAPI
  }
}

export {}
