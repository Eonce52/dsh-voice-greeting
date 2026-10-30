param(
  [string]$DshHome = "",
  [string]$Profile = "web-desktop",
  [switch]$NoPause,
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

function Remove-InnerPluginEntry {
  param([string]$Text, [string]$Id)
  $lines = [System.Collections.Generic.List[string]]($Text -split "\r?\n")
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^([ \t]+)- id:\s*["'']?' + [regex]::Escape($Id) + '["'']?\s*$') {
      $indent = $Matches[1].Length
      $j = $i + 1
      while ($j -lt $lines.Count) {
        if ($lines[$j].Trim() -eq "") { break }
        if ($lines[$j] -match '^([ \t]*)\S' -and $Matches[1].Length -le $indent) { break }
        $j++
      }
      $lines.RemoveRange($i, $j - $i)
      $i--
    }
  }
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^[ \t]*- insert:\s*$') {
      $j = $i + 1
      $hasChild = $false
      while ($j -lt $lines.Count) {
        if ($lines[$j].Trim() -eq "") { $j++; continue }
        if ($lines[$j] -match '^[ \t]+- ') { $hasChild = $true }
        break
      }
      if (-not $hasChild) {
        $lines.RemoveAt($i)
        if ($i -lt $lines.Count -and $lines[$i].Trim() -eq "") { $lines.RemoveAt($i) }
        $i--
      }
    }
  }
  return ($lines -join "`r`n")
}

function Add-BundleToPackageJson([string]$Path, [string]$Name) {
  $text = [IO.File]::ReadAllText($Path)
  $match = [regex]::Match($text, '("bundles"\s*:\s*\[)([\s\S]*?)(\])')
  if (-not $match.Success) { throw "Could not find a bundles array in $Path" }
  if ($match.Groups[2].Value -match [regex]::Escape('"' + $Name + '"')) { return $false }
  $inner = $match.Groups[2].Value.Trim()
  if ($inner.Length -eq 0) {
    $newInner = '"' + $Name + '"'
  } else {
    $newInner = $inner.TrimEnd().TrimEnd(',') + ', "' + $Name + '"'
  }
  $backup = "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $Path -Destination $backup -Force
  $text = $text.Substring(0, $match.Groups[2].Index) + $newInner + $text.Substring($match.Groups[2].Index + $match.Groups[2].Length)
  [IO.File]::WriteAllText($Path, $text, (New-Object Text.UTF8Encoding($false)))
  return $true
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
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files = @("index.js", "client.js", "package.json", "cordis.patch.yml", "README.md", "LICENSE", "install.ps1", "install.cmd", "uninstall.ps1", "uninstall.cmd")
foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $dest -Force
}
$scripts = Join-Path $PSScriptRoot "scripts"
if (Test-Path -LiteralPath $scripts) {
  Copy-Item -LiteralPath $scripts -Destination $dest -Recurse -Force
}
$obsolete = Join-Path $dest "scripts\shutdown-watch.ps1"
if (Test-Path -LiteralPath $obsolete) { Remove-Item -LiteralPath $obsolete -Force }


if (-not (Test-Path -LiteralPath $pkgPath)) { throw "package.json not found: $pkgPath" }
if (Add-BundleToPackageJson -Path $pkgPath -Name "dsh-voice-greeting") {
  Write-Host "Added dsh-voice-greeting to dsh.profile.bundles (backup created)"
} else {
  Write-Host "dsh-voice-greeting already in dsh.profile.bundles"
}

$yaml = @'
- id: dsh-voice-greeting
  name: 'dsh-voice-greeting'
  config:
    enabled: true
    startupAudio: ""
    shutdownAudio: ""
    startupAudios: []
    shutdownAudios: []
    shutdownServiceUrl: ""
    outputDevice: ""
    volume: 100
    fadeInMs: 30
    fadeOutMs: 80
    startupBlocking: false
    warmTts: true
    watchdogEnabled: true
    ffmpegPath: ""
    ttsPython: ""
    ttsServer: ""
    ttsHealth: ""
'@
if (Test-Path -LiteralPath $patch) {
  Copy-Item -LiteralPath $patch -Destination "$patch.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
  $existing = [IO.File]::ReadAllText($patch)
} else {
  $existing = ""
}
$existing = Remove-InnerPluginEntry -Text $existing -Id "dsh-voice-greeting"
if ($existing -notmatch '(?m)^- id:\s*["'']?dsh-voice-greeting') {
  if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { $existing += "`n" }
  $existing += $yaml
  Write-Host "Added top-level dsh-voice-greeting config to cordis.patch.yml (backup created)"
} else {
  Write-Host "Top-level dsh-voice-greeting config already exists in cordis.patch.yml"
}
if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { $existing += "`n" }
[IO.File]::WriteAllText($patch, $existing, (New-Object Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Installed to: $dest"
Write-Host "Next: fully quit and reopen DSH."
Write-Host "Then open Settings -> General -> startup / shutdown voice."
if ($Pause -and -not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
