$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"
$releaseDir = Join-Path $root "release"
$zipPath = Join-Path $releaseDir "chat-anchor.zip"

if (!(Test-Path $distDir)) {
  throw "dist folder not found. Run 'npm run build' first."
}

if (!(Test-Path $releaseDir)) {
  New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -Force
Write-Output "Created: $zipPath"
