# CreatorSpot install guide: a pop-up window that walks people through installing, one picture per step.
# Browsers do not let programs install extensions (only the Chrome Web Store can), so this shows exactly
# what to click and copies the two things people need to paste.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$folder = $PSScriptRoot
$guide = Join-Path $folder 'guide'
$browsers = [ordered]@{
  'Google Chrome'  = @{ page = 'chrome://extensions'; exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") }
  'Brave'          = @{ page = 'brave://extensions';  exe = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
  'Microsoft Edge' = @{ page = 'edge://extensions';   exe = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") }
  'Opera'          = @{ page = 'opera://extensions';  exe = @("$env:LOCALAPPDATA\Programs\Opera\opera.exe") }
}

# If this window was started from inside the ZIP (not unzipped yet), stop and explain.
if (-not (Test-Path (Join-Path $folder 'manifest.json'))) {
  [void][System.Windows.Forms.MessageBox]::Show(
    "Almost! You need to unzip CreatorSpot first.`n`n1. Close this message and the ZIP window.`n2. Right-click the CreatorSpot ZIP file and click 'Extract All...'`n3. Click 'Browse...', pick 'Desktop', then click 'Extract'.`n4. Open the new CreatorSpot folder on your Desktop and double-click 'Install CreatorSpot' again.",
    'Install CreatorSpot', 'OK', 'Information')
  exit
}

# Set up automatic updates (registers the CreatorSpot updater helper for this user; no admin needed).
try { & (Join-Path $folder 'register-updater.ps1') -Folder $folder } catch { }

# CreatorSpot colors (same as the dashboard's dark theme).
function RGB($r, $g, $b) { [System.Drawing.Color]::FromArgb($r, $g, $b) }
$cBg = RGB 13 13 20; $cSurface = RGB 22 22 31; $cSurface2 = RGB 30 30 42; $cBorder = RGB 42 42 57
$cText = RGB 243 242 250; $cText2 = RGB 180 178 198; $cInk = RGB 183 166 255; $cSoft = RGB 36 29 69
$cPurple = RGB 124 92 255; $cPink = RGB 244 114 182; $cGreen = RGB 74 222 128
$fBrand = New-Object System.Drawing.Font('Segoe UI Semibold', 15)
$fTitle = New-Object System.Drawing.Font('Segoe UI Semibold', 21)
$fStep = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
$fText = New-Object System.Drawing.Font('Segoe UI', 13)
$fBtn = New-Object System.Drawing.Font('Segoe UI Semibold', 12)
$fSmall = New-Object System.Drawing.Font('Segoe UI', 10)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Install CreatorSpot'
$form.ClientSize = New-Object System.Drawing.Size(900, 780)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = $cBg
$form.ForeColor = $cText
$form.TopMost = $true
$icon = Join-Path $folder 'icons\icon48.png'
if (Test-Path $icon) { $form.Icon = [System.Drawing.Icon]::FromHandle(([System.Drawing.Bitmap]::FromFile($icon)).GetHicon()) }

function Fill-Gradient($g, $rect) {
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $cPurple, $cPink, [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
  $g.FillRectangle($brush, $rect); $brush.Dispose()
}

# Header: purple-to-pink band with the CreatorSpot logo, like the dashboard.
$header = New-Object System.Windows.Forms.Panel
$header.Location = New-Object System.Drawing.Point(0, 0); $header.Size = New-Object System.Drawing.Size(900, 64)
$header.Add_Paint({ param($s, $e) Fill-Gradient $e.Graphics (New-Object System.Drawing.Rectangle(0, 0, $s.Width, $s.Height)) })
$form.Controls.Add($header)
$logo = New-Object System.Windows.Forms.PictureBox
$logo.Location = New-Object System.Drawing.Point(22, 14); $logo.Size = New-Object System.Drawing.Size(36, 36); $logo.SizeMode = 'Zoom'; $logo.BackColor = [System.Drawing.Color]::Transparent
$logoFile = Join-Path $folder 'icons\icon128.png'
if (Test-Path $logoFile) { $logo.Image = [System.Drawing.Image]::FromFile($logoFile) }
$header.Controls.Add($logo)
$brand = New-Object System.Windows.Forms.Label
$brand.Text = 'CreatorSpot'; $brand.Font = $fBrand; $brand.ForeColor = [System.Drawing.Color]::White; $brand.BackColor = [System.Drawing.Color]::Transparent
$brand.Location = New-Object System.Drawing.Point(66, 16); $brand.Size = New-Object System.Drawing.Size(300, 34)
$header.Controls.Add($brand)
$stepLabel = New-Object System.Windows.Forms.Label
$stepLabel.Font = $fStep; $stepLabel.ForeColor = [System.Drawing.Color]::White; $stepLabel.BackColor = [System.Drawing.Color]::Transparent; $stepLabel.TextAlign = 'MiddleRight'
$stepLabel.Location = New-Object System.Drawing.Point(560, 18); $stepLabel.Size = New-Object System.Drawing.Size(316, 30)
$header.Controls.Add($stepLabel)

# Progress bar under the header.
$progress = New-Object System.Windows.Forms.Panel
$progress.Location = New-Object System.Drawing.Point(0, 64); $progress.Size = New-Object System.Drawing.Size(900, 6); $progress.BackColor = $cSurface2
$progress.Add_Paint({ param($s, $e)
  $w = [int]($s.Width * ($script:i / [double]($steps.Count - 1)))
  if ($w -gt 0) { Fill-Gradient $e.Graphics (New-Object System.Drawing.Rectangle(0, 0, $w, $s.Height)) }
})
$form.Controls.Add($progress)

function New-Label($x, $y, $w, $h, $font, $color) {
  $l = New-Object System.Windows.Forms.Label
  $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h); $l.Font = $font
  $l.ForeColor = if ($color) { $color } else { $cText }
  $l.BackColor = [System.Drawing.Color]::Transparent
  $form.Controls.Add($l); return $l
}
function New-Button($text, $x, $y, $w, $kind) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y); $b.Size = New-Object System.Drawing.Size($w, 48); $b.Font = $fBtn
  $b.FlatStyle = 'Flat'; $b.Cursor = [System.Windows.Forms.Cursors]::Hand; $b.UseVisualStyleBackColor = $false
  if ($kind -eq 'primary') {
    $b.FlatAppearance.BorderSize = 0; $b.ForeColor = [System.Drawing.Color]::White
    $b.Add_Paint({ param($s, $e)
      Fill-Gradient $e.Graphics (New-Object System.Drawing.Rectangle(0, 0, $s.Width, $s.Height))
      [System.Windows.Forms.TextRenderer]::DrawText($e.Graphics, $s.Text, $s.Font, (New-Object System.Drawing.Rectangle(0, 0, $s.Width, $s.Height)), [System.Drawing.Color]::White, [System.Windows.Forms.TextFormatFlags]'HorizontalCenter, VerticalCenter')
    })
  } elseif ($kind -eq 'soft') {
    $b.BackColor = $cSoft; $b.ForeColor = $cInk; $b.FlatAppearance.BorderColor = $cPurple
  } else {
    $b.BackColor = $cSurface2; $b.ForeColor = $cText; $b.FlatAppearance.BorderColor = $cBorder
  }
  $form.Controls.Add($b); return $b
}

$title = New-Label 24 86 852 44 $fTitle $cText
$text = New-Label 24 136 852 96 $fText $cText2

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Location = New-Object System.Drawing.Point(24, 236); $pic.Size = New-Object System.Drawing.Size(852, 420)
$pic.SizeMode = 'Zoom'; $pic.BackColor = $cSurface
$form.Controls.Add($pic)

# Welcome page widgets (the apology note and the browser picker).
$sorry = New-Label 24 240 852 104 $fText $cText
$sorry.BackColor = $cSoft
$sorry.Padding = New-Object System.Windows.Forms.Padding(18, 16, 18, 16)
$sorry.Text = "Sorry this takes a few steps! Right now this is the easiest way to install CreatorSpot. Chrome and Brave only allow one-click installs from the Chrome Web Store, so for now you install it by hand. It takes about 2 minutes, you only do it once, and this window shows you every click."
$sorryBar = New-Object System.Windows.Forms.Panel
$sorryBar.Location = New-Object System.Drawing.Point(24, 240); $sorryBar.Size = New-Object System.Drawing.Size(6, 104); $sorryBar.BackColor = $cPink
$form.Controls.Add($sorryBar); $sorryBar.BringToFront()
$pickLabel = New-Label 24 384 300 32 $fText $cText
$pickLabel.Text = 'Which browser do you use?'
$pick = New-Object System.Windows.Forms.ComboBox
$pick.DropDownStyle = 'DropDownList'; $pick.Font = $fText; $pick.FlatStyle = 'Flat'; $pick.BackColor = $cSurface2; $pick.ForeColor = $cText
$pick.Location = New-Object System.Drawing.Point(330, 380); $pick.Size = New-Object System.Drawing.Size(260, 34)
$browsers.Keys | ForEach-Object { [void]$pick.Items.Add($_) }
$installed = $browsers.Keys | Where-Object { $browsers[$_].exe | Where-Object { Test-Path $_ } }
$pick.SelectedItem = if ($installed) { @($installed)[0] } else { 'Google Chrome' }
$form.Controls.Add($pick)
$pickNote = New-Label 24 432 852 60 $fSmall $cText2
$pickNote.Text = 'The pictures show Google Chrome. Brave, Edge and Opera look almost the same.'

$action = New-Button '' 24 668 330 'soft'
$status = New-Label 370 678 506 30 $fSmall $cGreen
$back = New-Button 'Back' 556 716 150 'plain'
$next = New-Button 'Next' 726 716 150 'primary'

# Last step: "Buy us a doughnut" (GuyWithTheJeans' Streamlabs tip page).
$donut = New-Object System.Windows.Forms.LinkLabel
$donut.Text = 'Enjoying CreatorSpot? Buy us a doughnut'
$donut.Font = $fBtn; $donut.LinkColor = $cPink; $donut.ActiveLinkColor = $cInk; $donut.BackColor = [System.Drawing.Color]::Transparent
$donut.Location = New-Object System.Drawing.Point(24, 728); $donut.Size = New-Object System.Drawing.Size(500, 30)
$donut.Add_LinkClicked({ Start-Process 'https://streamlabs.com/guywiththejeans1/tip' })
$form.Controls.Add($donut)

function Copy-Text($value, $message) {
  [System.Windows.Forms.Clipboard]::SetText($value)
  $status.Text = $message
}

$steps = @(
  @{ title = 'Install CreatorSpot'; welcome = $true },
  @{ title = 'Open your extensions page'; img = '03-developer-mode.png'
     text = { "Open $($pick.SelectedItem). Click the address bar at the top, type  $($browsers[$pick.SelectedItem].page)  and press Enter.`nOr click the button below, click the address bar, press Ctrl+V, then Enter." }
     action = 'Copy the page address'; do = { Copy-Text $browsers[$pick.SelectedItem].page ('Copied! Paste it in the address bar (Ctrl+V) and press Enter.') } },
  @{ title = 'Turn ON "Developer mode"'; img = '03-developer-mode.png'
     text = { 'On that page, click the "Developer mode" switch in the top-right corner so it turns blue. (In Edge it is on the left side.)' } },
  @{ title = 'Click "Load unpacked"'; img = '04-load-unpacked.png'
     text = { 'New buttons appear at the top. Click "Load unpacked". A window opens where you pick a folder.' } },
  @{ title = 'Pick the CreatorSpot folder'; img = '05-pick-folder.png'
     text = { 'Click "Desktop" on the left, click the CreatorSpot folder ONCE, then click "Select Folder".' + "`n" + 'Can''t find it? Click the button below, click the "Folder" box, press Ctrl+V, then "Select Folder".' }
     action = 'Copy the folder location'; do = { Copy-Text $folder 'Copied! Paste it in the "Folder" box (Ctrl+V).' } },
  @{ title = 'CreatorSpot is installed!'; img = '06-installed.png'
     text = { 'CreatorSpot now shows on the extensions page. Make sure its switch is blue (on). A welcome page also opens; you can close it.' } },
  @{ title = 'Pin it to your toolbar'; img = '07-pin.png'
     text = { 'Click the puzzle piece at the top right of your browser, then click the pin next to CreatorSpot. Now its icon is always one click away.' } },
  @{ title = 'Streamers: sign in with Twitch'; img = '08-sign-in.png'
     text = { 'Just watching? You are done! Skip this step.' + "`n" + 'Streamers: click the CreatorSpot icon, then "Open dashboard" > "Creators" > "Sign in with Twitch". Then "Edit my profile" to add your links and promos.' } },
  @{ title = 'All done!'; img = '06-installed.png'
     text = { 'CreatorSpot is working. Visit any site with ads to see creator promos.' + "`n" + 'Updates install themselves. Leave Developer mode ON and keep this folder on your Desktop, and you will never have to reinstall.' } }
)

$script:i = 0
function Show-Step {
  $s = $steps[$script:i]
  $stepLabel.Text = if ($s.welcome) { 'About 2 minutes' } else { "Step $($script:i) of $($steps.Count - 1)" }
  $title.Text = $s.title
  $status.Text = ''
  $welcome = [bool]$s.welcome
  foreach ($c in @($sorry, $sorryBar, $pickLabel, $pick, $pickNote)) { $c.Visible = $welcome }
  $pic.Visible = -not $welcome
  if ($welcome) {
    $text.Text = 'CreatorSpot shows promos for independent streamers in the ad spaces on websites. This window walks you through installing it, one picture at a time.'
  } else {
    $text.Text = & $s.text
    $file = Join-Path $guide $s.img
    if ($pic.Image) { $pic.Image.Dispose(); $pic.Image = $null }
    if (Test-Path $file) { $pic.Image = [System.Drawing.Image]::FromFile($file) }
  }
  $donut.Visible = $script:i -eq $steps.Count - 1
  $action.Visible = [bool]$s.action
  if ($s.action) { $action.Text = $s.action }
  $back.Enabled = $script:i -gt 0
  $progress.Invalidate()
  $next.Text = if ($script:i -eq $steps.Count - 1) { 'Finish' } elseif ($welcome) { 'Start' } else { 'Next' }
}

$action.Add_Click({ $s = $steps[$script:i]; if ($s.do) { & $s.do } })
$next.Add_Click({ if ($script:i -ge $steps.Count - 1) { $form.Close() } else { $script:i++; Show-Step } })
$back.Add_Click({ if ($script:i -gt 0) { $script:i--; Show-Step } })

Show-Step
# For checking the guide: CS_GUIDE_SNAP=<folder> saves a picture of every screen instead of showing the window.
if ($env:CS_GUIDE_SNAP) {
  $form.Show(); [System.Windows.Forms.Application]::DoEvents()
  for ($script:i = 0; $script:i -lt $steps.Count; $script:i++) {
    Show-Step; [System.Windows.Forms.Application]::DoEvents()
    $bmp = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
    $form.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
    $bmp.Save((Join-Path $env:CS_GUIDE_SNAP ('screen-' + $script:i + '.png')))
    $bmp.Dispose()
  }
  $form.Close(); exit
}
[void]$form.ShowDialog()
