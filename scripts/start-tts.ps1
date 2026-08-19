# Start local Nailong GPT-SoVITS TTS (port 9880).
$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$TtsRoot = Join-Path $repo "vendor\GPT-SoVITS"

$bat = Join-Path $TtsRoot "start-nailong-tts.bat"
$api = Join-Path $TtsRoot "api_v2.py"
if (-not (Test-Path $TtsRoot)) {
  throw "GPT-SoVITS not found at $TtsRoot — run scripts\migrate-vendor-in.ps1 if migrating from sibling folders"
}
if (Test-Path $bat) {
  Set-Location $TtsRoot
  & cmd /c "`"$bat`""
  exit $LASTEXITCODE
}
if (Test-Path $api) {
  Set-Location $TtsRoot
  $py = Join-Path $TtsRoot ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  & $py $api
  exit $LASTEXITCODE
}
throw "GPT-SoVITS entry not found under $TtsRoot (expected start-nailong-tts.bat or api_v2.py)"
