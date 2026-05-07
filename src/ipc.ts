import { ipcMain, BrowserWindow, app } from 'electron'
import { CreateChatProps } from './types'
import { baiduAsrRecognize, type BaiduAsrRecognizePayload } from './baiduAsrMain'
import { createProvider } from './providers/createProvider'
import { configManager } from './config'
import { createContextMenu, updateMenu } from './menu'
import fs from 'fs/promises'
import path from 'path'

function parseDataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('Invalid data URL')
  const header = dataUrl.slice(0, comma).trim()
  const payload = dataUrl.slice(comma + 1)
  const mimeMatch = /^data:([^;]+)/i.exec(header)
  const mime = mimeMatch?.[1]?.trim() || 'application/octet-stream'
  const isBase64 = /;base64/i.test(header)
  const buffer = isBase64
    ? Buffer.from(payload.replace(/\s/g, ''), 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')
  return { buffer, mime }
}

function extFromMime(mime: string): string {
  let ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]+/gi, '').slice(0, 8) || 'bin'
  if (ext === 'jpeg') ext = 'jpg'
  return ext
}

function sanitizeBasename(name: string): string {
  const base = path.basename(name).replace(/^\.+/, '') || 'file'
  return base.replace(/[^\w.\-()\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g, '_').slice(0, 180)
}

export function setupIPC(mainWindow: BrowserWindow) {
  // Context menu handler
  ipcMain.on('show-context-menu', (event, id) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    createContextMenu(win, id)
  })

  // Chat handler
  ipcMain.on('start-chat', async (event, data: CreateChatProps) => {
    const { providerName, messages, messageId, selectedModel } = data
    try {
      const provider = createProvider(providerName)
      const stream = await provider.chat(messages, selectedModel)
      for await (const chunk of stream) {
        const content = {
          messageId,
          data: chunk
        }
        mainWindow.webContents.send('update-message', content)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorContent = {
        messageId,
        data: {
          is_end: true,
          result: error instanceof Error ? error.message : '与AI服务通信时发生错误',
          is_error: true
        }
      }
      mainWindow.webContents.send('update-message', errorContent)
    }
  })

  // Config handlers
  ipcMain.handle('get-config', () => {
    return configManager.get()
  })

  ipcMain.handle('baidu-asr-recognize', async (_event, payload: BaiduAsrRecognizePayload) => {
    return baiduAsrRecognize(payload)
  })

  ipcMain.handle('update-config', async (event, newConfig) => {
    const updatedConfig = await configManager.update(newConfig)
    // 如果语言发生变化，更新菜单
    if (newConfig.language) {
      updateMenu(mainWindow)
    }
    return updatedConfig
  })

  // File handling
  /** `source` 为本地绝对路径，或渲染进程 `FileReader` 得到的 `data:image/...;base64,...`（无可靠 `File.path` 时用后者）。 */
  ipcMain.handle('copy-image-to-user-dir', async (_event, source: string) => {
    const userDataPath = app.getPath('userData')
    const imagesDir = path.join(userDataPath, 'images')
    await fs.mkdir(imagesDir, { recursive: true })
    const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    if (source.startsWith('data:')) {
      const { buffer, mime } = parseDataUrlToBuffer(source)
      const ext = mime.startsWith('image/') ? extFromMime(mime) : 'png'
      const destPath = path.join(imagesDir, `img-${unique()}.${ext}`)
      await fs.writeFile(destPath, buffer)
      return destPath
    }

    const baseName = path.basename(source)
    const destPath = path.join(imagesDir, `img-${unique()}-${baseName}`)
    await fs.copyFile(source, destPath)
    return destPath
  })

  /** 通用附件：data URL 写入 userData/attachments */
  ipcMain.handle(
    'save-user-attachment',
    async (_event, payload: { dataUrl: string; fileName: string }) => {
      const userDataPath = app.getPath('userData')
      const dir = path.join(userDataPath, 'attachments')
      await fs.mkdir(dir, { recursive: true })
      const { buffer, mime } = parseDataUrlToBuffer(payload.dataUrl)
      const safe = sanitizeBasename(payload.fileName)
      const hasExt = path.extname(safe).length > 0
      const suffix = hasExt ? '' : `.${extFromMime(mime)}`
      const destPath = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}${suffix}`)
      await fs.writeFile(destPath, buffer)
      return destPath
    },
  )
}
