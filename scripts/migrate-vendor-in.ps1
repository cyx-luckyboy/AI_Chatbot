# Move sibling repos into vchat/vendor/ (one-time physical consolidation).
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$vendor = Join-Path $repo "vendor"
$parent = Split-Path $repo -Parent

$moves = @(
  @{ Name = "pipecat"; Source = Join-Path $parent "pipecat" },
  @{ Name = "GPT-SoVITS"; Source = Join-Path $parent "GPT-SoVITS" }
)

New-Item -ItemType Directory -Force -Path $vendor | Out-Null

foreach ($m in $moves) {
  $dest = Join-Path $vendor $m.Name
  $source = $m.Source

  if (Test-Path $dest) {
    $item = Get-Item $dest -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      Write-Host "Removing junction: $dest"
      cmd /c "rmdir `"$dest`""
    } elseif ($Force) {
      Write-Host "Destination exists (not junction), skipping unless -Force: $dest"
      continue
    } else {
      if ((Get-ChildItem $dest -Force | Measure-Object).Count -gt 0) {
        Write-Host "Already present: $dest (use -Force to skip check)"
        continue
      }
    }
  }

  if (-not (Test-Path $source)) {
    Write-Warning "Source missing, skip: $source"
    continue
  }

  if (Test-Path $dest) {
    $item = Get-Item $dest -Force -ErrorAction SilentlyContinue
    if ($item -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      $marker = Join-Path $dest $(if ($m.Name -eq "pipecat") { "pyproject.toml" } else { "api_v2.py" })
      if (Test-Path $marker) {
        Write-Host "Already migrated: $dest"
        continue
      }
    }
  }

  if ((Split-Path $source -Parent | ForEach-Object { [IO.Path]::GetFullPath($_) }) -eq [IO.Path]::GetFullPath($vendor)) {
    Write-Host "Already under vendor: $source"
    continue
  }

  Write-Host "Moving $source -> $dest ..."
  try {
    Move-Item -LiteralPath $source -Destination $dest -ErrorAction Stop
    Write-Host "Done: $($m.Name)"
    continue
  } catch {
    Write-Warning "Move failed ($($_.Exception.Message)), trying robocopy..."
  }

  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  robocopy $source $dest /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed for $($m.Name) (exit $LASTEXITCODE)"
  }
  Write-Host "Copied: $($m.Name) (stop TTS/processes using $source then delete old folder manually)"
}

Write-Host ""
Write-Host "Monorepo layout ready under $repo"
Write-Host "  vendor/pipecat      - Pipecat framework"
Write-Host "  vendor/GPT-SoVITS   - Nailong TTS"
Write-Host "  services/voice-bot  - Pipecat bot script"
Write-Host "  src/                - Electron desktop app"
