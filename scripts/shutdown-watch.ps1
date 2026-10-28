param(
  [int]$ParentPid,
  [string]$Player,
  [string]$Audio,
  [string]$Device = "",
  [string]$LogPath = "",
  [string]$Marker = ""
)
$ErrorActionPreference = 'SilentlyContinue'

function Write-WatchLog([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($LogPath)) { return }
  try {
    Add-Content -LiteralPath $LogPath -Value ((Get-Date -Format o) + ' [watcher] ' + $Text)
  } catch {}
}

Write-WatchLog "start parent=$ParentPid"
while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Milliseconds 500
}
Write-WatchLog 'parent-gone'
Start-Sleep -Milliseconds 450
if (-not [string]::IsNullOrWhiteSpace($Marker) -and (Test-Path -LiteralPath $Marker)) {
  try {
    $age = (Get-Date) - (Get-Item -LiteralPath $Marker).LastWriteTime
    if ($age.TotalSeconds -lt 30) { Write-WatchLog 'cleanup-marker-present skip'; exit 0 }
  } catch {}
}
if (-not (Test-Path -LiteralPath $Player)) { Write-WatchLog 'player-missing'; exit 1 }
if (-not (Test-Path -LiteralPath $Audio)) { Write-WatchLog 'audio-missing'; exit 1 }
$args = @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', $Player, '-Path', $Audio, '-LogPath', $LogPath, '-WaitDeviceMs', '0')
if (-not [string]::IsNullOrWhiteSpace($Device)) { $args += @('-Device', $Device) }
$p = Start-Process powershell.exe -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
Write-WatchLog "player-exit=$($p.ExitCode)"
