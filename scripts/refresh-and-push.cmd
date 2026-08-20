@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0refresh-and-push.ps1"
exit /b %ERRORLEVEL%
