param(
  [string]$DshHome = "",
  [string]$Profile = "web-desktop",
  [switch]$RemoveUserData,
  [switch]$Pause
)
$ErrorActionPreference = "Stop"

function Test-ProfileDir([string]$DshRoot) {
  if ([string]::IsNullOrWhiteSpace($DshRoot)) { return $false }
  return (Test-Path -LiteralPath (Join-Path $DshRoot "profiles\$Profile"))
}

function Add-Candidate($List, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  try { $full = [IO.Path]::GetFullPath($Path) } catch { return }
  if (-not $List.Contains($full)) { $List.Add($full) | Out-Null }
}

function Find-DshHome {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:DSH_HOME) { Add-Candidate $candidates $env:DSH_HOME }
  $starts = @()
  if ($PSScriptRoot) { $starts += $PSScriptRoot }
  if ($PWD) { $starts += $PWD.Path }
  foreach ($start in $starts) {
    $dir = $start
    for ($i = 0; $i -lt 7 -and $dir; $i++) {
      Add-Candidate $candidates (Join-Path $dir "dsh-home")
      if (Test-ProfileDir $dir) { Add-Candidate $candidates $dir }
      $parent = [IO.Directory]::GetParent($dir)
      if ($null -eq $parent) { break }
      $dir = $parent.FullName
    }
  }
  if ($env:APPDATA) {
    $releases = Join-Path $env:APPDATA "com.deepseek.dsh.desktop.aio\releases"
    if (Test-Path -LiteralPath $releases) {
      Get-ChildItem -LiteralPath $releases -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Add-Candidate $candidates (Join-Path $_.FullName "dsh-home") }
    }
  }
  if ($env:LOCALAPPDATA) {
    $dpx = Join-Path $env:LOCALAPPDATA "Deepseek Harness EAC\dpx\dsh-environments"
    if (Test-Path -LiteralPath $dpx) {
      Get-ChildItem -LiteralPath $dpx -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Add-Candidate $candidates (Join-Path $_.FullName "dsh-home") }
    }
  }
  if ($env:USERPROFILE) { Add-Candidate $candidates (Join-Path $env:USERPROFILE ".dsh") }
  if ($env:LOCALAPPDATA) { Add-Candidate $candidates (Join-Path $env:LOCALAPPDATA "DSH") }
  foreach ($candidate in $candidates) {
    if (Test-ProfileDir $candidate) { return $candidate }
  }
  $tried = ($candidates | ForEach-Object { "  - $_" }) -join "`r`n"
  throw "No DSH profile '$Profile' was found.`r`nTried:`r`n$tried"
}

function Remove-BundleFromPackageJson([string]$Path, [string]$Name) {
  $text = [IO.File]::ReadAllText($Path)
  $match = [regex]::Match($text, '("bundles"\s*:\s*\[)([\s\S]*?)(\])')
  if (-not $match.Success) { return $false }
  $inner = $match.Groups[2].Value
  $pattern = ',\s*"' + [regex]::Escape($Name) + '"|"' + [regex]::Escape($Name) + '"\s*,?'
  $next = [regex]::Replace($inner, $pattern, '')
  if ($next -eq $inner) { return $false }
  $next = $next.Trim().TrimEnd(',')
  $backup = "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $Path -Destination $backup -Force
  $text = $text.Substring(0, $match.Groups[2].Index) + $next + $text.Substring($match.Groups[2].Index + $match.Groups[2].Length)
  [IO.File]::WriteAllText($Path, $text, (New-Object Text.UTF8Encoding($false)))
  return $true
}

function Remove-TopLevelEntry([string]$Path, [string]$Id) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $text = [IO.File]::ReadAllText($Path)
  $lines = [System.Collections.Generic.List[string]]($text -split "\r?\n")
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^- id:\s*["'']?' + [regex]::Escape($Id) + '["'']?\s*$') {
      $j = $i + 1
      while ($j -lt $lines.Count) {
        if ($lines[$j].Trim() -eq "") { break }
        if ($lines[$j] -match '^\S') { break }
        $j++
      }
      $lines.RemoveRange($i, $j - $i)
      $found = $true
      $i--
    }
  }
  if ($found) {
    $backup = "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    [IO.File]::WriteAllText($Path, ($lines -join "`r`n").TrimEnd() + "`r`n", (New-Object Text.UTF8Encoding($false)))
  }
  return $found
}

if ([string]::IsNullOrWhiteSpace($DshHome)) {
  $DshHome = Find-DshHome
} elseif (-not (Test-ProfileDir $DshHome)) {
  throw "Profile '$Profile' not found under explicit DshHome: $DshHome"
}
$profileDir = Join-Path $DshHome "profiles\$Profile"
if (-not (Test-Path -LiteralPath $profileDir)) { throw "Profile not found: $profileDir" }

$dest = Join-Path $profileDir "node_modules\dsh-voice-greeting"
$patch = Join-Path $profileDir "cordis.patch.yml"
$pkgPath = Join-Path $profileDir "package.json"
$removedBundle = Remove-BundleFromPackageJson -Path $pkgPath -Name "dsh-voice-greeting"
$removedPatch = Remove-TopLevelEntry -Path $patch -Id "dsh-voice-greeting"
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }

if ($RemoveUserData) {
  $dataNames = @(
    "dsh-voice-greeting.json",
    "dsh-voice-greeting.json.bak",
    "dsh-voice-greeting-audio",
    "dsh-voice-greeting-cache",
    "dsh-voice-greeting-play.log",
    "dsh-voice-greeting-watchdog.pid",
    "dsh-voice-greeting-shutdown.marker"
  )
  foreach ($name in $dataNames) {
    $path = Join-Path $profileDir $name
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  }
}

Write-Host ""
Write-Host "Removed plugin from: $dest"
Write-Host "bundles updated: $removedBundle"
Write-Host "cordis.patch.yml updated: $removedPatch"
Write-Host "User data removed: $RemoveUserData"
Write-Host "Next: fully quit and reopen DSH."
if ($Pause) { Read-Host "Press Enter to close" | Out-Null }
