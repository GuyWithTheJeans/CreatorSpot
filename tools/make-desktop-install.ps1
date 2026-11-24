# Creates (or updates) a ready-to-install CreatorSpot folder: the extension plus the easy-install helper.
# Default location: the Desktop. Usage: powershell -ExecutionPolicy Bypass -File tools\make-desktop-install.ps1 [target]
param([string]$Target = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'CreatorSpot'))
$root = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force $Target | Out-Null
Get-ChildItem (Join-Path $root 'extension') | Where-Object { $_.Name -ne '_metadata' } | Copy-Item -Destination $Target -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'easy-install\*') -Destination $Target -Force
Copy-Item (Join-Path $root 'docs/install/*') (New-Item -ItemType Directory -Force (Join-Path $Target 'guide')) -Force
Write-Output "Ready: $Target"
