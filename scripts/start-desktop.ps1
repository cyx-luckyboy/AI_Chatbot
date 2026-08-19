# Start Electron desktop app (dev).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
npm start
