import './squirrel-startup'
import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import url from 'url'
import 'dotenv/config'
import { configManager } from './config'
import { createMenu } from './menu'
import { setupIPC } from './ipc'
import { APP_DISPLAY_NAME } from './appMeta'

/** 开发：仓库根目录 pig.ico；打包：extraResource 复制到 resources/pig.ico */
function resolveWindowIconPath(): string | undefined {
  const candidates = [path.join(process.resourcesPath, 'pig.ico'), path.join(__dirname, '..', '..', 'pig.ico')]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* noop */
    }
  }
  return undefined
}

const createWindow = async () => {
  // 初始化配置
  await configManager.load()

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: APP_DISPLAY_NAME,
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  /** 页面或路由若修改 document.title，仍保持标题栏与 APP_DISPLAY_NAME 一致 */
  const lockWindowTitle = () => {
    mainWindow.setTitle(APP_DISPLAY_NAME)
  }
  mainWindow.webContents.on('did-finish-load', lockWindowTitle)
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    lockWindowTitle()
  })

  // Create application menu
  createMenu(mainWindow)

  // Setup IPC handlers
  setupIPC(mainWindow)

  protocol.handle('safe-file', async (request) => {
    const filePath = decodeURIComponent(request.url.slice('safe-file://'.length))
    return net.fetch(url.pathToFileURL(filePath).toString())
  })

  // Prefer runtime env (set when the renderer dev server listens) over compile-time define.
  const devServerUrl =
    process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const attempts = 40;
    const delayMs = 150;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await mainWindow.loadURL(devServerUrl);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    if (lastErr) {
      console.error('Failed to load dev server URL after retries:', devServerUrl, lastErr);
      throw lastErr;
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
