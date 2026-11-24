# Lets CreatorSpot update itself: tells Chrome, Brave and Edge where the CreatorSpot updater helper is.
# Writes only to this user's registry (no admin needed). Run by "Install CreatorSpot" and "Update CreatorSpot".
param([string]$Folder = $PSScriptRoot)
$name = 'com.creatorspot.updater'
$extensionId = 'phchmcdididanfibnlljclfkppdjfagh' # fixed by the "key" in manifest.json
$hostManifest = Join-Path $Folder 'updater-host.json'
$json = [ordered]@{
  name = $name
  description = 'CreatorSpot updater'
  path = (Join-Path $Folder 'updater-host.bat')
  type = 'stdio'
  allowed_origins = @("chrome-extension://$extensionId/")
} | ConvertTo-Json
[System.IO.File]::WriteAllText($hostManifest, $json)
foreach ($browser in 'Google\Chrome', 'BraveSoftware\Brave-Browser', 'Microsoft\Edge', 'Chromium') {
  New-Item -Path "HKCU:\Software\$browser\NativeMessagingHosts\$name" -Value $hostManifest -Force | Out-Null
}
