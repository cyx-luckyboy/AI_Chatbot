/**
 * 在普通浏览器（直接打开 Vite 的 127.0.0.1:5173）里没有 preload，需避免访问 undefined 导致白屏。
 * Electron 内由 preload 注入真实 API，此处不覆盖。
 */
import type { AppConfig, CreateChatProps, OnUpdatedCallback } from './types'
import { DEFAULT_CONFIG } from './types'

let browserMockConfig: AppConfig = { ...DEFAULT_CONFIG, providerConfigs: { ...DEFAULT_CONFIG.providerConfigs } }

function install() {
  if (typeof window === 'undefined' || window.electronAPI) return

  window.electronAPI = {
    startChat(_data: CreateChatProps) {
      console.warn('[VChat] 浏览器环境未连接主进程，无法发起对话；请使用 npm start 在 Electron 中运行。')
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
    async saveUserAttachment(_dataUrl: string, fileName: string) {
      return `virtual-attachment://${encodeURIComponent(fileName)}`
    },
    async getConfig() {
      return { ...browserMockConfig, providerConfigs: { ...browserMockConfig.providerConfigs } }
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
  }
}

install()
