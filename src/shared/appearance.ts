import type { AppConfig } from './types'

/** 聊天区/首页壁纸刷新：设置保存或启动后派发 */
export const WALLPAPER_SYNC_EVENT = 'vchat-appearance-changed'

export function emitAppearanceChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WALLPAPER_SYNC_EVENT))
}

function applyThemeOnly(config: AppConfig): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const theme = config.theme ?? 'light'
  root.classList.toggle('dark', theme === 'dark')
}

/** 仅同步主题类（浅色/深色）。壁纸由对话页/首页组件自行拉取 data URL，避免依赖 html 上的超长 CSS 变量。 */
export function applyAppearance(config: AppConfig): void {
  applyThemeOnly(config)
}
