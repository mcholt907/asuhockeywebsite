# Automated Daily Fallback Refresh Integration Plan

**Goal:** Integrate the isolated daily Windows runner with the production
fallback contracts for alumni, transfers, recruiting, and standings.

**Design:**
`docs/superpowers/specs/2026-08-18-automated-recruiting-refresh-design.md`

## Constraints

- Preserve `data/asu_recruiting_fallback.json` as the `/api/recruits` contract.
- Never write curated `asu_hockey_data.json` from automatic refreshes.
- Do not maintain recruiting removal-confirmation state.
- A direct recruiting refresh must scrape every configured season without
  cache or fallback recovery and reject on any season failure.
- Publish exactly four fallback JSON files and reject every other changed path.
- Keep the runner in a dedicated standalone clone and retain daily 06:00,
  wake, missed-start, network, and single-instance task settings.
- Keep operations local during integration: no runner installation, push, or
  pull-request state change.

## Integration tasks

1. Merge `origin/main` into the feature branch without rebasing.
2. Keep main's recruiting snapshot/API/status implementation and standings
   fallback work.
3. Retain the branch's installer, isolated PowerShell runner, validation guard,
   monitoring, and Task Scheduler definition produced by the installer.
4. Add regression tests before production changes:
   - direct scrape requests all configured seasons without cache/fallback;
   - a later-season failure rejects;
   - default refresh propagates that rejection and preserves the fallback;
   - allowlist accepts the four fallbacks and rejects curated/state paths;
   - PowerShell parses all four generated JSON files.
5. Route `scripts/refresh-recruiting.js` through the direct scraper and adapt
   the runner's allowlist, focused tests, staging, and parse checks.
6. Remove the superseded recruiting merge service, removal-state file, tests,
   static workflow test, and hardcoded Task Scheduler XML.
7. Update README, environment guidance, and repository architecture guidance.
8. Run focused tests, full server/frontend suites, production build,
   formatting, PowerShell parsing, workflow validation, and diff checks.
9. Commit the merge resolution locally without pushing.

## Acceptance criteria

- A cache or bundled snapshot cannot make a failed recruiting live scrape
  report success.
- A partial recruiting scrape cannot replace the bundled fallback.
- Automated commits contain only the four generated fallback files.
- Curated recruiting enrichment remains intact in `asu_hockey_data.json` and
  is outside the automatic publication path.
- The isolated daily runner remains installable but is not installed as part
  of this integration.
- All repository verification gates pass before the merge commit is created.
