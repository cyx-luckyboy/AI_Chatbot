// src/preload.d.ts

import type { AppConfig, CreateChatProps, OnUpdatedCallback } from './types'

interface ElectronAPI {
  startChat: (data: CreateChatProps) => void
  onUpdateMessage: (callback: OnUpdatedCallback) => void
  showContextMenu: (id: number) => void
  onDeleteConversation: (callback: (id: number) => void) => void
  copyImageToUserDir: (sourcePath: string) => Promise<string>
  getConfig: () => Promise<AppConfig>
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig>
  onMenuNewConversation: (callback: () => void) => void
  onMenuOpenSettings: (callback: () => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
