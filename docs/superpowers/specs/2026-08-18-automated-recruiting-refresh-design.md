# Automated Daily Fallback Refresh Design

## Goal

Refresh every committed production fallback once per day from an isolated
residential Windows clone, while ensuring that failed live collection can
never be mistaken for a successful refresh.

## Published contract

The automation may publish exactly these generated files:

- `data/asu_alumni_fallback.json`
- `data/asu_transfers_fallback.json`
- `data/asu_recruiting_fallback.json`
- `data/nchc_standings_fallback.json`

`asu_hockey_data.json` remains curated and is never written by the automatic
refresh. No recruiting removal-state file is used.

## Data flow

```text
Windows Task Scheduler (daily 06:00 Arizona)
  -> dedicated standalone clone
  -> npm run refresh-data
  -> validate four fallback JSON files
  -> reject every changed path outside the exact allowlist
  -> run server tests
  -> auto/data-refresh PR with CI and auto-merge
```

The installer owns the one-time clone and Scheduled Task setup. The scheduled
command is the small `refresh-and-push.cmd` wrapper around the PowerShell
orchestrator. A `.refresh-runner` marker and standalone-Git checks prevent the
automation from operating in the developer checkout or a linked worktree.

## Recruiting safety boundary

Production and prerender requests use the validated bundled recruiting
snapshot. Local automation calls `scrapeAllRecruitingSeasons()` directly.
That function requests every configured `config.FUTURE_SEASONS` entry and does
not read or write the shared cache or load a fallback. If any season request or
parse fails, the promise rejects and `scripts/refresh-recruiting.js` preserves
the existing fallback byte-for-byte.

The refresh accepts a complete snapshot with every configured season key, at
least one player overall, and valid player names and EliteProspects links.
Legitimately empty far-future seasons remain allowed.

## Other datasets

Alumni and transfer refreshes use their existing validated atomic fallback
writers. The standings refresh publishes only a valid played-season NCHC
snapshot; an unpublished or all-zero preseason table leaves the prior fallback
unchanged without blocking unrelated refreshes.

## Publication safety

The PowerShell runner restores only allowlisted leftovers from a prior failed
run, starts `auto/data-refresh` from the latest `origin/main`, executes the
aggregate refresh, parses all four generated JSON documents, and validates both
working-tree and staged paths through `scripts/validate-refresh-changes.js`.
No-change runs exit successfully without a commit or pull request.

Failures are logged and reported to the Sentry Cron Monitor. Monitoring
delivery itself remains nonfatal because a missed check-in is the dead-man
signal.

## Verification

Behavior tests cover direct multi-season scraping, later-season failure
propagation, snapshot preservation, the exact four-file allowlist, executable
PowerShell JSON parsing, and isolated-runner path protections. Completion also
requires the full server and frontend suites, production build, PowerShell
parser, formatting, workflow validation when available, and `git diff --check`.
