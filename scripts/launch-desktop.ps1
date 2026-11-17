# Builds the production bundle when stale, serves it locally and opens PDF Master
# in a frameless Chromium app window. Uses only Windows PowerShell + Edge/Chrome.
param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$port = 4173
$url = "http://localhost:$port/"

function Test-Preview {
  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1).StatusCode -eq 200
  } catch {
    return $false
  }
}

$index = Join-Path $root "dist\index.html"
$needsBuild = $Rebuild -or -not (Test-Path $index)
if (-not $needsBuild) {
  $inputs = Get-ChildItem -Recurse -File -Path (Join-Path $root "src"), (Join-Path $root "public"), (Join-Path $root "index.html"), (Join-Path $root "vite.config.ts")
  $needsBuild = [bool]($inputs | Where-Object { $_.LastWriteTime -gt (Get-Item $index).LastWriteTime } | Select-Object -First 1)
}

$server = $null
if (-not (Test-Preview)) {
  if ($needsBuild) {
    Write-Host "Building PDF Master..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The production build failed. Run 'npm run build' to see the error." }
  }
  Write-Host "Starting the PDF Master preview server on port $port..."
  $server = Start-Process -FilePath "node" `
    -ArgumentList "node_modules/vite/bin/vite.js", "preview", "--port", "$port", "--strictPort" `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru

  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Preview)) {
    if ((Get-Date) -gt $deadline) {
      if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
      throw "The preview server did not start on $url"
    }
    Start-Sleep -Milliseconds 300
  }
}

$browser = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

$profileDir = Join-Path $env:LOCALAPPDATA "PDFMaster\DesktopProfile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

if ($browser) {
  Write-Host "Opening PDF Master in an app window..."
  $arguments = @(
    "--app=$url",
    "--window-size=1440,900",
    "--user-data-dir=$profileDir",
    "--no-first-run",
    "--no-default-browser-check"
  )
  $app = Start-Process -FilePath $browser -ArgumentList $arguments -PassThru
  try { Wait-Process -Id $app.Id -ErrorAction Stop } catch { }
} else {
  Write-Host "No Edge or Chrome found; opening in the default browser."
  Start-Process $url
}

if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
