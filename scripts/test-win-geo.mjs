import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const script = `
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher
$w.Start()
$deadline = (Get-Date).AddSeconds(18)
while ($w.Status -eq 'Initializing') {
  if ((Get-Date) -gt $deadline) { exit 2 }
  Start-Sleep -Milliseconds 250
}
Write-Host "Status=$($w.Status)"
if ($w.Status -eq 'Disabled') { exit 3 }
if ($w.Status -ne 'Ready') { exit 5 }
$p = $w.Position.Location
if ($p.IsUnknown) { exit 4 }
Write-Output "$($p.Latitude)|$($p.Longitude)"
`.trim()

try {
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 25000, windowsHide: true },
  )
  console.log('OK', { stdout, stderr })
} catch (e) {
  console.log('ERR', e.status, e.stdout?.toString(), e.stderr?.toString())
}
