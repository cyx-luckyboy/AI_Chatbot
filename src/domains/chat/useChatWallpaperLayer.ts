import { nextTick, onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import { WALLPAPER_SYNC_EVENT } from '../../shared/appearance'

/** 全应用共享，避免多页面各拉一次壁纸并触发并发 patch */
const wallpaperStyle = shallowRef<Record<string, string>>({})
let listenerCount = 0
let syncInFlight: Promise<void> | null = null

async function syncWallpaper() {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    const c = await window.electronAPI.getConfig()
    const p = (c.chatBackgroundImagePath ?? '').trim()
    let next: Record<string, string> = {}
    if (p) {
      try {
        const data = p.startsWith('data:') ? p : await window.electronAPI.readLocalImageAsDataUrl(p)
        next = { backgroundImage: `url("${data.replace(/"/g, '\\"')}")` }
      } catch {
        next = {}
      }
    }
    await nextTick()
    wallpaperStyle.value = next
  })().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

function onSync() {
  void syncWallpaper()
}

/** 聊天主区域背景：内联样式 + 监听配置变更，与设置页预览同源（readLocalImageAsDataUrl） */
export function useChatWallpaperLayer() {
  onMounted(() => {
    listenerCount += 1
    if (listenerCount === 1) {
      window.addEventListener(WALLPAPER_SYNC_EVENT, onSync)
    }
    void syncWallpaper()
  })
  onUnmounted(() => {
    listenerCount = Math.max(0, listenerCount - 1)
    if (listenerCount === 0) {
      window.removeEventListener(WALLPAPER_SYNC_EVENT, onSync)
    }
  })

  return { wallpaperStyle: readonly(wallpaperStyle), syncWallpaper }
}
