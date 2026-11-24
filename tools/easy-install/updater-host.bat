@echo off
rem CreatorSpot updater helper, started by the browser when CreatorSpot updates itself.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0updater-host.ps1"
