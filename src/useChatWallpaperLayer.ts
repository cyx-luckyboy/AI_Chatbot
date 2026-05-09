import { onMounted, onUnmounted, ref } from 'vue'
import { WALLPAPER_SYNC_EVENT } from './appearance'

/** 聊天主区域背景：内联样式 + 监听配置变更，与设置页预览同源（readLocalImageAsDataUrl） */
export function useChatWallpaperLayer() {
  const wallpaperStyle = ref<Record<string, string>>({})

  async function syncWallpaper() {
    const c = await window.electronAPI.getConfig()
    const p = (c.chatBackgroundImagePath ?? '').trim()
    if (!p) {
      wallpaperStyle.value = {}
      return
    }
    try {
      const data = p.startsWith('data:') ? p : await window.electronAPI.readLocalImageAsDataUrl(p)
      wallpaperStyle.value = { backgroundImage: `url(${JSON.stringify(data)})` }
    } catch {
      wallpaperStyle.value = {}
    }
  }

  const onSync = () => {
    void syncWallpaper()
  }

  onMounted(() => {
    void syncWallpaper()
    window.addEventListener(WALLPAPER_SYNC_EVENT, onSync)
  })
  onUnmounted(() => {
    window.removeEventListener(WALLPAPER_SYNC_EVENT, onSync)
  })

  return { wallpaperStyle, syncWallpaper }
}
