# Raster counterparts of public/favicon.svg. Run with Windows PowerShell.
param([string]$ProjectRoot = (Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.Drawing
$iconRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot 'public'))
$null = New-Item -ItemType Directory -Path (Join-Path $iconRoot 'icons') -Force
$green = [System.Drawing.ColorTranslator]::FromHtml('#365b46')

function Save-MugIcon([int]$size, [string]$name, [bool]$maskable) {
  $large = $size * 4
  $bitmap = New-Object System.Drawing.Bitmap($large, $large)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform($large / 64.0, $large / 64.0)
  $brush = New-Object System.Drawing.SolidBrush($green)
  $background = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($maskable) {
    $graphics.Clear($green)
    $graphics.TranslateTransform(4.48, 4.48)
    $graphics.ScaleTransform(0.86, 0.86)
  } else {
    $background.AddArc(0, 0, 34, 34, 180, 90)
    $background.AddArc(30, 0, 34, 34, 270, 90)
    $background.AddArc(30, 30, 34, 34, 0, 90)
    $background.AddArc(0, 30, 34, 34, 90, 90)
    $background.CloseFigure()
    $graphics.FillPath($brush, $background)
  }
  $handle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $handle.AddLine(39, 24, 43, 24)
  $handle.AddArc(35, 24, 16, 16, -90, 180)
  $handle.AddLine(43, 40, 39, 40)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($pen, $handle)
  $body = New-Object System.Drawing.Drawing2D.GraphicsPath
  $body.AddLine(14, 18, 39, 18)
  $body.AddLine(39, 18, 39, 40)
  $body.AddArc(25, 33, 14, 14, 0, 90)
  $body.AddLine(32, 47, 21, 47)
  $body.AddArc(14, 33, 14, 14, 90, 90)
  $body.CloseFigure()
  $graphics.FillPath([System.Drawing.Brushes]::White, $body)
  $output = New-Object System.Drawing.Bitmap($size, $size)
  $resizer = [System.Drawing.Graphics]::FromImage($output)
  $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizer.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $resizer.DrawImage($bitmap, 0, 0, $size, $size)
  $output.Save((Join-Path $iconRoot $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $resizer.Dispose(); $output.Dispose(); $body.Dispose(); $pen.Dispose()
  $handle.Dispose(); $background.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

Save-MugIcon 32 'favicon.png' $false
Save-MugIcon 192 'icons\icon-192.png' $false
Save-MugIcon 512 'icons\icon-512.png' $false
Save-MugIcon 512 'icons\icon-maskable-512.png' $true
Save-MugIcon 180 'icons\apple-touch-icon.png' $true
Write-Output 'Ícones de caneca gerados em public/.'
