# Builds store-ready ZIP files from the extension folder.
#   dist\creatorspot-<version>-chromium.zip  -> Chrome Web Store, Edge Add-ons, Opera, Brave (uses Chrome Web Store)
#   dist\creatorspot-<version>-firefox.zip   -> addons.mozilla.org (same code; Firefox reads background.scripts)
$root = Split-Path $PSScriptRoot -Parent
$ext = Join-Path $root 'extension'
$manifest = Get-Content (Join-Path $ext 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

foreach ($target in 'chromium', 'firefox') {
  $zip = Join-Path $dist "creatorspot-$version-$target.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  # ZIP the *contents* of the folder so manifest.json sits at the archive root, as the stores require.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  # Stage a clean copy without browser-generated caches (_metadata), which stores reject.
  $stage = Join-Path $env:TEMP ('creatorspot-stage-' + $target)
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  Copy-Item $ext $stage -Recurse
  if (Test-Path (Join-Path $stage '_metadata')) { Remove-Item -Recurse -Force (Join-Path $stage '_metadata') }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Remove-Item -Recurse -Force $stage
  Write-Output "Built $zip"
}
