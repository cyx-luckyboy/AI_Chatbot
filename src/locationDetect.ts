import { BrowserWindow } from 'electron'
import { configManager } from './config'
import { fetchIpLocation, reverseGeocode, type DetectedLocation } from './locationMain'
import { fetchWindowsGeolocationDetailed } from './locationWindows'
import { isValidLocationText } from './userLocation'

export function notifyLocationConfigChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('vchat-config-changed')
  }
}

/** 本机 / 设备定位（Windows WinRT 等），不用 IP 库 */
export async function detectDeviceLocation(): Promise<DetectedLocation | null> {
  if (process.platform === 'win32') {
    const win = await fetchWindowsGeolocationDetailed()
    if (win.ok) {
      const geo =
        (await reverseGeocode(win.lat, win.lng)) ??
        ({
          city: '',
          region: '',
          country: '中国',
          latitude: win.lat,
          longitude: win.lng,
          source: 'gps',
        } as DetectedLocation)
      return { ...geo, latitude: win.lat, longitude: win.lng, source: 'gps' }
    }
  }
  return null
}

function canApplyDetected(detected: DetectedLocation): boolean {
  if (!detected.city.trim() && !detected.region.trim()) return false
  if (!isValidLocationText(detected.city) || !isValidLocationText(detected.region)) return false
  return true
}

/**
 * 启动时自动定位：优先本机 GPS；无结果且未配置城市时再试 IP。
 * 用户手动填写的城市（source=manual）不覆盖。
 */
export async function runAutoLocationDetect(): Promise<boolean> {
  const cfg = configManager.get()
  if (cfg.locationEnabled === false) return false

  let detected = await detectDeviceLocation()
  if (!detected || (!detected.city.trim() && !detected.region.trim())) {
    if ((cfg.locationCity ?? '').trim()) return false
    detected = await fetchIpLocation()
  }
  if (!detected || !canApplyDetected(detected)) return false

  const now = new Date().toISOString()
  await configManager.update({
    locationEnabled: true,
    locationCity: detected.city,
    locationRegion: detected.region,
    locationCountry: detected.country,
    locationLatitude: detected.latitude,
    locationLongitude: detected.longitude,
    locationSource: detected.source,
    locationUpdatedAt: now,
  })
  notifyLocationConfigChanged()
  return true
}
