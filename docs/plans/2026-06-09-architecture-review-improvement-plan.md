# Architecture Review & Improvement Plan — 2026-06-09

## Context

Follow-up architecture review covering frontend, backend/data layer, and
repo/build/deploy hygiene. The 2026-04-30 technical audit drove Phases 1–3
(axios CVE patches, `/healthz`, CI workflow, atomic cache writes, backend
test suite, React Query adoption, CRA→Vite migration, route-level code
splitting, page decomposition). This review assesses the architecture as it
stands today and produces the next prioritized roadmap. It deliberately does
not repeat items already completed.

## Overall Assessment

The architecture is **fundamentally sound for its scale** — a single Express
process serving a prerendered Vite/React SPA plus a read-only scraping API.
The resilience stack is genuinely good: retry with exponential backoff and
403 cooldowns (`utils/request-helper.js`), stale-while-revalidate file cache
with atomic temp-file-then-rename writes (`src/scripts/caching-system.js`),
request coalescing, a scrape-health guard that prevents empty scrapes from
clobbering good cache, bundled fallback JSON for EliteProspects (which 403s
cloud IPs), and a cron scheduler with a 5-minute retry. Security baseline is
appropriate: helmet CSP, rate limiting on `/api/*`, CORS allowlist, zero
parameterized endpoints, no secrets in code.

The problems are not in the design — they are in **drift and accumulation**:

1. **Repo hygiene debt**: ~20 debug/dead files committed at the root
   (including 3.8 MB of scraped HTML, dead Python ports, `server.log`,
   unused `nginx.conf` and PM2 config), plus the 12 MB `build/` directory
   tracked in git even though Render rebuilds on every deploy.
2. **Documentation drift**: `CLAUDE.md` still describes the stack as Create
   React App with the CRA proxy; the build has been Vite since Phase 3. It
   also lists `NewsFeed.jsx` as a key component, but nothing imports it.
3. **Backend layout drift**: backend modules live under the frontend tree
   (`src/scripts/caching-system.js`, `src/scripts/scheduler.js`,
   `utils/request-helper.js`), all 7 route handlers live inline in
   `server.js`, and the SWR/coalesce/fallback pattern is reimplemented
   in four separate scrapers, with `scraper.js` (878 lines) acting as a
   god module for news + schedule + stats + standings + roster.
4. **Known brittleness left open**: hashed CSS-module selectors at
   EliteProspects (audit item B1) are still in use, the cache directory is
   never pruned, and the sitemap base URL is hardcoded.

None of these block the site today. They raise the cost of every future
change and the odds of silent data staleness.

## Findings

### A. Repo hygiene & build (highest leverage, lowest effort)

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| A1 | HIGH | repo root | Committed debug/dead files: `_fix.js`, `_test_uscho.js`, `debug_chn_roster.js`, `debug_chn_roster_row.js`, `debug_results.js`, `fetch_roster_page.js`, `compare_roster_stats.js`, `verify_scraper.js`, `verify_server_roster.js`, `test-photo-scraper.js`, `roster_debug.json`, `verification_result.json`, `server.log`, `schedule.html` (2.3 MB), `temp_schedule_results.html` (1.5 MB), dead Python ports `scraper.py` / `scheduler.py`. |
| A2 | MED | repo root | Unused infra config: `nginx.conf` and `ecosystem.config.json` (PM2) — Render manages the process and proxy; neither is referenced anywhere. |
| A3 | MED | `.gitignore`, git index | `build/` (46 files, 12 MB) is committed per a `.gitignore` note, but `render.yaml` runs `npm run build` on every deploy — the committed copy is redundant, goes stale, and pollutes every PR diff. `playwright-report/` and `test-results/` are also untracked-but-uningored. |
| A4 | HIGH | `CLAUDE.md` | Stack description drift: says CRA + CRA proxy (now Vite + `server.proxy`), says `npm start` runs the "React dev server" (it runs Vite), lists `NewsFeed.jsx` as a key component (unused). Wrong docs actively mislead future Claude/contributor sessions. |
| A5 | LOW | repo root | 17 root markdown files; the one-off reports (`TEST_FIXES*.md` ×3, `PROJECT_ANALYSIS.md`, `CODE_QUALITY_IMPROVEMENTS.md`, `SECURITY_IMPROVEMENTS.md`, `SCRAPER_*` ×3) are point-in-time artifacts superseded by `docs/plans/`. |

### B. Backend & scrapers

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| B1 | HIGH | `recruiting-scraper.js:89,96`, `transfer-scraper.js`, `alumni-scraper.js` | Hashed CSS-module selectors (`.SortTable_table__jnnJk`, `.ProfileImage_profileImage__JLd31`) — one EliteProspects redeploy breaks three scrapers. The scrape-health guard prevents cache clobbering but there is no **staleness alert**: data silently freezes at the fallback/last-good snapshot. (Carried over from 2026-04-30 audit, item B1 — still open.) |
| B2 | MED | `scraper.js` (878 lines) | God module: news, schedule, stats, standings, and roster scraping plus caching/coalescing logic for each, in one file with 5 module-level coalescing promise variables. |
| B3 | MED | `scraper.js`, `transfer-scraper.js`, `alumni-scraper.js`, `recruiting-scraper.js` | The cache-check → SWR → coalesce → scrape → save → fallback pipeline is reimplemented 4×, with small inconsistencies (e.g. only the schedule cache key is season-scoped). |
| B4 | MED | `src/scripts/`, `utils/` | Backend modules (`caching-system.js`, `scheduler.js`, `scrape-health.js`, `request-helper.js`) live in the frontend source tree. Jest/Vite configs have to dance around them; the boundary is invisible to newcomers. |
| B5 | MED | `src/scripts/caching-system.js` | Cache directory is never pruned. Season-scoped keys (`asu_hockey_schedule_2025`, `_2026`, …) and 24 h 403-cooldown marker files accumulate indefinitely. |
| B6 | LOW | `server.js:261` | Sitemap `baseUrl` hardcoded to `https://forksuppucks.com` — wrong URLs on any staging deploy or domain change. |
| B7 | LOW | `server.js:128–275` | All 7 route handlers inline in `server.js`, coupled directly to scraper function signatures. Fine at this size, but the next endpoint makes it worse. |
| B8 | LOW | `scraper.js:168–175` | Date parsing trusts `new Date(y, m, d)` with no NaN rejection and implicit server timezone; the season boundary month (July) is hardcoded inline rather than in `config/scraper-config.js`. |

### C. Frontend

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| C1 | MED | `src/pages/RecruitingTable.jsx` (132), `src/pages/ManualRecruitingEntry.jsx` (95), `src/components/NewsFeed.jsx` (112) | Dead code: none are routed or imported (NewsFeed only by its own test). RecruitingTable duplicates `Recruiting.jsx`. (`About`/`Contact` are intentionally hidden via commented routes — keep those.) |
| C2 | MED | `src/services/api.ts`, `src/hooks/queries/queryClient.js` | Only 2 of 8 API functions validate response shape; query errors are not reported to Sentry (no global `onError`); pages each hand-roll loading/error UI. |
| C3 | LOW | `src/pages/Home.jsx:32–43`, `src/pages/Schedule.jsx:29–53` | Team-record calculation duplicated in two pages; `UpcomingGames.jsx` separately duplicates Schedule's date formatting. |
| C4 | LOW | `tsconfig.json` | TS adoption stalled at 3 files with `strict: false` — the typed API layer exists but enforces nothing. (Audit item 18, still pending.) |
| C5 | LOW | `src/pages/News.jsx:70–171` | Magazine layout slicing + rendering is ~100 inline lines; fine today, extract sub-components only if it changes again. |

### D. Dependencies & ops

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| D1 | MED | `package.json` postinstall, `render.yaml` | Two headless-browser stacks: Puppeteer (prerender + optional 403 fallback, ~200 MB Chrome on every install) **and** Playwright (E2E). Consolidating prerender onto Playwright would drop the postinstall Chrome download and one dependency. |
| D2 | LOW | observability | No cache hit-rate / data-age metrics. `/healthz` says the process is up, not whether the data is fresh. A `/api/status` endpoint reporting per-cache-key age would make staleness visible (and feed B1's alerting). |

## Roadmap

### Phase 4 — Hygiene sweep (one PR, ~an hour, zero behavior change)

1. **Delete root debris** (A1, A2): all debug/verify/temp scripts, scraped
   HTML, `server.log`, Python ports, `nginx.conf`, `ecosystem.config.json`.
   Everything is recoverable from git history.
2. **Stop tracking `build/`** (A3): remove from index, restore `/build` to
   `.gitignore`, add `playwright-report/` and `test-results/`. Verify the
   next Render deploy still succeeds (its `buildCommand` already rebuilds).
3. **Fix `CLAUDE.md`** (A4): Vite everywhere CRA is mentioned, correct dev
   commands, drop `NewsFeed.jsx` from key components.
4. **Archive stale reports** (A5): move one-off root reports to
   `docs/archive/`; keep README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT,
   setup/deployment guides at root.
5. **Remove dead frontend code** (C1): `RecruitingTable.jsx`,
   `ManualRecruitingEntry.jsx`, `NewsFeed.jsx` + its test/CSS.
6. **Sitemap base URL from env** (B6): `SITE_BASE_URL` with the current
   domain as default; reuse in `scripts/prerender.js` (which hardcodes the
   same domain).

### Phase 5 — Data-staleness visibility (the real operational risk)

The site's failure mode is not crashing — it's **quietly serving old data**
when EliteProspects/CHN markup changes. Make that observable before
refactoring anything:

7. **`/api/status` endpoint** (D2): for each cache key report age, source
   (live/cache/fallback), and last successful refresh. Cheap to build on
   the existing cache file timestamps.
8. **Staleness alerting** (B1): scheduler job that Sentry-warns when any
   cache exceeds N× its expected refresh interval (e.g. roster > 3 days).
   This converts "selector broke" from silent to actionable.
9. **Cache pruning** (B5): same scheduler job deletes cache files and
   cooldown markers older than 3× their TTL, skipping keys for the current
   season.
10. **De-hash EP selectors where possible** (B1): prefer structural
    selectors (`table tbody tr`, `img[src*="files.eliteprospects.com"]`)
    over hashed class names; keep hashed ones only as secondary fallbacks.
    Run the `scraper-reviewer` agent after edits.

### Phase 6 — Backend layout consolidation (mechanical, do as one effort)

11. **Move backend out of `src/`** (B4): create `server/` housing
    `cache/` (caching-system, scrape-health), `scrapers/`, `services/`
    (move root `services/`), `routes/`, `scheduler.js`, and move
    `utils/request-helper.js` in. Update jest.server config paths.
12. **Extract the scraper pipeline** (B3): one
    `createCachedScraper({ cacheKey, ttl, scrape, fallback, validate })`
    helper owning SWR + coalescing + health-guard + fallback; rewrite the
    four scrapers as thin scrape functions. This kills the 4× duplication
    and the loose module-level promise variables.
13. **Split `scraper.js`** (B2) into `news`, `schedule`, `stats`,
    `standings`, `roster` modules on top of (12); thin route modules per
    endpoint (B7). Behavior-preserving — the existing backend tests and
    Playwright API specs are the safety net.

### Phase 7 — Frontend quality (incremental, as-touched)

14. **Global query error reporting** (C2): `QueryCache.onError` →
    Sentry in `queryClient.js`; add shape validation to the remaining API
    functions in `api.ts` (the types in `src/types/api.ts` already exist).
15. **Extract `recordHelpers`** (C3): shared record calculation +
    date formatting for Home/Schedule/UpcomingGames.
16. **Resume TS adoption** (C4): flip `strict: true` for the existing
    `.ts` files (scoped via `include`), convert query hooks next; new
    files in TS by default. No big-bang conversion.

### Explicitly deferred

- **News.jsx decomposition** (C5) — only if the layout changes again.
- **Puppeteer→Playwright prerender consolidation** (D1) — real win
  (faster installs/deploys) but touches the deploy path; do it alone, not
  bundled with refactors.
- **Database/CMS migration** — not warranted. File cache + static JSON +
  git-as-CMS fits the write volume (one maintainer, weekly data refresh).
  Revisit only if multiple editors or user-generated content appear.

## Sequencing rationale

Phase 4 is pure cleanup and shrinks every future diff. Phase 5 comes before
the refactor because staleness is the only failure mode that affects users
today, and the observability it adds also verifies Phase 6 didn't break
refresh behavior. Phase 6 is the structural payoff but is safe only with
the test suite green before/after. Phase 7 rides along with normal feature
work rather than being a dedicated effort.
