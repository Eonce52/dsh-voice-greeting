param(
  [string]$DshHome = "",
  [string]$Profile = "web-desktop",
  [switch]$NoPause
)
$ErrorActionPreference = "Stop"

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


function Find-DshHome {
  $base = Join-Path $env:APPDATA "com.deepseek.dsh.desktop.aio\releases"
  if (-not (Test-Path $base)) { throw "DSH releases folder not found: $base" }
  $candidates = @(
    Get-ChildItem $base -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "dsh-home" } |
      Where-Object { Test-Path (Join-Path $_ "profiles\$Profile") }
  )
  if ($candidates.Count -eq 0) { throw "No dsh-home profile '$Profile' found under $base" }
  return [string]($candidates | Select-Object -First 1)
}

if ([string]::IsNullOrWhiteSpace($DshHome)) {
  if ($env:DSH_HOME -and (Test-Path (Join-Path $env:DSH_HOME "profiles\$Profile"))) {
    $DshHome = $env:DSH_HOME
  } else {
    $DshHome = Find-DshHome
  }
}
$profileDir = Join-Path $DshHome "profiles\$Profile"
if (-not (Test-Path $profileDir)) { throw "Profile not found: $profileDir" }

$dest = Join-Path $profileDir "node_modules\dsh-voice-greeting"
$patch = Join-Path $profileDir "cordis.patch.yml"
$pkgPath = Join-Path $profileDir "package.json"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files = @("index.js", "client.js", "package.json", "cordis.patch.yml", "README.md", "LICENSE", "install.ps1")
foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $dest -Force
}
$scripts = Join-Path $PSScriptRoot "scripts"
if (Test-Path $scripts) {
  Copy-Item -LiteralPath $scripts -Destination $dest -Recurse -Force
}

# Canonical registration: bundle + top-level profile override.
# The bundle patch registers the plugin; the top-level id patches its config.
if (-not (Test-Path $pkgPath)) { throw "package.json not found: $pkgPath" }
$pkg = Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json
$bundles = @($pkg.dsh.profile.bundles)
if ($bundles -notcontains "dsh-voice-greeting") {
  $pkg.dsh.profile.bundles = @($bundles + "dsh-voice-greeting")
  $json = $pkg | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($pkgPath, $json, [Text.UTF8Encoding]::new($false))
  Write-Host "Added dsh-voice-greeting to dsh.profile.bundles"
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
    shutdownServiceUrl: ""
    outputDevice: ""
    volume: 100
    fadeInMs: 30
    fadeOutMs: 80
'@
$existing = if (Test-Path $patch) { [IO.File]::ReadAllText($patch) } else { "" }
$existing = Remove-InnerPluginEntry -Text $existing -Id "dsh-voice-greeting"
if ($existing -notmatch '(?m)^- id:\s*["'']?dsh-voice-greeting') {
  if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { $existing += "`n" }
  $existing += $yaml
  Write-Host "Added top-level dsh-voice-greeting config to cordis.patch.yml"
} else {
  Write-Host "Top-level dsh-voice-greeting config already exists in cordis.patch.yml"
}
[IO.File]::WriteAllText($patch, $existing, [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Installed to: $dest"
Write-Host "Next: fully quit and reopen DSH."
Write-Host "Then open Settings -> General -> 启动 / 关闭语音 and set your WAV paths."
if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
