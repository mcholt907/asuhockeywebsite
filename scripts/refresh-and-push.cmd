@echo off
REM Automated weekly refresh of alumni + transfer fallback JSON.
REM Run by Windows Task Scheduler from the user's residential IP.
REM
REM Behavior:
REM   - Pulls latest main
REM   - Runs npm run refresh-data
REM   - If fallback JSON files changed, commits and pushes
REM   - Logs to .refresh-log.txt (one line per run)
REM   - Exits non-zero on any failure; existing JSON is preserved

setlocal
cd /d "%~dp0\.."

set LOG=.refresh-log.txt

echo ---------------------------------------------------------------- >> %LOG%
echo %DATE% %TIME% — refresh starting >> %LOG%

git fetch origin >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — git fetch failed >> %LOG%
  exit /b 1
)

git checkout main >> %LOG% 2>&1
git pull --ff-only origin main >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — git pull failed (uncommitted local work?) >> %LOG%
  exit /b 1
)

call npm run refresh-data >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — refresh-data failed; preserving existing JSON >> %LOG%
  exit /b 1
)

git diff --quiet -- data\asu_alumni_fallback.json data\asu_transfers_fallback.json
if errorlevel 1 (
  git add data\asu_alumni_fallback.json data\asu_transfers_fallback.json
  git commit -m "data: refresh alumni and transfer fallbacks (automated)" >> %LOG% 2>&1
  git push origin main >> %LOG% 2>&1
  if errorlevel 1 (
    echo %DATE% %TIME% — git push failed >> %LOG%
    exit /b 1
  )
  echo %DATE% %TIME% — refreshed and pushed >> %LOG%
) else (
  echo %DATE% %TIME% — no data changes >> %LOG%
)

endlocal
exit /b 0
