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
} from './types'
import type { BaiduAsrRecognizePayload, BaiduAsrRecognizeResult } from './baiduAsrMain'
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
    quality?: import('./types').PptGenQualityId
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
    model?: import('./jimengModels').JimengImageModelId
  }) => ipcRenderer.invoke('generate-image', cloneForIpc(payload)) as Promise<GenerateImageResult>,
  saveGeneratedImageAs: (sourcePath: string) =>
    ipcRenderer.invoke('save-generated-image-as', { sourcePath }) as Promise<SavePptxAsResult>,
})