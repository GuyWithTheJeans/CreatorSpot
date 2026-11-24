# CreatorSpot install helper: a small window that walks people through installing the extension.
# Browsers do not let programs install extensions on their own, so this copies the two things
# people need (the page address and the folder location) with one click each.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$folder = $PSScriptRoot
$browsers = [ordered]@{
  'Brave'          = @{ page = 'brave://extensions';  exe = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
  'Google Chrome'  = @{ page = 'chrome://extensions'; exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") }
  'Microsoft Edge' = @{ page = 'edge://extensions';   exe = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") }
  'Opera'          = @{ page = 'opera://extensions';  exe = @("$env:LOCALAPPDATA\Programs\Opera\opera.exe") }
}

$font = New-Object System.Drawing.Font('Segoe UI', 11)
$bold = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
$title = New-Object System.Drawing.Font('Segoe UI Semibold', 18)
$purple = [System.Drawing.Color]::FromArgb(124, 92, 255)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Install CreatorSpot'
$form.ClientSize = New-Object System.Drawing.Size(560, 560)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$icon = Join-Path $folder 'icons\icon48.png'
if (Test-Path $icon) { $form.Icon = [System.Drawing.Icon]::FromHandle(([System.Drawing.Bitmap]::FromFile($icon)).GetHicon()) }

function Add-Label($text, $x, $y, $w, $h, $f, $color) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h); $l.Font = $f
  if ($color) { $l.ForeColor = $color }
  $form.Controls.Add($l); return $l
}
function Add-Button($text, $x, $y, $w) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y); $b.Size = New-Object System.Drawing.Size($w, 38); $b.Font = $bold
  $b.BackColor = $purple; $b.ForeColor = [System.Drawing.Color]::White; $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderSize = 0
  $b.Cursor = [System.Windows.Forms.Cursors]::Hand
  $form.Controls.Add($b); return $b
}

Add-Label 'Install CreatorSpot' 24 18 500 40 $title $purple | Out-Null
Add-Label 'Which browser do you use?' 24 66 220 26 $font | Out-Null
$pick = New-Object System.Windows.Forms.ComboBox
$pick.DropDownStyle = 'DropDownList'; $pick.Font = $font
$pick.Location = New-Object System.Drawing.Point(250, 63); $pick.Size = New-Object System.Drawing.Size(200, 30)
$browsers.Keys | ForEach-Object { [void]$pick.Items.Add($_) }
$default = ($browsers.Keys | Where-Object { $browsers[$_].exe | Where-Object { Test-Path $_ } } | Select-Object -First 1)
$pick.SelectedItem = if ($default) { $default } else { 'Brave' }
$form.Controls.Add($pick)

$step1 = Add-Label '' 24 112 512 50 $font
$copyPage = Add-Button 'Copy page address' 24 162 230
Add-Label '2.  Turn ON the "Developer mode" switch (top-right of that page).' 24 222 512 50 $font | Out-Null
Add-Label '3.  Click "Load unpacked". A folder window opens. Click this button, then click the "Folder" box at the bottom of that window, press Ctrl+V, then click "Select Folder".' 24 278 512 72 $font | Out-Null
$copyFolder = Add-Button 'Copy folder location' 24 352 230
Add-Label '4.  Done! A welcome page opens. Click the puzzle-piece icon in your toolbar and pin CreatorSpot so it is easy to find.' 24 412 512 50 $font | Out-Null
$status = Add-Label '' 24 470 512 26 $bold ([System.Drawing.Color]::FromArgb(22, 163, 74))
Add-Label 'Keep this CreatorSpot folder where it is. If you move or delete it, the extension stops working.' 24 500 512 44 (New-Object System.Drawing.Font('Segoe UI', 9)) ([System.Drawing.Color]::DimGray) | Out-Null

function Update-Step1 {
  $page = $browsers[$pick.SelectedItem].page
  $step1.Text = "1.  Open $($pick.SelectedItem). Click this button, then click the address bar, press Ctrl+V and press Enter."
  $copyPage.Tag = $page
}
$pick.Add_SelectedIndexChanged({ Update-Step1 })
Update-Step1

$copyPage.Add_Click({
  [System.Windows.Forms.Clipboard]::SetText($copyPage.Tag)
  $status.Text = "Copied: $($copyPage.Tag). Now paste it into the address bar."
})
$copyFolder.Add_Click({
  [System.Windows.Forms.Clipboard]::SetText($folder)
  $status.Text = 'Copied the folder location. Now paste it into the Folder box.'
})

[void]$form.ShowDialog()
