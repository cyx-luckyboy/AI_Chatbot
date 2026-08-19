import './squirrel-startup'
import { app, BrowserWindow, protocol, net, session } from 'electron'
import path from 'path'
import fs from 'fs'
import url from 'url'
import 'dotenv/config'

/** 须在 app.ready 之前注册，否则渲染进程 <img src="safe-file://"> 无法加载本地附件 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'safe-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])
import { configManager } from '../shared/config'
import { runAutoLocationDetect } from '../domains/location/locationDetect'
import { createMenu } from './menu'
import { setupIPC } from '../ipc/setup'
import { killAllTerminals } from '../domains/workspace/terminalMain'
import { shutdownManagedServices } from '../domains/services/serviceMain'
import { APP_DISPLAY_NAME } from '../shared/appMeta'
import {
  createPetWindow,
  destroyPetOnMainClose,
  ensurePetFromConfig,
  hasMainWindowAlive,
  setPetMainWindowRef,
  shouldQuitWhenWindowsClosed,
} from '../domains/pet/petWindowMain'

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

let mainWindow: BrowserWindow | null = null

const createWindow = async () => {
  // The pet window captures microphone audio directly in its renderer.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  // 初始化配置
  await configManager.load()
  void runAutoLocationDetect()

  const isWin = process.platform === 'win32'
  // Windows 原生标题栏无法放大/加粗顶栏图标与文字；无边框后由 App.vue 自绘顶栏与窗口按钮（titleBarOverlay 在 Win10 等环境常无按钮）
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: APP_DISPLAY_NAME,
    icon: resolveWindowIconPath(),
    frame: !isWin,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  setPetMainWindowRef(mainWindow)

  mainWindow.on('closed', () => {
    destroyPetOnMainClose()
    mainWindow = null
    setPetMainWindowRef(null)
  })

  /** 页面或路由若修改 document.title，仍保持标题栏与 APP_DISPLAY_NAME 一致 */
  const lockWindowTitle = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(APP_DISPLAY_NAME)
    }
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
    try {
      /**
       * 推荐 `safe-file:///` + pathname（整段路径 URL 编码），主进程从 pathname 解码。
       * 部分场景（如 CSS `url()`）会把 `safe-file:///C%3A...` 规范成 `safe-file://C%3A...`，
       * 此时 WHATWG URL 会把路径放进 **hostname**、pathname 为空，必须兼容否则 404。
       */
      const resolveSafeFileLocalPath = (requestUrl: string): string => {
        try {
          const u = new URL(requestUrl)
          /** Chromium 常把 `safe-file:///C%3A/...` 规范成 `safe-file://C/Users/...`（盘符进 hostname） */
          if (
            process.platform === 'win32' &&
            u.hostname &&
            /^[a-zA-Z]$/.test(u.hostname) &&
            u.pathname &&
            u.pathname !== '/'
          ) {
            const rest = decodeURIComponent(u.pathname).replace(/^\//, '').replace(/\//g, '\\')
            return `${u.hostname.toUpperCase()}:\\${rest}`
          }
          let encPath = u.pathname
          if (encPath.startsWith('/')) encPath = encPath.slice(1)
          if (encPath) {
            return decodeURIComponent(encPath)
          }
          if (u.hostname) {
            const extra = u.pathname && u.pathname !== '/' ? u.pathname : ''
            return decodeURIComponent(u.hostname + extra)
          }
        } catch {
          /* fall through */
        }
        const raw = requestUrl.replace(/^safe-file:\/\/?/i, '')
        return decodeURIComponent(raw.replace(/^\//, ''))
      }

      const filePath = resolveSafeFileLocalPath(request.url)
      if (!filePath || !fs.existsSync(filePath)) {
        console.error('[safe-file] 文件不存在或路径无效:', request.url, '→', filePath)
        return new Response(null, { status: 404 })
      }
      return net.fetch(url.pathToFileURL(filePath).toString())
    } catch (e) {
      console.error('[safe-file]', request.url, e)
      return new Response(null, { status: 500 })
    }
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

  if (configManager.get().desktopPetEnabled) {
    void createPetWindow()
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
  killAllTerminals()
  shutdownManagedServices()
  if (shouldQuitWhenWindowsClosed()) {
    app.quit()
  }
});

app.on('before-quit', () => {
  shutdownManagedServices()
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!hasMainWindowAlive()) {
    void createWindow()
  } else {
    ensurePetFromConfig()
  }
});
