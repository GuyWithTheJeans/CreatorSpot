@echo off
rem Double-click this file to download the newest CreatorSpot into this folder.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "%~dp0update-helper.ps1"
