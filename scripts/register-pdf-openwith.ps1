# Registers PDF Master in the per-user "Open with" list for .pdf files.
# Per-user only (HKCU): no administrator rights, no default-association takeover.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-pdf-openwith.ps1

$ErrorActionPreference = "Stop"

$candidates = @(
  (Join-Path $PSScriptRoot "..\src-tauri\target\release\pdf-master.exe"),
  (Join-Path $PSScriptRoot "..\src-tauri\target\debug\pdf-master.exe")
) | ForEach-Object { [System.IO.Path]::GetFullPath($_) }

$exe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) {
  Write-Error "No pdf-master.exe found. Build the desktop app first: npm run tauri build"
  exit 1
}

$command = '"' + $exe + '" "%1"'

# The application entry that the modern "Select an app to open this .pdf file" dialog lists.
$appKey = "HKCU:\Software\Classes\Applications\pdf-master.exe"
New-Item -Path "$appKey\SupportedTypes" -Force | Out-Null
New-ItemProperty -Path $appKey -Name "FriendlyAppName" -Value "PDF Master" -PropertyType String -Force | Out-Null
New-ItemProperty -Path "$appKey\SupportedTypes" -Name ".pdf" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$appKey\shell\open\command" -Force | Out-Null
New-ItemProperty -Path "$appKey\shell\open\command" -Name "(Default)" -Value $command -PropertyType String -Force | Out-Null

# A ProgID the .pdf OpenWithProgids list can point at.
$progId = "HKCU:\Software\Classes\PDFMaster.Document"
New-Item -Path "$progId\shell\open\command" -Force | Out-Null
New-ItemProperty -Path $progId -Name "(Default)" -Value "PDF Master Document" -PropertyType String -Force | Out-Null
New-ItemProperty -Path "$progId\shell\open\command" -Name "(Default)" -Value $command -PropertyType String -Force | Out-Null
New-Item -Path "$progId\DefaultIcon" -Force | Out-Null
New-ItemProperty -Path "$progId\DefaultIcon" -Name "(Default)" -Value ('"' + $exe + '",0') -PropertyType String -Force | Out-Null

# Offer PDF Master for .pdf files without changing the user's current default.
New-Item -Path "HKCU:\Software\Classes\.pdf\OpenWithProgids" -Force | Out-Null
New-ItemProperty -Path "HKCU:\Software\Classes\.pdf\OpenWithProgids" -Name "PDFMaster.Document" -Value ([byte[]]@()) -PropertyType Binary -Force | Out-Null
New-Item -Path "HKCU:\Software\Classes\.pdf\OpenWithList" -Force | Out-Null
New-ItemProperty -Path "HKCU:\Software\Classes\.pdf\OpenWithList" -Name "pdf-master.exe" -Value "" -PropertyType String -Force | Out-Null

# Tell Explorer the association list changed.
Add-Type -Namespace PdfMaster -Name Shell32 -MemberDefinition @'
[DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);
'@
[PdfMaster.Shell32]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Registered PDF Master for .pdf files:"
Write-Host "  $exe"
Write-Host 'Right-click a .pdf -> Open with -> Choose another app -> PDF Master.'
