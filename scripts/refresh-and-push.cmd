@echo off
REM Automated weekly refresh of alumni + transfer fallback JSON.
REM Run by Windows Task Scheduler from the user's residential IP.
REM
REM Behavior:
REM   - Pulls latest main
REM   - Runs npm run refresh-data
REM   - If fallback JSON files changed, commits to a branch and opens an
REM     auto-merging PR (main is protected; direct pushes are rejected)
REM   - Logs to .refresh-log.txt (one line per run)
REM   - Exits non-zero on any failure; existing JSON is preserved
REM   - Reports a Sentry Cron Monitor check-in (ok on success, error on
REM     failure) via scripts\ping-refresh-monitor.js so a missed or failed
REM     week alerts instead of failing silently. No-op if
REM     SENTRY_CRON_MONITOR_URL is unset in .env.

setlocal
cd /d "%~dp0\.."

set LOG=.refresh-log.txt

echo ---------------------------------------------------------------- >> %LOG%
echo %DATE% %TIME% — refresh starting >> %LOG%

git fetch origin >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — git fetch failed >> %LOG%
  node scripts\ping-refresh-monitor.js error >> %LOG% 2>&1
  exit /b 1
)

git checkout main >> %LOG% 2>&1
git pull --ff-only origin main >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — git pull failed (uncommitted local work?) >> %LOG%
  node scripts\ping-refresh-monitor.js error >> %LOG% 2>&1
  exit /b 1
)

call npm run refresh-data >> %LOG% 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% — refresh-data failed; preserving existing JSON >> %LOG%
  node scripts\ping-refresh-monitor.js error >> %LOG% 2>&1
  exit /b 1
)

git diff --quiet -- data\asu_alumni_fallback.json data\asu_transfers_fallback.json
if errorlevel 1 (
  git checkout -B auto/data-refresh >> %LOG% 2>&1
  git add data\asu_alumni_fallback.json data\asu_transfers_fallback.json
  git commit -m "data: refresh alumni and transfer fallbacks (automated)" >> %LOG% 2>&1
  git push -f origin auto/data-refresh >> %LOG% 2>&1
  if errorlevel 1 (
    echo %DATE% %TIME% — git push failed >> %LOG%
    git checkout main >> %LOG% 2>&1
    node scripts\ping-refresh-monitor.js error >> %LOG% 2>&1
    exit /b 1
  )
  REM Create the PR; if one already exists for this branch, reuse it
  gh pr create --head auto/data-refresh --title "data: refresh alumni and transfer fallbacks (automated)" --body "Weekly automated data refresh from the Windows Scheduled Task." >> %LOG% 2>&1
  gh pr merge auto/data-refresh --auto --merge >> %LOG% 2>&1
  if errorlevel 1 (
    echo %DATE% %TIME% — gh pr auto-merge failed (check PR manually) >> %LOG%
    git checkout main >> %LOG% 2>&1
    node scripts\ping-refresh-monitor.js error >> %LOG% 2>&1
    exit /b 1
  )
  git checkout main >> %LOG% 2>&1
  echo %DATE% %TIME% — refreshed; PR opened with auto-merge >> %LOG%
) else (
  echo %DATE% %TIME% — no data changes >> %LOG%
)

REM Dead-man's-switch: report the successful run to the Sentry Cron Monitor.
REM A missed check-in (machine asleep, script died early) alerts within the
REM monitor's grace period. No-op if SENTRY_CRON_MONITOR_URL is unset.
node scripts\ping-refresh-monitor.js ok >> %LOG% 2>&1

endlocal
exit /b 0
