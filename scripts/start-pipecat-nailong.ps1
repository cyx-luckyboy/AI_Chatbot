# Compat wrapper — prefer start-voice-bot.ps1
param(
  [string]$PipecatRoot = ""
)
& (Join-Path $PSScriptRoot "start-voice-bot.ps1") -PipecatRoot $PipecatRoot
