@echo off
setlocal

set "NODE_RUNTIME=%LOCALAPPDATA%\Programs\node-v24.20.0-win-x64"
if defined ASU_REFRESH_NODE_DIR set "NODE_RUNTIME=%ASU_REFRESH_NODE_DIR%"

if not exist "%NODE_RUNTIME%\node.exe" (
  echo Node v24.20.0 was not found at %NODE_RUNTIME% 1>&2
  echo Install the pinned runtime before running the refresh task. 1>&2
  exit /b 1
)

"%NODE_RUNTIME%\node.exe" "%~dp0verify-node-runtime.js"
if errorlevel 1 exit /b %ERRORLEVEL%

set "PATH=%NODE_RUNTIME%;%PATH%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0refresh-and-push.ps1"
exit /b %ERRORLEVEL%
