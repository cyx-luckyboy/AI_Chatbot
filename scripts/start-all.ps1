# Launch TTS + voice-bot in new terminals, then desktop.
param(
  [switch]$SkipTts,
  [switch]$SkipVoiceBot
)

$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $repo

& (Join-Path $PSScriptRoot "link-vendor.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipTts) {
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "start-tts.ps1")
  )
  Start-Sleep -Seconds 2
}

if (-not $SkipVoiceBot) {
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "start-voice-bot.ps1")
  )
  Start-Sleep -Seconds 1
}

& (Join-Path $PSScriptRoot "start-desktop.ps1")
