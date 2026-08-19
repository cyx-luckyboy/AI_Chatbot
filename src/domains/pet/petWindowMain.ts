import { BrowserWindow, screen } from 'electron'
import path from 'path'
import type { PetAvatarEvent } from '../../shared/types'
import { configManager } from '../../shared/config'

let petWindow: BrowserWindow | null = null
let mainWindowRef: BrowserWindow | null = null

export function setPetMainWindowRef(win: BrowserWindow | null) {
  mainWindowRef = win
}

export function getPetWindow(): BrowserWindow | null {
  if (petWindow && petWindow.isDestroyed()) {
    petWindow = null
  }
  return petWindow
}

export function isPetWindow(win: BrowserWindow | null): boolean {
  const pet = getPetWindow()
  return Boolean(win && pet && win.id === pet.id)
}

function resolvePetPageUrl(): { kind: 'url' | 'file'; value: string } {
  const devServerUrl =
    process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL ||
    (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined)
  if (devServerUrl) {
    const base = String(devServerUrl).replace(/\/$/, '')
    return { kind: 'url', value: `${base}/?window=pet` }
  }
  const name =
    typeof MAIN_WINDOW_VITE_NAME !== 'undefined' ? MAIN_WINDOW_VITE_NAME : 'main_window'
  return {
    kind: 'file',
    value: path.join(__dirname, `../renderer/${name}/index.html`),
  }
}

export async function createPetWindow(): Promise<BrowserWindow | null> {
  if (getPetWindow()) return petWindow

  const display = screen.getPrimaryDisplay().workArea
  const width = 400
  const height = 540
  const x = Math.max(0, display.x + display.width - width - 24)
  const y = Math.max(0, display.y + display.height - height - 24)

  petWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  })

  petWindow.setAlwaysOnTop(true, 'screen-saver')
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  petWindow.on('closed', () => {
    petWindow = null
  })

  const page = resolvePetPageUrl()
  if (page.kind === 'url') {
    await petWindow.loadURL(page.value)
  } else {
    await petWindow.loadFile(page.value, { query: { window: 'pet' } })
  }

  if (!petWindow.isDestroyed()) {
    petWindow.showInactive()
  }
  return petWindow
}

export function destroyPetWindow() {
  const win = getPetWindow()
  if (!win) return
  win.destroy()
  petWindow = null
}

export function sendPetAvatarEvent(event: PetAvatarEvent) {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('pet-avatar-event', event)
}

export function syncPetWindowWithConfig(enabled: boolean) {
  if (enabled) {
    void createPetWindow()
  } else {
    destroyPetWindow()
  }
}

/** 主窗关闭时销毁宠物窗；仅当主窗已关时才允许应用退出判断使用 */
export function destroyPetOnMainClose() {
  destroyPetWindow()
}

export function hasMainWindowAlive(): boolean {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return false
  return true
}

export function movePetWindowByDelta(dx: number, dy: number) {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  win.setPosition(Math.round(x + dx), Math.round(y + dy))
}

export function setPetWindowPosition(x: number, y: number) {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  win.setPosition(Math.round(x), Math.round(y))
}

export function shouldQuitWhenWindowsClosed(): boolean {
  // 仅剩宠物窗时不退出；主窗已关则退出（宠物应已销毁）
  if (process.platform === 'darwin') return false
  return !hasMainWindowAlive()
}

/** 供 activate 等场景：应用仍在跑且配置开启时确保宠物窗存在 */
export function ensurePetFromConfig() {
  try {
    if (configManager.get().desktopPetEnabled) {
      void createPetWindow()
    }
  } catch {
    /* config may not be loaded */
  }
}
