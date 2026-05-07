// src/preload.d.ts

import type { AppConfig, CreateChatProps, OnUpdatedCallback } from './types'
import type { BaiduAsrRecognizePayload, BaiduAsrRecognizeResult } from './baiduAsrMain'

interface ElectronAPI {
  startChat: (data: CreateChatProps) => void
  onUpdateMessage: (callback: OnUpdatedCallback) => () => void
  showContextMenu: (id: number) => void
  onDeleteConversation: (callback: (id: number) => void) => void
  /** 本地文件绝对路径，或 `data:image/...;base64,...`（推荐，因 `<input type=file>` 在渲染进程常无 `path`）。 */
  copyImageToUserDir: (pathOrDataUrl: string) => Promise<string>
  saveUserAttachment: (dataUrl: string, fileName: string) => Promise<string>
  getConfig: () => Promise<AppConfig>
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig>
  baiduAsrRecognize: (payload: BaiduAsrRecognizePayload) => Promise<BaiduAsrRecognizeResult>
  onMenuNewConversation: (callback: () => void) => void
  onMenuOpenSettings: (callback: () => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
