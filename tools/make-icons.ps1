# Renders the CreatorSpot icon (gradient tile with a "spot" mark) at every size the stores need.
param([string]$Out = (Join-Path $PSScriptRoot '..\extension\icons'))
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Out | Out-Null

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}

foreach ($s in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.Clear([System.Drawing.Color]::Transparent)
  $pad = [Math]::Max(0.5, $s * 0.04)
  $tile = New-RoundRect $pad $pad ($s - 2 * $pad) ($s - 2 * $pad) ($s * 0.24)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(0, 0)), ([System.Drawing.PointF]::new($s, $s)), ([System.Drawing.Color]::FromArgb(255, 124, 92, 255)), ([System.Drawing.Color]::FromArgb(255, 244, 114, 182))
  $g.FillPath($brush, $tile)
  # Spark mark: a four-point star (the "spot" in the spotlight) plus a small companion spark.
  function Add-Spark($g, [float]$cx, [float]$cy, [float]$r, [float]$waist) {
    $pts = @()
    for ($k = 0; $k -lt 8; $k++) {
      $ang = [Math]::PI / 4 * $k - [Math]::PI / 2
      $rad = if ($k % 2 -eq 0) { $r } else { $r * $waist }
      $pts += [System.Drawing.PointF]::new($cx + $rad * [Math]::Cos($ang), $cy + $rad * [Math]::Sin($ang))
    }
    $g.FillPolygon([System.Drawing.Brushes]::White, $pts)
  }
  Add-Spark $g ($s * 0.46) ($s * 0.54) ($s * 0.33) 0.3
  if ($s -ge 32) { Add-Spark $g ($s * 0.75) ($s * 0.26) ($s * 0.12) 0.34 }
  $bmp.Save((Join-Path $Out "icon$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "Icons written to $Out"
