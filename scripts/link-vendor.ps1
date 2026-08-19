# Verify vendor/pipecat and vendor/GPT-SoVITS exist under the monorepo.
$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$vendor = Join-Path $repo "vendor"

$checks = @(
  @{ Name = "pipecat"; Marker = "pyproject.toml" },
  @{ Name = "GPT-SoVITS"; Marker = "api_v2.py" }
)

$ok = $true
foreach ($c in $checks) {
  $path = Join-Path $vendor $c.Name
  $marker = Join-Path $path $c.Marker
  if (Test-Path $marker) {
    Write-Host "OK  vendor/$($c.Name)"
  } else {
    Write-Host "MISSING  vendor/$($c.Name) ($marker)"
    $ok = $false
  }
}

if (-not $ok) {
  Write-Host ""
  Write-Host "Run: scripts\migrate-vendor-in.ps1"
  Write-Host "  (copies/moves from E:\Project\pipecat and E:\Project\GPT-SoVITS if still present)"
  exit 1
}

Write-Host "Vendor layout OK under $repo"
