// src/preload.d.ts

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
  /** Electron：从 `<input type=file>` 的 File 取本地绝对路径（大文件勿再 readAsDataURL） */
  getPathForFile: (file: File) => string
  /** 主进程按路径复制附件，上限见 attachmentLimits（默认 50MB） */
  importUserAttachment: (sourcePath: string, fileName: string) => Promise<string>
  saveChatBackground: (dataUrl: string) => Promise<string>
  readLocalImageAsDataUrl: (absPath: string) => Promise<string>
  getConfig: () => Promise<AppConfig>
  autoDetectLocation: () => Promise<{ updated: boolean; config: AppConfig }>
  onConfigChanged: (callback: () => void) => () => void
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
  buildPptxFromMarkdown: (payload: {
    markdown: string
    suggestedName?: string
    answerId?: number
    quality?: import('./types').PptGenQualityId
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
    model?: import('./jimengModels').JimengImageModelId
  }) => Promise<GenerateImageResult>
  saveGeneratedImageAs: (sourcePath: string) => Promise<SavePptxAsResult>
}

declare global {
  interface Window {
    electronEnv: ElectronEnv
    electronAPI: ElectronAPI
  }
}

export {}
