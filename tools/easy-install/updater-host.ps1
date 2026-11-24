# CreatorSpot updater helper. The browser starts this when CreatorSpot asks to update itself
# (Chrome "native messaging"; only the CreatorSpot extension is allowed to talk to it).
# It does exactly one thing: download the newest CreatorSpot from GitHub and copy it into this folder.
# Messages are JSON with a 4-byte length in front, over stdin/stdout. Nothing else may be printed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$folder = $PSScriptRoot
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

function Read-Message {
  $len = New-Object byte[] 4
  if ($stdin.Read($len, 0, 4) -lt 4) { return $null }
  $n = [BitConverter]::ToInt32($len, 0)
  if ($n -le 0 -or $n -gt 65536) { return $null }
  $buf = New-Object byte[] $n
  $read = 0
  while ($read -lt $n) { $r = $stdin.Read($buf, $read, $n - $read); if ($r -le 0) { break }; $read += $r }
  return ([Text.Encoding]::UTF8.GetString($buf, 0, $read) | ConvertFrom-Json)
}

function Send-Message($obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  $stdout.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
  $stdout.Write($bytes, 0, $bytes.Length)
  $stdout.Flush()
}

function Read-Manifest($dir) { Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw | ConvertFrom-Json }

function Update-CreatorSpot($requestVersion) {
  $mine = Read-Manifest $folder
  # Only update the copy that asked (protects other copies on the same computer).
  if ($requestVersion -and $requestVersion -ne $mine.version) { return @{ ok = $false; message = 'This updater belongs to a different CreatorSpot folder.' } }
  $js = Get-Content -LiteralPath (Join-Path $folder 'lib\shared.js') -Raw
  if ($js -notmatch "GITHUB_REPO = '([^']+)'") { return @{ ok = $false; message = 'Update address not found.' } }
  $source = if ($env:CS_UPDATE_ZIP) { $env:CS_UPDATE_ZIP } else { "https://github.com/$($Matches[1])/raw/main/downloads/CreatorSpot-for-Chrome.zip" }

  $tmp = Join-Path $env:TEMP ('creatorspot-update-' + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    $zip = Join-Path $tmp 'update.zip'
    if ($source -match '^https://') {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $source -OutFile $zip -UseBasicParsing
    } else { Copy-Item -LiteralPath $source $zip }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'x')
    $src = Join-Path $tmp 'x\CreatorSpot'
    if (-not (Test-Path -LiteralPath (Join-Path $src 'manifest.json'))) { return @{ ok = $false; message = 'The download looks wrong, so nothing was changed.' } }
    $new = Read-Manifest $src
    if ($new.name -ne 'CreatorSpot' -or $new.key -ne $mine.key) { return @{ ok = $false; message = 'The download is not this CreatorSpot, so nothing was changed.' } }
    if ([version]$new.version -le [version]$mine.version) { return @{ ok = $true; version = $mine.version; updated = $false } }
    Get-ChildItem -LiteralPath $src | Copy-Item -Destination $folder -Recurse -Force
    return @{ ok = $true; version = $new.version; updated = $true }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

try {
  $msg = Read-Message
  if (-not $msg) { exit }
  switch ($msg.cmd) {
    'ping' { Send-Message @{ ok = $true; version = (Read-Manifest $folder).version } }
    'update' { Send-Message (Update-CreatorSpot $msg.version) }
    default { Send-Message @{ ok = $false; message = 'Unknown request.' } }
  }
} catch {
  try { Send-Message @{ ok = $false; message = $_.Exception.Message } } catch { }
}
