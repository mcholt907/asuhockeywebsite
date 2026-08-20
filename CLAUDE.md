# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

- Development is on Windows; account for path translation in bash commands
- The `.claude` folder is hidden by default on Windows (dot-prefix)
- After installing CLI tools (e.g., gh), a new shell may be needed for PATH refresh
- This project runs on Windows/PowerShell. Batch and pre-approve routine PowerShell commands where possible to minimize permission prompts

## Permissions & Autonomy

- Be less cautious about asking for permission on routine operations (file edits, git commits, reading files in the project)
- Batch related operations rather than prompting for each step
- Default to action on clear, scoped requests; only ask when truly ambiguous

## Architecture

This is a **monorepo** combining a React frontend (Vite) and an Express backend in a single Node.js project.

**Data flow:**

1. `server/scrapers/` — one module per dataset (`news.js`, `schedule.js`, `stats.js`, `standings.js`, `roster.js`, `transfers.js`, `alumni.js`, `recruiting.js`) scraping external sites (thesundevils.com website-api, collegehockeynews.com, uscho.com, eliteprospects.com) using cheerio + axios. All are built on `server/scrapers/create-cached-scraper.js`, the shared pipeline that owns cache checks, SWR, request coalescing, validation/health-guarding, and stale/fallback error recovery. `server/scrapers/index.js` re-exports the public API.
2. `server/cache/caching-system.js` — file-based cache at `server/cache/data/`, implements stale-while-revalidate (expired cache is served while background refresh runs)
3. `server/scheduler.js` — node-cron jobs that pre-warm the cache on startup and on schedule (news/stats/standings: 12 AM & 12 PM; roster/alumni/transfers: 3 AM daily; post-game force refresh: 2–6 AM UTC Sat/Sun; cache maintenance: 4:30 AM daily via `server/cache/cache-maintenance.js` — prunes abandoned cache files and Sentry-warns on stale datasets)
4. `server.js` — thin entry point (dotenv, Sentry init, scheduler start, listen on port 5000). App assembly (middleware, static `build/` serving) lives in `server/app.js`; the `/api/*` handlers are a thin router in `server/routes/api.js`. `/api/status` reports per-dataset freshness (age, source: cache/fallback/static, ok/stale/missing) and 403 cooldowns, built on `server/cache/data-status.js`
5. `src/services/api.ts` — frontend axios wrapper that calls the backend via `/api/*` (proxied via Vite `server.proxy` in dev)
6. `src/pages/` — React pages, fetching via the React Query hooks in `src/hooks/queries/` (which call `src/services/api.ts`)

**Key architectural decision:** The `/api/roster` endpoint merges data from two sources — `asu_hockey_data.json` (static file with photos and curated data) and a live CHN scrape — via `server/services/roster-service.js` at request time. `roster-service.js` also contains `determineNationality()`, which infers player country from hometown strings. `/api/recruits` serves the validated `data/asu_recruiting_fallback.json` snapshot; `asu_hockey_data.json.recruiting` remains available only for current-roster profile enrichment. Request coalescing lives inside `createCachedScraper` (no module-level promise variables anymore).

**Scraper config is centralized** in `config/scraper-config.js` — all URLs, cache durations, retry settings, and season constants live there. Update `CURRENT_SEASON` there when the season changes.

## Git & PR Workflow

- Group related changes into logical commits with clear messages
- After implementation: build, commit, push, then open PR via gh CLI
- Auto-merge PRs when CI passes (user preference)
- Prefer clean cherry-picks and verify branch state before merging to avoid duplicate commits; confirm no fix is orphaned before auto-merging a PR
- Update MEMORY.md / design docs after major architectural changes

## Development Commands

```bash
# Start both servers for development (run in separate terminals)
npm start          # Vite dev server on port 3000 (auto-proxies /api/* to :5000)
node server.js     # Express backend on port 5000

# Build for production (postbuild runs scripts/prerender.js via Puppeteer)
npm run build      # Outputs to build/ (gitignored; Render rebuilds on deploy)

# Run React unit tests (Jest/Testing Library)
npm test

# Run a single unit test file
npm test -- --testPathPattern="UpcomingGames"

# Run server-side Node/Express unit tests (separate Jest config)
npx jest --config jest.server.config.js

# E2E tests (requires both servers running, or uses webServer auto-start)
npm run test:e2e                    # All browsers
npm run test:e2e:chromium           # Chromium only (fastest)
npm run test:e2e:ui                 # Interactive UI mode
npx playwright test tests/api.spec.ts  # Single E2E file
```

## Environment Variables

Copy `.env.example` to `.env`. Required for local dev:

- `PORT=5000`
- `CORS_ORIGINS=http://localhost:3000`

Production env vars (`NODE_ENV`, `PORT`, `CORS_ORIGINS`) are set in Render dashboard. `VITE_SENTRY_DSN` enables browser-side Sentry error tracking. `SITE_BASE_URL` overrides the production origin used by the sitemap (`server.js`) and prerender (`scripts/prerender.js`); defaults to `https://forksuppucks.com`.

To override the active season locally (defaults to `2026-2027`), set `CURRENT_SEASON` in `.env`. The canonical place to update it for production is `config/scraper-config.js`.

## Deployment

Deployed on **Render.com** (`render.yaml`). Build: `npm install && npx puppeteer browsers install chrome && npm run build`. Start: `node server.js`. The Express server serves the React `build/` directory directly — there is no separate static hosting. Healthcheck hits `/healthz`.

## Static Data File

`asu_hockey_data.json` is the source of truth for roster photos, curated player data, current-roster recruiting enrichment, and `manual_news` entries (hand-written news stories that appear in the news feed). Future-team recruiting pages use `data/asu_recruiting_fallback.json` instead.

Root utility scripts for editing this file:

- `add-photos.js` — add player photo URLs
- `add-new-recruits.js` — add recruiting entries interactively
- `clean-recruiting.js` — clean/validate recruiting data
- `add-current-team.js` — manage current season roster entries

## Data Refresh Workflow

Recruiting, alumni, and transfer data are scraped from EliteProspects, which
403s cloud-hosted IPs (Render); standings come from USCHO. A dedicated
residential Windows clone performs the live refresh every day at 06:00 local
time, and production serves the four committed fallback JSON files in `data/`.

To refresh manually:

```bash
npm run refresh-data        # recruiting, alumni, transfers, and standings
npm run refresh-recruiting  # recruiting fallback only
npm run refresh-alumni      # alumni only
npm run refresh-transfers   # transfers only
npm run refresh-standings   # standings only
```

The refresh scripts validate result shape and completeness before atomically
replacing a fallback; an empty, malformed, or partial scrape exits non-zero and
leaves the existing JSON untouched. Recruiting calls the direct all-season
scraper, which never reads or recovers from cache/fallback data.

EliteProspects 403s the plain-axios TLS fingerprint even from residential
IPs; the refresh scripts enable `SCRAPER_PUPPETEER_FALLBACK` by default so
blocked requests retry through headless Chrome.

Install or replace the Scheduled Task from the primary repository with the
PowerShell installer and an existing readable environment file:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-refresh-runner.ps1 -EnvironmentFile C:\Users\farkh\asuhockeywebsite\.env
```

The installer requires Git, Node/npm, authenticated GitHub CLI access, and
permission to register a Scheduled Task. It clones or updates an isolated
runner, installs dependencies, copies the environment file, writes the
`.refresh-runner` marker, and registers `ASU Hockey Data Refresh` with daily,
wake, network, and missed-start handling. Never point the runner at the working
repository, inside it, or at one of its parent directories.

Each run pulls `main`, refreshes all four datasets, and opens or updates an
auto-merging PR from `auto/data-refresh`. Commits are restricted to exactly
these four generated files:

- `data/asu_alumni_fallback.json`
- `data/asu_transfers_fallback.json`
- `data/asu_recruiting_fallback.json`
- `data/nchc_standings_fallback.json`

When validated data is unchanged, the run exits successfully without a commit
or pull request. Failures and detailed runner output are logged to
`.refresh-log.txt` (gitignored). Inspect the latest task result with
`Get-ScheduledTaskInfo -TaskName 'ASU Hockey Data Refresh'`.

The task reports a dead-man's-switch check-in to a Sentry Cron Monitor via
`scripts/ping-refresh-monitor.js` (`ok` on success, `error` on failure), so
a run that never happens or dies part-way alerts within the monitor's grace
period. Requires `SENTRY_CRON_MONITOR_URL` in `.env` (see `.env.example`
for the one-time Sentry monitor setup); unset means check-ins are skipped.

At season rollover, update `config.FUTURE_SEASONS` in
`config/scraper-config.js` so recruiting refreshes query the intended future
classes.

## Pages & Routes

- `/` — Home (next game, team record, news grid, standings)
- `/news` — News feed: hybrid magazine layout (hero card → wide+stacked row → 3-col compact grid → older stories list)
- `/schedule` — Game schedule with results and team record widget
- `/roster` — Team roster with position filtering and nationality flags
- `/stats` — Player statistics with sortable columns (skaters / goalies)
- `/recruiting` — Recruiting tracker grouped by position, sorted by last name, with birth year
- `/alumni` — "Where Are They Now?" alumni/pro career tracking

## Key Components

- `src/components/SortableTable.jsx` — headless sortable table via TanStack React Table; used in Stats
- `src/components/DataStatusBanner.jsx` — shows whether data is live, cached, or errored
- `src/components/GlobalNotificationBanner.jsx` — site-wide notification system
- `src/components/MobileBottomNav.jsx` — glass morphism mobile nav (<780px)
- `src/components/UpcomingGames.jsx` — upcoming games widget

## Assets

- `public/assets/flags/` — SVG country flag files (`usa.svg`, `can.svg`, `swe.svg`, `svk.svg`) used for player nationality display
- `public/assets/` — hero images as optimized WebP (`hero-arena-opt.webp`, `hero-arena-mobile-opt.webp`)
- Reference public folder assets with root-absolute paths (e.g. `/assets/flags/usa.svg`) in JSX; Vite serves `public/` at the site root

## Frontend / Visual Fixes

This is a heavy CSS/frontend project. When fixing visual/layout issues, use Playwright to screenshot before and after, and diagnose the actual computed heights/dimensions before applying fixes rather than guessing at properties like align-items.

## Styling / Typography

Use Barlow Condensed as the project typography with the established weight/size scale; apply it consistently across new components.

## Test Structure

- `src/**/__tests__/` — Jest unit tests for React components and services
- `__tests__/` — Jest unit tests for server-side code (roster-service, scraper caching, recruiting scraper); run with `jest.server.config.js`
- `tests/` — Playwright E2E tests (home, news, roster, api endpoints)
- `src/__mocks__/` — axios and react-router-dom mocks for unit tests

E2E tests target `http://localhost:3000` with the Express backend at `:5000`. The Playwright config auto-starts both servers when running tests.

## Planning Docs

`docs/plans/` contains markdown plans for past features (e.g., `2026-03-03-news-hybrid-layout.md`). Add new plans here before implementing larger features.
