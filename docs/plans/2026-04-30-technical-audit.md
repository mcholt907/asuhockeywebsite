# Technical Audit & Improvement Roadmap — 2026-04-30

## Context

Full read-only technical assessment of the website's frontend, backend/data layer, and build/deploy/security pipeline. The audit was scoped to "what is brittle, redundant, or risky today, and where is the highest leverage for improvement." It produced a prioritized roadmap that subsequent planning docs in this directory will draw from when implementing each phase.

The site is in good shape on SEO (Helmet + JSON-LD + Puppeteer prerender), brand styling, and the stale-while-revalidate caching pattern. The biggest risks sit in three places: (1) the frontend has no client-side data layer so pages refetch on every mount and there are duplicate fetches; (2) the scrapers depend on hashed CSS-Modules selectors at Elite Prospects with no health monitoring; (3) the project has no CI workflow and an unpatched cluster of axios CVEs.

## Findings

### Frontend (React 19 + CRA)

| # | Severity | File | Issue |
| --- | --- | --- | --- |
| F1 | HIGH | `src/services/api.js` | No request dedup or client cache. Errors silently fall back to `[]/{}` with no retry. |
| F2 | HIGH | `src/pages/Home.jsx`, `src/components/UpcomingGames.jsx` | Both call `getSchedule()` on mount → two parallel `/api/schedule` requests on the homepage. |
| F3 | MED | `src/App.js` | No route-level code splitting. All seven page components in initial bundle. |
| F4 | MED | `src/components/SortableTable.jsx` | `key={idx}` on rows; no virtualization for large lists. |
| F5 | MED | `NewsFeed.css`, `Alumni.css`, `Home.css`, `Roster.css` | 11 `!important` declarations — cascade conflicts. |
| F6 | MED | `News.jsx`, `Home.jsx`, `Contact.jsx` | Inline `style={{ backgroundImage: ... }}` blocks CSS optimization. |
| F7 | MED | All pages | Duplicated `useEffect → axios → setLoading/setError` boilerplate; pages 270–360 lines each. |
| F8 | MED | Global CSS | No `:focus-visible` styles, no skip-to-main link. Gold (#E8A833) on maroon (#43141A) needs WCAG AA verification for small text. |
| F9 | LOW | `src/components/GlobalNotificationBanner.jsx` | Close button missing `aria-label`. |
| F10 | LOW | Tests | Sparse unit-test coverage; Playwright smoke only; no API-layer integration tests. |

### Backend (Express + Scrapers + Cache)

| # | Severity | File | Issue |
| --- | --- | --- | --- |
| B1 | HIGH | `scraper.js`, `recruiting-scraper.js`, `transfer-scraper.js`, `alumni-scraper.js` | Hashed CSS-Modules selectors (e.g. `.SortTable_table__jnnJk tbody.SortTable_tbody__VrcrZ`). Single deploy on Elite Prospects breaks every scraper. No selector-health alerting — empty results are treated as cache misses. |
| B2 | MED | `src/scripts/caching-system.js:10–29` | `saveToCache` is sync and unwrapped; `fs.writeFileSync` can throw on disk-full / permission errors and the throw propagates as an unhandled rejection from any async caller (e.g. `recruiting-scraper.js:230`). _Originally misdiagnosed in this audit as a missing `await` — `saveToCache` is synchronous and returns no promise._ |
| B3 | MED | `server.js` lines 118, 168 | `fs.readFileSync('asu_hockey_data.json')` on every `/api/news` and `/api/recruits` request — blocks event loop, parses 21 KB JSON per call. |
| B4 | MED | `src/scripts/caching-system.js` | All cache I/O is `fs.*Sync`. No atomic writes (write-then-rename); crash mid-write corrupts the cache. |
| B5 | MED | `src/scripts/scheduler.js` | No retry on cron-job failure — one failure means stale data for 12+ hours. |
| B6 | MED | `services/roster-service.js` `determineNationality()` | Substring match — "SVK" inside "SKATNAVIA" matches incorrectly. |
| B7 | MED | `__tests__/`, `jest.server.config.js` | No real Jest server tests; only a manual smoke runner in `scraper.test.js`. |
| B8 | LOW | `server.js` line 12 | 100% Sentry trace sampling in prod — expensive. |
| B9 | LOW | `config/scraper-config.js` | `sunDevilsSchedule(year)` ignores its `year` argument. |

### Build, Deploy, CI/CD, Security

| # | Severity | File | Issue |
| --- | --- | --- | --- |
| O1 | HIGH | `package.json` | `react-scripts` (CRA) deprecated 2024. `axios ^1.6.8` has known CVEs (SSRF, DoS, metadata exfiltration). `npm audit fix` not run. |
| O2 | HIGH | `.github/workflows/` | Does not exist. No automated lint/test/audit on push or PR. |
| O3 | HIGH | `render.yaml` line 19 | Healthcheck is `/api/news` — couples deploy health to scraper availability. |
| O4 | MED | `server.js` lines 58–68 | CSP `imgSrc: ["'self'", "data:", "https:"]` allows any HTTPS image. |
| O5 | MED | `utils/request-helper.js` | Scraper request URLs not validated against an allowlist. |
| O6 | MED | Root | App is JS, Playwright tests are TS — no `tsconfig.json` for the app. |
| O7 | LOW | `scripts/prerender.js` line 75 | Hardcoded `localhost:5055 → forksuppucks.com` substitution. |
| O8 | LOW | Root | No Prettier, no husky/lint-staged. ESLint inherits CRA defaults only. |

## Recommendations (Prioritized)

### Phase 1 — Quick Wins

1. **`npm audit fix`** (O1). Patch axios + cluster of CVEs. Verify with `npm test` + Playwright smoke.
2. **Dedicated `/healthz` endpoint** (O3) returning `{ ok: true, uptime }`; switch `render.yaml` healthCheckPath.
3. **In-memory cache for `asu_hockey_data.json`** (B3). Read once at startup; re-read on `mtime` change. Removes sync I/O from request path.
4. **Harden `saveToCache`** (B2). Wrap its body in `try/catch`, log to Sentry on failure. One change in `caching-system.js`; protects every call site automatically.
5. **Lower Sentry trace sample to ~0.1 in prod** (B8) via env-conditional.
6. **`aria-label` on notification close button** (F9) + global `:focus-visible` rules (F8).
7. **Verify `.env` history**: `git log --all --full-history -- .env`. If ever committed, rotate the Sentry DSN.

### Phase 2 — Medium Investments

8. **Adopt TanStack Query (or SWR)** (F1, F2). Eliminates duplicate fetches and the `useEffect+setLoading` boilerplate across all 7 pages. Single biggest UX win.
9. **Route-level code splitting** (F3). `React.lazy` + `Suspense` per page; cuts initial JS payload.
10. **CI workflow** (O2). `.github/workflows/ci.yml`: install → lint → `npm audit --audit-level=high` → unit tests → Playwright Chromium. Block merges on failure. Dependabot weekly.
11. **Selector-health monitoring** (B1). Empty-result Sentry warnings; serve last-known-good cache; alert on 2 consecutive empty runs. Cuts MTTR from days to hours.
12. **Atomic cache writes** (B4). `writeFileSync(tmp, ...) → renameSync(tmp, final)`.
13. **Scheduler retry-with-backoff** (B5). Retry once after 5 min before next scheduled run.
14. **Tighten CSP** (O4). Replace `imgSrc: "https:"` with explicit hosts.
15. **Stable-id keys in `SortableTable`** (F4). Use `row.original.id || row.original.name`. Consider `react-window` if rosters grow.
16. **Refactor `determineNationality`** (B6). Anchor to comma-delimited city/country segment.

### Phase 3 — Larger Investments

17. **Migrate CRA → Vite** (O1). Near drop-in for a JS React app; unblocks modern tooling. Keep React 19, React Router. Prerender step (Puppeteer) is framework-agnostic.
18. **Adopt TypeScript incrementally** (O6). Start with `services/api.js` and shared types (`Player`, `Game`, `NewsArticle`).
19. **Decompose largest pages** (F7). `Roster.jsx` (361), `Recruiting.jsx` (285), `Home.jsx` (277). Pairs naturally with #8.
20. **Backend test suite** (B7). Real Jest tests for `roster-service`, cache module, contract tests per scraper against fixture HTML. Wire to CI (#10).
21. **CSS audit + token consolidation** (F5, F6). Eliminate `!important`s; move inline `backgroundImage` into utility classes.
22. **Render tier review**. Free tier sleeps; paid plan removes cold start and gives reliable scheduler runs.

## Critical Files

- `src/services/api.js` — single change-point for the data layer (#8)
- `src/components/UpcomingGames.jsx` + `src/pages/Home.jsx` — duplicate-fetch site
- `server.js` — sync I/O lines 118 & 168, CSP lines 58–68, healthcheck context
- `src/scripts/caching-system.js` — atomic-write change-point
- `src/scripts/scheduler.js` — retry change-point
- `scraper.js`, `recruiting-scraper.js`, `transfer-scraper.js`, `alumni-scraper.js` — selector-health change-points
- `services/roster-service.js` — `determineNationality` fix
- `render.yaml` — healthCheckPath change
- `package.json` — dependency upgrade & Vite migration target

## Verification Plan

- **Phase 1**: `npm audit` shows 0 high; `curl /healthz` returns 200 with scrapers paused; Lighthouse unchanged or better; Sentry sample-rate visible in init log.
- **Phase 2**: Network tab on `/` shows one (not two) `/api/schedule` request; React DevTools Profiler shows page-component lazy chunks loaded only on navigation; CI run visible on PR with green checks.
- **Phase 3**: `npm run build && npm run start` produces a Vite build; `tsc --noEmit` clean for migrated files; backend Jest >70% coverage on `roster-service` + cache module; cold-start time measured pre/post tier change.

End-to-end smoke after each phase: home → news → roster → stats via `npm run test:e2e:chromium`.

## Implementation Plan Convention

Subsequent docs in this directory will be created per phase or per item:

- `2026-MM-DD-phase1-quick-wins-design.md` / `.md` — covers items 1–7 as a single PR
- `2026-MM-DD-tanstack-query-design.md` / `.md` — item 8
- `2026-MM-DD-route-code-splitting-design.md` / `.md` — item 9
- `2026-MM-DD-ci-workflow-design.md` / `.md` — item 10
- ...etc.

Each follows the existing pattern (paired design + implementation docs).
