# Builds a ZIP to send to someone who uses Google Chrome (works for Edge/Brave too):
# a "CreatorSpot" folder with the extension, the install helper and Chrome instructions.
# Output: dist\CreatorSpot-<version>-for-Chrome.zip, plus a copy on the Desktop for easy sending.
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-share-zip.ps1
$root = Split-Path $PSScriptRoot -Parent
$ext = Join-Path $root 'extension'
$version = (Get-Content (Join-Path $ext 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

$stage = Join-Path $env:TEMP 'creatorspot-share'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
$folder = Join-Path $stage 'CreatorSpot'
New-Item -ItemType Directory -Force $folder | Out-Null
Get-ChildItem $ext | Where-Object { $_.Name -ne '_metadata' } | Copy-Item -Destination $folder -Recurse -Force
$helper = Join-Path $PSScriptRoot 'easy-install'
Copy-Item (Join-Path $helper 'Install CreatorSpot.cmd'), (Join-Path $helper 'install-helper.ps1'), (Join-Path $helper 'Update CreatorSpot.cmd'), (Join-Path $helper 'update-helper.ps1'), (Join-Path $helper 'START HERE (Chrome).txt') -Destination $folder -Force

$zip = Join-Path $dist "CreatorSpot-$version-for-Chrome.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item -Recurse -Force $stage

# Permanent download link in the repository (always the newest version).
$downloads = Join-Path $root 'downloads'
New-Item -ItemType Directory -Force $downloads | Out-Null
Copy-Item $zip (Join-Path $downloads 'CreatorSpot-for-Chrome.zip') -Force

$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) (Split-Path $zip -Leaf)
Copy-Item $zip $desktop -Force
Write-Output "Built $zip"
Write-Output "Copied to $desktop"
