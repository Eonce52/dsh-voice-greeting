param(
  [string]$Version = "",
  [string]$OutDir = ""
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Version)) {
  $pkg = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $Version = [string]$pkg.version
}
if ([string]::IsNullOrWhiteSpace($Version)) { throw "Could not determine package version" }
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $root "dist" }

$stage = Join-Path $OutDir "stage-$Version\dsh-voice-greeting"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage "scripts") | Out-Null

$files = @(
  "index.js", "client.js", "cordis.patch.yml", "README.md", "LICENSE", "package.json",
  "install.ps1", "install.cmd", "uninstall.ps1", "uninstall.cmd"
)
foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $root $name) -Destination $stage -Force
}
Copy-Item -LiteralPath (Join-Path $root "scripts\play-wav.ps1") -Destination (Join-Path $stage "scripts") -Force
Copy-Item -LiteralPath (Join-Path $root "scripts\shutdown-watch.vbs") -Destination (Join-Path $stage "scripts") -Force

$zip = Join-Path $OutDir "dsh-voice-greeting-$Version.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath $stage -DestinationPath $zip -Force
Write-Host "Built: $zip"
