$ErrorActionPreference = 'Stop'

function Await-WinRt($WinRtTask, [Type]$ResultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  $netTask = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Geolocation.Geolocator, Windows.System.Devices, ContentType = WindowsRuntime]

$access = Await-WinRt ([Windows.Devices.Geolocation.Geolocator]::RequestAccessAsync()) ([Windows.Devices.Geolocation.GeolocationAccessStatus])
Write-Host "Access=$access"
if ($access.ToString() -ne 'Allowed') { exit 3 }

$locator = [Windows.Devices.Geolocation.Geolocator]::new()
$locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
$pos = Await-WinRt ($locator.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
Write-Output "$($pos.Coordinate.Latitude)|$($pos.Coordinate.Longitude)"
