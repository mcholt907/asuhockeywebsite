# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a **monorepo** combining a React frontend (Create React App) and an Express backend in a single Node.js project.

**Data flow:**

1. `scraper.js` / `transfer-scraper.js` / `alumni-scraper.js` / `recruiting-scraper.js` — scrape external sites (thesundevils.com, collegehockeynews.com, uscho.com) using cheerio + axios
2. `src/scripts/caching-system.js` — file-based cache at `src/scripts/cache/`, implements stale-while-revalidate (expired cache is served while background refresh runs)
3. `src/scripts/scheduler.js` — node-cron jobs that pre-warm the cache on startup and on schedule (news/stats/standings: 12 AM & 12 PM; roster/alumni/transfers: 3 AM daily; post-game force refresh: 2–6 AM UTC Sat/Sun)
4. `server.js` — Express server on port 5000 that serves API routes and the React `build/` as static files
5. `src/services/api.js` — frontend axios wrapper that calls the backend via `/api/*` (proxied via CRA proxy in dev)
6. `src/pages/` — React pages, each fetching from `src/services/api.js`

**Key architectural decision:** The `/api/roster` endpoint merges data from two sources — `asu_hockey_data.json` (static file with photos and curated data) and a live CHN scrape — via `services/roster-service.js` at request time. `roster-service.js` also contains `determineNationality()`, which infers player country from hometown strings. Recruiting data reads directly from `asu_hockey_data.json`. Stats/news/schedule use the caching system with request coalescing (module-level promise variables in `scraper.js`).

**Scraper config is centralized** in `config/scraper-config.js` — all URLs, cache durations, retry settings, and season constants live there. Update `CURRENT_SEASON` there when the season changes.

## Development Commands

```bash
# Start both servers for development (run in separate terminals)
npm start          # React dev server on port 3000 (auto-proxies /api/* to :5000)
node server.js     # Express backend on port 5000

# Build for production
npm run build      # Outputs to build/

# Run React unit tests (Jest/Testing Library)
npm test

# Run a single unit test file
npm test -- --testPathPattern="NewsFeed"

# Run server-side Node/Express unit tests (separate Jest config)
npx jest --config jest.server.config.js

# E2E tests (requires both servers running, or uses webServer auto-start)
npm run test:e2e                    # All browsers
npm run test:e2e:chromium           # Chromium only (fastest)
npm run test:e2e:ui                 # Interactive UI mode
npx playwright test tests/api.spec.ts  # Single E2E file
```

## Environment

Copy `.env.example` to `.env`. Required for local dev:

- `PORT=5000`
- `CORS_ORIGINS=http://localhost:3000`

Production env vars (`NODE_ENV`, `PORT`, `CORS_ORIGINS`) are set in Render dashboard. `REACT_APP_SENTRY_DSN` is needed for Sentry error tracking.

To override the active season locally (defaults to `2025-2026`), set `CURRENT_SEASON` in `.env`. The canonical place to update it for production is `config/scraper-config.js`.

## Deployment

Deployed on **Render.com** (`render.yaml`). Build: `npm install && npm run build`. Start: `node server.js`. The Express server serves the React `build/` directory directly — there is no separate static hosting. Healthcheck hits `/api/news`.

## Static Data File

`asu_hockey_data.json` is the source of truth for roster photos, curated player data, recruiting info, and `manual_news` entries (hand-written news stories that appear in the news feed). It's hand-maintained and read directly by the server.

Root utility scripts for editing this file:

- `add-photos.js` — add player photo URLs
- `add-new-recruits.js` — add recruiting entries interactively
- `clean-recruiting.js` — clean/validate recruiting data
- `add-current-team.js` — manage current season roster entries

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
- `src/components/NewsFeed.jsx` — reusable news card list
- `src/components/UpcomingGames.jsx` — upcoming games widget

## Assets

- `public/assets/flags/` — SVG country flag files (`usa.svg`, `can.svg`, `swe.svg`, `svk.svg`) used for player nationality display
- `public/assets/` — hero images as optimized WebP (`hero-arena-opt.webp`, `hero-arena-mobile-opt.webp`)
- Use `process.env.PUBLIC_URL` in JSX inline styles for public folder assets — **never** `url('/path')` in CSS files (webpack tries to resolve as module)

## Test Structure

- `src/**/__tests__/` — Jest unit tests for React components and services
- `__tests__/` — Jest unit tests for server-side code (roster-service, scraper caching, recruiting scraper); run with `jest.server.config.js`
- `tests/` — Playwright E2E tests (home, news, roster, api endpoints)
- `src/__mocks__/` — axios and react-router-dom mocks for unit tests

E2E tests target `http://localhost:3000` with the Express backend at `:5000`. The Playwright config auto-starts both servers when running tests.

## Planning Docs

`docs/plans/` contains markdown plans for past features (e.g., `2026-03-03-news-hybrid-layout.md`). Add new plans here before implementing larger features.
