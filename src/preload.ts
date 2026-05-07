// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { ipcRenderer, contextBridge } from 'electron'
import type { CreateChatProps, OnUpdatedCallback, AppConfig, UpdatgedStreamData } from './types'
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
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: Partial<AppConfig>) =>
    ipcRenderer.invoke('update-config', cloneForIpc(config)),
  baiduAsrRecognize: (payload: BaiduAsrRecognizePayload) =>
    ipcRenderer.invoke('baidu-asr-recognize', cloneForIpc(payload)) as Promise<BaiduAsrRecognizeResult>,
  onMenuNewConversation: (callback: () => void) => ipcRenderer.on('menu-new-conversation', () => callback()),
  onMenuOpenSettings: (callback: () => void) => ipcRenderer.on('menu-open-settings', () => callback())
})