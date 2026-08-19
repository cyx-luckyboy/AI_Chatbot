# Check local stack: TTS (9880), Pipecat voice-bot (8765), Vite (5173), desktop process, vendor links.
param(
  [string]$TtsBaseUrl = "",
  [string]$VoiceHost = "",
  [int]$VoicePort = 0,
  [int]$VitePort = 5173,
  [switch]$Strict,   # exit 1 if TTS or voice-bot is down
  [switch]$Quiet     # only print one-line summary + exit code
)

$ErrorActionPreference = "Continue"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or $line -notmatch "=") { return }
    $i = $line.IndexOf("=")
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    if ($k) { $map[$k] = $v }
  }
  return $map
}

function Test-Tcp([string]$HostName, [int]$Port, [int]$TimeoutMs = 1500) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) {
      try { $client.Close() } catch {}
      return @{ Ok = $false; Ms = $sw.ElapsedMilliseconds; Error = "timeout ${TimeoutMs}ms" }
    }
    $client.EndConnect($iar)
    $client.Close()
    return @{ Ok = $true; Ms = $sw.ElapsedMilliseconds; Error = $null }
  } catch {
    return @{ Ok = $false; Ms = $sw.ElapsedMilliseconds; Error = $_.Exception.Message }
  }
}

function Test-TtsHttp([string]$BaseUrl, [int]$TimeoutMs = 2500) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $base = $BaseUrl.TrimEnd("/")
  try {
    $uri = [Uri]"$base/tts"
    $req = [System.Net.HttpWebRequest]::Create($uri)
    $req.Method = "POST"
    $req.ContentType = "application/json"
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs
    $body = [Text.Encoding]::UTF8.GetBytes("{}")
    $req.ContentLength = $body.Length
    $stream = $req.GetRequestStream()
    $stream.Write($body, 0, $body.Length)
    $stream.Close()
    try {
      $resp = $req.GetResponse()
      $code = [int]$resp.StatusCode
      $resp.Close()
      # any HTTP response => process is up
      return @{ Ok = $true; Ms = $sw.ElapsedMilliseconds; Detail = "HTTP $code"; Error = $null }
    } catch [System.Net.WebException] {
      $resp = $_.Exception.Response
      if ($null -ne $resp) {
        $code = [int]$resp.StatusCode
        $resp.Close()
        # 4xx (e.g. 400 empty body) still means TTS is alive
        return @{ Ok = $true; Ms = $sw.ElapsedMilliseconds; Detail = "HTTP $code (alive)"; Error = $null }
      }
      return @{ Ok = $false; Ms = $sw.ElapsedMilliseconds; Detail = $null; Error = $_.Exception.Message }
    }
  } catch {
    return @{ Ok = $false; Ms = $sw.ElapsedMilliseconds; Detail = $null; Error = $_.Exception.Message }
  }
}

function Find-ListeningPids([int]$Port) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return @() }
    return @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

function Process-Label([int]$ProcessId) {
  try {
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    return "$($p.ProcessName) (pid $ProcessId)"
  } catch {
    return "pid $ProcessId"
  }
}

$envMap = Read-DotEnv (Join-Path $repo ".env")
if (-not $TtsBaseUrl) {
  $TtsBaseUrl = if ($envMap["NAILONG_TTS_BASE_URL"]) { $envMap["NAILONG_TTS_BASE_URL"] } else { "http://127.0.0.1:9880" }
}
if (-not $VoiceHost) {
  $VoiceHost = if ($envMap["PIPECAT_HOST"]) { $envMap["PIPECAT_HOST"] } else { "127.0.0.1" }
}
if ($VoicePort -le 0) {
  $VoicePort = if ($envMap["PIPECAT_PORT"]) { [int]$envMap["PIPECAT_PORT"] } else { 8765 }
}

$tts = Test-TtsHttp $TtsBaseUrl
$voice = Test-Tcp $VoiceHost $VoicePort
$vite = Test-Tcp "127.0.0.1" $VitePort

$ttsPids = Find-ListeningPids 9880
try {
  $u = [Uri]$TtsBaseUrl
  if ($u.Port -gt 0) { $ttsPids = Find-ListeningPids $u.Port }
} catch {}
$voicePids = Find-ListeningPids $VoicePort
$vitePids = Find-ListeningPids $VitePort

$desktop = @(Get-Process -Name "electron","vchat","小猪AI助手" -ErrorAction SilentlyContinue)
$vendorPipecat = Test-Path (Join-Path $repo "vendor\pipecat\pyproject.toml")
$vendorTts = Test-Path (Join-Path $repo "vendor\GPT-SoVITS")

$rows = @(
  [pscustomobject]@{
    Service = "TTS (GPT-SoVITS)"
    Target  = "$TtsBaseUrl/tts"
    Status  = $(if ($tts.Ok) { "UP" } else { "DOWN" })
    Latency = "$($tts.Ms)ms"
    Detail  = $(if ($tts.Ok) { $tts.Detail } else { $tts.Error })
    Process = $(if ($ttsPids.Count) { ($ttsPids | ForEach-Object { Process-Label $_ }) -join ", " } else { "-" })
  },
  [pscustomobject]@{
    Service = "Voice-bot (Pipecat)"
    Target  = "tcp://${VoiceHost}:${VoicePort}"
    Status  = $(if ($voice.Ok) { "UP" } else { "DOWN" })
    Latency = "$($voice.Ms)ms"
    Detail  = $(if ($voice.Ok) { "accepting TCP" } else { $voice.Error })
    Process = $(if ($voicePids.Count) { ($voicePids | ForEach-Object { Process-Label $_ }) -join ", " } else { "-" })
  },
  [pscustomobject]@{
    Service = "Vite (renderer)"
    Target  = "http://127.0.0.1:$VitePort"
    Status  = $(if ($vite.Ok) { "UP" } else { "DOWN" })
    Latency = "$($vite.Ms)ms"
    Detail  = $(if ($vite.Ok) { "dev server" } else { "not listening (ok if packaged)" })
    Process = $(if ($vitePids.Count) { ($vitePids | ForEach-Object { Process-Label $_ }) -join ", " } else { "-" })
  },
  [pscustomobject]@{
    Service = "Desktop (Electron)"
    Target  = "process"
    Status  = $(if ($desktop.Count) { "UP" } else { "DOWN" })
    Latency = "-"
    Detail  = $(if ($desktop.Count) { "$($desktop.Count) process(es)" } else { "not running" })
    Process = $(if ($desktop.Count) { ($desktop | ForEach-Object { "$($_.ProcessName) (pid $($_.Id))" } | Select-Object -First 5) -join ", " } else { "-" })
  },
  [pscustomobject]@{
    Service = "vendor/pipecat"
    Target  = "vendor\pipecat"
    Status  = $(if ($vendorPipecat) { "OK" } else { "MISSING" })
    Latency = "-"
    Detail  = $(if ($vendorPipecat) { "junction/link present" } else { "run scripts\link-vendor.ps1" })
    Process = "-"
  },
  [pscustomobject]@{
    Service = "vendor/GPT-SoVITS"
    Target  = "vendor\GPT-SoVITS"
    Status  = $(if ($vendorTts) { "OK" } else { "MISSING" })
    Latency = "-"
    Detail  = $(if ($vendorTts) { "junction/link present" } else { "run scripts\link-vendor.ps1" })
    Process = "-"
  }
)

$upCritical = @($tts.Ok, $voice.Ok) | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
$summary = "TTS=$(if($tts.Ok){'UP'}else{'DOWN'}) Voice=$(if($voice.Ok){'UP'}else{'DOWN'}) Vite=$(if($vite.Ok){'UP'}else{'DOWN'}) Desktop=$(if($desktop.Count){'UP'}else{'DOWN'})"

if ($Quiet) {
  Write-Output $summary
} else {
  Write-Host ""
  Write-Host "Service status  ($repo)" -ForegroundColor Cyan
  Write-Host ("=" * 72)
  $rows | Format-Table -AutoSize Service, Status, Latency, Target, Detail
  Write-Host "Processes (when listening):" -ForegroundColor DarkGray
  foreach ($r in $rows) {
    if ($r.Process -and $r.Process -ne "-") {
      Write-Host ("  {0,-22} {1}" -f $r.Service, $r.Process)
    }
  }
  Write-Host ""
  Write-Host "Summary: $summary" -ForegroundColor $(if ($tts.Ok -and $voice.Ok) { "Green" } elseif ($tts.Ok -or $voice.Ok) { "Yellow" } else { "Red" })
  Write-Host "Hints:   npm run voice:tts | npm run voice:bot | npm start | npm run start:all"
  Write-Host ""
}

if ($Strict -and (-not $tts.Ok -or -not $voice.Ok)) {
  exit 1
}
exit 0
