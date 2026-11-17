@echo off
rem PDF Master desktop launcher: builds if needed, serves the production bundle
rem and opens it in a frameless Edge/Chrome app window.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-desktop.ps1" %*
if errorlevel 1 pause
endlocal
