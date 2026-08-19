import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type WindowsGeoErrorCode =
  | 'timeout'
  | 'disabled'
  | 'denied'
  | 'unknown'
  | 'failed'

/** WinRT 定位（与 Windows「设置」同源） */
const WINRT_GEO_SCRIPT = `
$ErrorActionPreference = 'Stop'
function Await-WinRt($WinRtTask, [Type]$ResultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]
  $netTask = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Geolocation.Geolocator, Windows.System.Devices, ContentType = WindowsRuntime]
$access = Await-WinRt ([Windows.Devices.Geolocation.Geolocator]::RequestAccessAsync()) ([Windows.Devices.Geolocation.GeolocationAccessStatus])
if ($access.ToString() -ne 'Allowed') { exit 3 }
$locator = [Windows.Devices.Geolocation.Geolocator]::new()
$locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
$pos = Await-WinRt ($locator.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
$c = $pos.Coordinate
if ($null -eq $c) { exit 4 }
Write-Output ("{0}|{1}" -f $c.Latitude, $c.Longitude)
`.trim()

/** 旧 API 兜底 */
const LEGACY_GEO_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher
$w.Start()
$deadline = (Get-Date).AddSeconds(25)
while ($w.Status -eq 'Initializing' -or $w.Status -eq 'NoData') {
  if ((Get-Date) -gt $deadline) { exit 2 }
  Start-Sleep -Milliseconds 300
}
if ($w.Status -eq 'Disabled') { exit 3 }
if ($w.Status -ne 'Ready') { exit 5 }
$p = $w.Position.Location
if ($p.IsUnknown) { exit 4 }
Write-Output ("{0}|{1}" -f $p.Latitude, $p.Longitude)
`.trim()

function parseLatLng(stdout: string): { lat: number; lng: number } | null {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop()
  const [latS, lngS] = (line ?? '').split('|')
  const lat = Number(latS)
  const lng = Number(lngS)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

function mapExecError(status: number | undefined): WindowsGeoErrorCode {
  if (status === 2) return 'timeout'
  if (status === 3) return 'denied'
  if (status === 4) return 'unknown'
  return 'failed'
}

async function runGeoScript(
  script: string,
): Promise<{ ok: true; lat: number; lng: number } | { ok: false; code: WindowsGeoErrorCode }> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 28_000, windowsHide: true, maxBuffer: 8192 },
    )
    const coords = parseLatLng(stdout)
    if (coords) return { ok: true, ...coords }
    return { ok: false, code: 'unknown' }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    if (err.stdout) {
      const coords = parseLatLng(String(err.stdout))
      if (coords) return { ok: true, ...coords }
    }
    return { ok: false, code: mapExecError(err.status) }
  }
}

/** Windows 系统定位（Wi‑Fi/卫星），不经过 Chromium / Google */
export async function fetchWindowsGeolocationDetailed(): Promise<
  { ok: true; lat: number; lng: number } | { ok: false; code: WindowsGeoErrorCode }
> {
  if (process.platform !== 'win32') return { ok: false, code: 'failed' }

  const winrt = await runGeoScript(WINRT_GEO_SCRIPT)
  if (winrt.ok) return winrt

  const legacy = await runGeoScript(LEGACY_GEO_SCRIPT)
  if (legacy.ok) return legacy

  return { ok: false, code: winrt.code === 'denied' ? 'denied' : legacy.code }
}

export async function fetchWindowsGeolocation(): Promise<{ lat: number; lng: number } | null> {
  const r = await fetchWindowsGeolocationDetailed()
  return r.ok ? { lat: r.lat, lng: r.lng } : null
}
