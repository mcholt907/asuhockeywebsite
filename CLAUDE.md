# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a **monorepo** combining a React frontend (Create React App) and an Express backend in a single Node.js project.

**Data flow:**
1. `scraper.js` / `transfer-scraper.js` / `alumni-scraper.js` — scrape external sites (thesundevils.com, collegehockeynews.com) using cheerio + axios
2. `src/scripts/caching-system.js` — file-based cache at `src/scripts/cache/`, implements stale-while-revalidate (expired cache is served while background refresh runs)
3. `src/scripts/scheduler.js` — node-cron jobs that pre-warm the cache on startup and on schedule (news/stats: 12 AM & 12 PM; roster/alumni/transfers: 3 AM daily)
4. `server.js` — Express server on port 5000 that serves API routes and the React `build/` as static files
5. `src/services/api.js` — frontend axios wrapper that calls the backend via `/api/*` (proxied via CRA proxy in dev)
6. `src/pages/` — React pages, each fetching from `src/services/api.js`

**Key architectural decision:** The `/api/roster` endpoint merges data from two sources — `asu_hockey_data.json` (static file with photos and curated data) and a live CHN scrape — at request time. Recruiting data reads directly from `asu_hockey_data.json`. Stats/news/schedule use the caching system with request coalescing (module-level promise variables in `scraper.js`).

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

## Deployment

Deployed on **Render.com** (`render.yaml`). Build: `npm install && npm run build`. Start: `node server.js`. The Express server serves the React `build/` directory directly — there is no separate static hosting.

## Static Data File

`asu_hockey_data.json` is the source of truth for roster photos, curated player data, and recruiting info. It's hand-maintained and read directly by the server. The `add-photos.js` and `clean-recruiting.js` scripts in the root are utilities for editing this file.

## Test Structure

- `src/**/__tests__/` — Jest unit tests for React components and services
- `tests/` — Playwright E2E tests (home, news, roster, api endpoints)
- `src/__mocks__/` — axios and react-router-dom mocks for unit tests

E2E tests target `http://localhost:3000` with the Express backend at `:5000`. The Playwright config auto-starts both servers when running tests.
