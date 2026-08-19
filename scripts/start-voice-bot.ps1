# Start Pipecat Nailong voice bot.
param(
  [string]$PipecatRoot = ""
)

$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$bot = Join-Path $repo "services\voice-bot\bot.py"

if (-not $PipecatRoot) {
  $PipecatRoot = Join-Path $repo "vendor\pipecat"
}

$source = Join-Path $PipecatRoot "src"
$projectFile = Join-Path $PipecatRoot "pyproject.toml"
if (-not (Test-Path $projectFile)) {
  throw "Pipecat not found at $PipecatRoot (expected vendor\pipecat after monorepo migration)"
}
if (-not (Test-Path $bot)) {
  throw "Voice bot not found: $bot"
}

$env:PYTHONPATH = $source
$venvPython = Join-Path $PipecatRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
  & $venvPython $bot
  exit $LASTEXITCODE
}

$env:UV_CACHE_DIR = Join-Path $repo ".uv-cache"
New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null
uv run --project $PipecatRoot --no-dev python $bot
