# CreatorSpot updater: downloads the newest version from GitHub and copies it over this folder.
# Afterwards the browser still needs one click on the extension's reload arrow (browsers require that).
Add-Type -AssemblyName System.Windows.Forms
$folder = $PSScriptRoot
function Show-Message($text) { [void][System.Windows.Forms.MessageBox]::Show($text, 'Update CreatorSpot') }

try {
  $js = Get-Content (Join-Path $folder 'lib\shared.js') -Raw
  if ($js -notmatch "GITHUB_REPO = '([^']+)'" -or $Matches[1] -like 'OWNER/*') { throw 'This copy is not connected to GitHub.' }
  $repo = $Matches[1]
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $latest = (Invoke-RestMethod "https://raw.githubusercontent.com/$repo/main/extension/manifest.json?t=$stamp").version
  $current = (Get-Content (Join-Path $folder 'manifest.json') -Raw | ConvertFrom-Json).version
  if ([version]$latest -le [version]$current) { Show-Message "You already have the newest version ($current)."; exit }

  $tmp = Join-Path $env:TEMP ('creatorspot-update-' + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  $zip = Join-Path $tmp 'update.zip'
  Invoke-WebRequest "https://github.com/$repo/raw/main/downloads/CreatorSpot-for-Chrome.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip (Join-Path $tmp 'x')
  $src = Join-Path $tmp 'x\CreatorSpot'
  if (-not (Test-Path (Join-Path $src 'manifest.json'))) { throw 'The download looks wrong, so nothing was changed.' }
  Get-ChildItem $src | Copy-Item -Destination $folder -Recurse -Force
  try { & (Join-Path $folder 'register-updater.ps1') -Folder $folder } catch { } # turn on automatic updates from now on
  Remove-Item $tmp -Recurse -Force
  Show-Message "Updated to version $latest!`n`nLast step: open your browser's extensions page (chrome://extensions or brave://extensions) and click the circular reload arrow on CreatorSpot."
} catch {
  Show-Message "Could not update: $($_.Exception.Message)"
}
