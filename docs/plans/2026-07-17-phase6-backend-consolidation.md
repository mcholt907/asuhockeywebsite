# Phase 6 — Backend Layout Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all backend code out of `src/` and the repo root into a `server/` tree, extract the 4×-duplicated cache/SWR/coalesce/fallback pipeline into one `createCachedScraper` helper, and split the `scraper.js` god module into per-dataset modules with thin route modules — behavior-preserving throughout (roadmap items 11–13 of `docs/plans/2026-06-09-architecture-review-improvement-plan.md`).

**Architecture:** New `server/` directory housing `cache/` (caching-system, scrape-health, data-status, cache-maintenance), `lib/` (request-helper), `scrapers/` (pipeline helper + one module per dataset), `services/` (moved from root `services/`), `routes/` (API router), `app.js`, and `scheduler.js`. Root `server.js` becomes a thin entry (dotenv + Sentry init + listen) so Render's `node server.js` start command is unchanged. The cache data directory moves from `src/scripts/cache/` to `server/cache/data/`, exported once from `caching-system.js` and imported everywhere else (kills two hardcoded copies of that path).

**Tech Stack:** Node/Express (CommonJS), Jest (`jest.server.config.js` for everything in `__tests__/`), Playwright E2E as the end-to-end safety net.

## Global Constraints

- **Behavior-preserving**: every existing export keeps its name and call signature (`fetchNewsData()`, `fetchScheduleData(forceRefresh)`, `scrapeCHNStats(forceRefresh)`, `scrapeCHNRoster()`, `scrapeNCHCStandings(forceRefresh)`, `scrapeTransferData()`, `scrapeAlumniData()`, `fetchRecruitingData(includePhotos)`, `scrapePlayerProfile`, `scrapePlayerPhoto`, `scrapeEliteProspectsRecruiting`). API response shapes unchanged.
- **Cache keys and TTLs unchanged**: `asu_hockey_news`, `asu_hockey_schedule_<year>`, `asu_hockey_stats`, `asu_hockey_roster`, `nchc_standings`, `asu_transfers`, `asu_alumni`, `asu_hockey_recruiting`.
- **Force-refresh semantics unchanged**: `force` skips only the fresh-cache check; the SWR branch still serves current data and refreshes in the background (this is how the post-game cron behaves today — do not make force block on a live scrape).
- **Render deploy unchanged**: start command stays `node server.js`; `playwright.config.ts` webServer commands unchanged.
- Run `npx jest --config jest.server.config.js` after every task; it must be green before each commit.
- Work on branch `refactor/phase6-backend-layout`. Do not push until the user asks (they review locally first). When opening a PR later, chain `gh pr merge --auto --merge`.

## Known acceptable deltas (documented, intentional)

1. Every scraper now emits a `scraper.<name>.duration` Sentry metric (previously only news/schedule/stats did). The schedule metric now covers the CHN-links + USCHO enrichment too, not just the schedules API call.
2. `fetchRecruitingData(true)` (includePhotos, local-scripts-only path): if the scrape returns all-empty seasons AND a stale cache exists, the helper returns the stale cache instead of the empty result. Strictly better; unreachable in normal operation.
3. Console log wording is normalized to `[<name>] …` prefixes inside the shared pipeline. Scrape-internal logs are preserved as-is.

## Target file structure

```
server/
  cache/
    caching-system.js      # moved from src/scripts/ — data dir now server/cache/data/
    scrape-health.js       # moved from src/scripts/
    data-status.js         # moved from src/scripts/
    cache-maintenance.js   # moved from src/scripts/
    data/                  # runtime cache files (gitignored), was src/scripts/cache/
  lib/
    request-helper.js      # moved from utils/ — cooldown dir imported from caching-system
  scrapers/
    create-cached-scraper.js  # NEW: shared pipeline (item 12)
    news.js                # from scraper.js
    schedule.js            # from scraper.js
    stats.js               # from scraper.js
    standings.js           # from scraper.js
    roster.js              # from scraper.js
    transfers.js           # from transfer-scraper.js, rewritten on the pipeline
    alumni.js              # from alumni-scraper.js, rewritten on the pipeline
    recruiting.js          # from recruiting-scraper.js, rewritten on the pipeline
    index.js               # re-exports the public scraper API
  services/
    roster-service.js      # moved from services/
    static-data.js         # moved from services/
    sitemap-metadata.js    # moved from services/
  routes/
    api.js                 # NEW: all /api/* handlers as an express.Router
  app.js                   # NEW: express app assembly (middleware, routes, static, sentry)
  scheduler.js             # moved from src/scripts/
server.js                  # root, becomes thin entry: dotenv + Sentry.init + scheduler + listen
config/scraper-config.js   # stays (add urls.chnRoster)
```

Deleted when their replacements land: `scraper.js`, `transfer-scraper.js`, `alumni-scraper.js`, `recruiting-scraper.js`, `scraper.test.js` (root manual-run script, not executed by either Jest config, asserts an outdated schedule shape), `utils/` (incl. dead `request_helper.py`), `src/scripts/`, `config/scraper_config.py`, `config/__init__.py`, `config/__pycache__/`, `src/scripts/__pycache__/` if present.

---

### Task 1: Create `server/`, move the cache layer, scheduler, and request-helper out of `src/` and `utils/`

**Files:**
- Move: `src/scripts/caching-system.js` → `server/cache/caching-system.js`
- Move: `src/scripts/scrape-health.js` → `server/cache/scrape-health.js`
- Move: `src/scripts/data-status.js` → `server/cache/data-status.js`
- Move: `src/scripts/cache-maintenance.js` → `server/cache/cache-maintenance.js`
- Move: `src/scripts/scheduler.js` → `server/scheduler.js`
- Move: `utils/request-helper.js` → `server/lib/request-helper.js`
- Delete: `utils/request_helper.py`, `utils/__pycache__/`, `config/scraper_config.py`, `config/__init__.py`, `config/__pycache__/`
- Modify: `server.js`, `scraper.js`, `transfer-scraper.js`, `alumni-scraper.js`, `recruiting-scraper.js`, `add-new-recruits.js`, `.gitignore`
- Test (modify): `__tests__/caching-system.test.js`, `__tests__/cache-maintenance.test.js`, `__tests__/data-status.test.js`, `__tests__/scraper-caching.test.js`, `__tests__/sundevils-api.test.js`, `__tests__/recruiting-scraper.test.js`

**Interfaces:**
- Produces: `server/cache/caching-system.js` exporting `{ saveToCache, getFromCache, getCacheMeta, CACHE_DIR, DEFAULT_CACHE_DURATION }` (unchanged API, new `CACHE_DIR` default `server/cache/data`); `server/lib/request-helper.js` exporting `{ requestWithRetry, delayBetweenRequests, HostCooldownError }` (unchanged API); `server/scheduler.js` exporting `{ startScheduler }`.

- [ ] **Step 1: Baseline — run the server test suite**

Run: `npx jest --config jest.server.config.js`
Expected: all suites PASS. If not, stop and report — the refactor needs a green baseline.

- [ ] **Step 2: git mv the five modules and delete the dead Python ports**

```bash
mkdir -p server/cache server/lib
git mv src/scripts/caching-system.js server/cache/caching-system.js
git mv src/scripts/scrape-health.js server/cache/scrape-health.js
git mv src/scripts/data-status.js server/cache/data-status.js
git mv src/scripts/cache-maintenance.js server/cache/cache-maintenance.js
git mv src/scripts/scheduler.js server/scheduler.js
git mv utils/request-helper.js server/lib/request-helper.js
git rm -f utils/request_helper.py config/scraper_config.py config/__init__.py
rm -rf utils config/__pycache__ src/scripts/__pycache__
```

(`utils/` and `src/scripts/` may still contain the untracked `cache/` dir and `__pycache__`; `src/scripts/cache/` is handled in Step 3's note — do not delete the cache files.)

- [ ] **Step 3: Point the cache data directory at `server/cache/data/`**

In `server/cache/caching-system.js` change:

```js
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'cache');
```
to:
```js
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'data');
```

Then migrate the local warm cache (preserves cooldown markers and cached data; production is ephemeral and just cold-starts):

```powershell
New-Item -ItemType Directory -Force server\cache\data
if (Test-Path src\scripts\cache) { Move-Item src\scripts\cache\* server\cache\data\ -Force; Remove-Item -Recurse -Force src\scripts }
```

- [ ] **Step 4: Make request-helper import CACHE_DIR instead of hardcoding the path**

In `server/lib/request-helper.js` change:

```js
const config = require('../config/scraper-config');

const COOLDOWN_DIR = path.join(__dirname, '..', 'src', 'scripts', 'cache');
```
to:
```js
const config = require('../../config/scraper-config');
const { CACHE_DIR } = require('../cache/caching-system');

const COOLDOWN_DIR = CACHE_DIR;
```

(No import cycle: caching-system imports nothing from lib/.)

- [ ] **Step 5: Fix internal requires in the moved scheduler**

In `server/scheduler.js` change:

```js
const { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('../../scraper');
const { scrapeTransferData } = require('../../transfer-scraper');
const { scrapeAlumniData } = require('../../alumni-scraper');
const { runCacheMaintenance } = require('./cache-maintenance');
```
to:
```js
const { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('../scraper');
const { scrapeTransferData } = require('../transfer-scraper');
const { scrapeAlumniData } = require('../alumni-scraper');
const { runCacheMaintenance } = require('./cache/cache-maintenance');
```

`server/cache/data-status.js` needs no change (`../../config/scraper-config` and `./caching-system` resolve identically from the new location). `server/cache/cache-maintenance.js` needs no change either.

- [ ] **Step 6: Update every consumer's require paths**

- `server.js`: `./src/scripts/scheduler` → `./server/scheduler`; `./src/scripts/data-status` → `./server/cache/data-status`
- `scraper.js`: `./src/scripts/caching-system` → `./server/cache/caching-system`; `./utils/request-helper` → `./server/lib/request-helper`
- `transfer-scraper.js` and `alumni-scraper.js`: `./src/scripts/caching-system` → `./server/cache/caching-system`; `./src/scripts/scrape-health` → `./server/cache/scrape-health`; `./utils/request-helper` → `./server/lib/request-helper`
- `recruiting-scraper.js`: `./src/scripts/caching-system` → `./server/cache/caching-system`; `./utils/request-helper` → `./server/lib/request-helper`
- `add-new-recruits.js`: `./utils/request-helper` → `./server/lib/request-helper`

- [ ] **Step 7: Update test require/mock paths**

Replace every occurrence in `__tests__/`:
- `../src/scripts/caching-system` → `../server/cache/caching-system` (in `caching-system.test.js`, `scraper-caching.test.js`, `sundevils-api.test.js`, `recruiting-scraper.test.js` — both the `jest.mock(...)` path and the `require(...)`)
- `../src/scripts/cache-maintenance` → `../server/cache/cache-maintenance` (`cache-maintenance.test.js`)
- `../src/scripts/data-status` → `../server/cache/data-status` (`data-status.test.js`)
- `../utils/request-helper` → `../server/lib/request-helper` (`scraper-caching.test.js`, `sundevils-api.test.js`, `recruiting-scraper.test.js`)

Check for any others: `grep -rn "src/scripts\|utils/request-helper" __tests__/` must come back empty afterwards.

- [ ] **Step 8: Update `.gitignore`**

Change the cache line:
```
src/scripts/cache/
```
to:
```
server/cache/data/
```

- [ ] **Step 9: Verify**

Run: `npx jest --config jest.server.config.js`
Expected: PASS (same suite count as baseline).
Run: `node -e "require('./server/cache/caching-system'); require('./server/lib/request-helper'); require('./server/scheduler'); console.log('requires ok')"`
Expected: `requires ok`.
Also confirm no stragglers: `grep -rn "src/scripts\|utils/request-helper" --include="*.js" server.js scraper.js transfer-scraper.js alumni-scraper.js recruiting-scraper.js add-new-recruits.js scripts/` → no hits.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(server): move cache layer, scheduler, request-helper into server/ (Phase 6, item 11)"
```

---

### Task 2: Move `services/` into `server/services/`

**Files:**
- Move: `services/roster-service.js` → `server/services/roster-service.js`
- Move: `services/static-data.js` → `server/services/static-data.js`
- Move: `services/sitemap-metadata.js` → `server/services/sitemap-metadata.js`
- Modify: `server.js`
- Test (modify): `__tests__/roster-service.test.js`, `__tests__/sitemap-metadata.test.js`

**Interfaces:**
- Consumes: root `scraper.js` still exists (until Task 5) — roster-service keeps importing it.
- Produces: `server/services/roster-service.js` exporting `{ determineNationality, getRoster }`; `server/services/static-data.js` exporting `{ getStaticData }`; `server/services/sitemap-metadata.js` exporting `{ getSitemapPages, toSitemapDate }`.

- [ ] **Step 1: git mv**

```bash
git mv services/roster-service.js server/services/roster-service.js
git mv services/static-data.js server/services/static-data.js
git mv services/sitemap-metadata.js server/services/sitemap-metadata.js
```

- [ ] **Step 2: Fix internal paths in the moved services**

`server/services/roster-service.js`:
```js
const { scrapeCHNRoster } = require('../../scraper');
const staticData = require('../../asu_hockey_data.json');
```

`server/services/static-data.js`:
```js
const DATA_FILE = path.join(__dirname, '..', '..', 'asu_hockey_data.json');
```

`server/services/sitemap-metadata.js`:
```js
const ROOT_DIR = path.join(__dirname, '..', '..');
```
and both cache-path joins change from `'src', 'scripts', 'cache'` to `'server', 'cache', 'data'`:
```js
function readCacheTimestamp(cacheKey, rootDir) {
  const filePath = path.join(rootDir, 'server', 'cache', 'data', cacheKey);
  ...
}
function readCacheTimestampsByPrefix(prefix, rootDir) {
  const cacheDir = path.join(rootDir, 'server', 'cache', 'data');
  ...
}
```

- [ ] **Step 3: Update consumers and tests**

- `server.js`: `./services/roster-service` → `./server/services/roster-service`, `./services/static-data` → `./server/services/static-data`, `./services/sitemap-metadata` → `./server/services/sitemap-metadata`
- `__tests__/roster-service.test.js`: `../services/roster-service` → `../server/services/roster-service` (require AND any `jest.mock` path)
- `__tests__/sitemap-metadata.test.js`: require path → `../server/services/sitemap-metadata`, and every fixture write path `path.join(rootDir, 'src', 'scripts', 'cache', …)` → `path.join(rootDir, 'server', 'cache', 'data', …)` (five occurrences: news, schedule_2025, roster, stats, transfers)

- [ ] **Step 4: Verify and commit**

Run: `npx jest --config jest.server.config.js` → PASS.
Run: `node -e "require('./server.js')" ` is NOT a good check (it starts the server) — instead: `node -e "require('./server/services/roster-service'); require('./server/services/sitemap-metadata'); console.log('ok')"` → `ok`.

```bash
git add -A
git commit -m "refactor(server): move services/ into server/services/ (Phase 6, item 11)"
```

---

### Task 3: Extract the shared scraper pipeline — `createCachedScraper` (TDD)

**Files:**
- Create: `server/scrapers/create-cached-scraper.js`
- Test (create): `__tests__/create-cached-scraper.test.js`

**Interfaces:**
- Consumes: `server/cache/caching-system.js` `{ saveToCache, getFromCache }`.
- Produces: `createCachedScraper(options) → async fetchData({ force = false, bypassCache = false, scrapeArgs } = {})`. Options: `{ name, cacheKey (string | () => string), ttl, scrape (async (scrapeArgs) => data), validate = () => true, fallback = null (() => data|null), fallbackOnly = () => false, swr = true, normalizeCached = (d) => d, onScrapeError = null ((err) => data; null ⇒ rethrow) }`. Tasks 4–7 build every scraper on exactly this signature.

Pipeline semantics (mirrors today's four hand-rolled copies):
1. Unless `bypassCache`: if not `force`, return fresh cache (normalized). 2. If `fallbackOnly()`, return `fallback()` if truthy. 3. If `swr` and stale cache exists (even under `force`): kick a coalesced background refresh, return stale (normalized). 4. Otherwise run a request-coalesced blocking scrape: on success `validate(data)` → save + return data; validation failure → stale → fallback → return raw data; thrown error → stale → fallback → `onScrapeError(err)` → rethrow. A `scraper.<name>.duration` Sentry metric wraps every real scrape.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/create-cached-scraper.test.js`:

```js
// Tests for the shared scrape pipeline (server-side Jest)
// Run: npx jest --config jest.server.config.js

jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/node", () => ({
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const { createCachedScraper } = require("../server/scrapers/create-cached-scraper");

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockResolvedValue(undefined);
});

function makeScraper(overrides = {}) {
  return createCachedScraper({
    name: "test",
    cacheKey: "test_key",
    ttl: 1000,
    scrape: jest.fn().mockResolvedValue(["fresh"]),
    validate: (d) => d.length > 0,
    ...overrides,
  });
}

describe("createCachedScraper", () => {
  test("returns fresh cache without scraping", async () => {
    const scrape = jest.fn();
    getFromCache.mockReturnValueOnce(["cached"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["cached"]);
    expect(scrape).not.toHaveBeenCalled();
  });

  test("applies normalizeCached to fresh cache", async () => {
    getFromCache.mockReturnValueOnce({ data: ["wrapped"] });
    const fetchData = makeScraper({
      normalizeCached: (c) => (Array.isArray(c) ? c : c.data),
    });
    await expect(fetchData()).resolves.toEqual(["wrapped"]);
  });

  test("SWR: serves stale immediately and refreshes in background", async () => {
    const scrape = jest.fn().mockResolvedValue(["new"]);
    // 1st call: fresh miss; 2nd call: stale hit
    getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(["stale"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["stale"]);
    await flush();
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(saveToCache).toHaveBeenCalledWith(["new"], "test_key", 1000);
  });

  test("force skips fresh cache but still serves stale via SWR", async () => {
    const scrape = jest.fn().mockResolvedValue(["new"]);
    getFromCache.mockReturnValueOnce(["stale"]); // first read is the stale read (fresh check skipped)
    const fetchData = makeScraper({ scrape });
    await expect(fetchData({ force: true })).resolves.toEqual(["stale"]);
    await flush();
    expect(scrape).toHaveBeenCalledTimes(1);
    // fresh-cache read (ignoreExpiration omitted) never happened
    expect(getFromCache).toHaveBeenCalledWith("test_key", true);
    expect(getFromCache).not.toHaveBeenCalledWith("test_key");
  });

  test("no cache at all: blocks on scrape, validates, saves", async () => {
    getFromCache.mockReturnValue(null);
    const fetchData = makeScraper();
    await expect(fetchData()).resolves.toEqual(["fresh"]);
    expect(saveToCache).toHaveBeenCalledWith(["fresh"], "test_key", 1000);
  });

  test("coalesces concurrent blocking scrapes into one", async () => {
    getFromCache.mockReturnValue(null);
    let release;
    const scrape = jest.fn(
      () => new Promise((resolve) => { release = () => resolve(["fresh"]); }),
    );
    const fetchData = makeScraper({ scrape });
    const p1 = fetchData();
    const p2 = fetchData();
    release();
    await expect(p1).resolves.toEqual(["fresh"]);
    await expect(p2).resolves.toEqual(["fresh"]);
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  test("validation failure: does not cache; returns stale if present, else raw result", async () => {
    const scrape = jest.fn().mockResolvedValue([]);
    // fresh miss, swr-stale miss, recovery-stale hit
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(["stale"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["stale"]);
    expect(saveToCache).not.toHaveBeenCalled();

    getFromCache.mockReturnValue(null);
    await expect(fetchData()).resolves.toEqual([]);
  });

  test("scrape error: stale, then fallback, then onScrapeError, then rethrow", async () => {
    getFromCache.mockReturnValue(null);
    const boom = jest.fn().mockRejectedValue(new Error("boom"));

    const withHandler = makeScraper({ scrape: boom, onScrapeError: () => ["empty"] });
    await expect(withHandler()).resolves.toEqual(["empty"]);

    const withFallback = makeScraper({ scrape: boom, fallback: () => ["fb"] });
    await expect(withFallback()).resolves.toEqual(["fb"]);

    const bare = makeScraper({ scrape: boom });
    await expect(bare()).rejects.toThrow("boom");
  });

  test("fallbackOnly short-circuits before scraping", async () => {
    getFromCache.mockReturnValue(null);
    const scrape = jest.fn();
    const fetchData = makeScraper({
      scrape,
      swr: false,
      fallbackOnly: () => true,
      fallback: () => ["bundled"],
    });
    await expect(fetchData()).resolves.toEqual(["bundled"]);
    expect(scrape).not.toHaveBeenCalled();
  });

  test("swr: false blocks on scrape when cache is expired", async () => {
    getFromCache.mockReturnValue(null);
    const scrape = jest.fn().mockResolvedValue(["live"]);
    const fetchData = makeScraper({ scrape, swr: false });
    await expect(fetchData()).resolves.toEqual(["live"]);
    // only the fresh read happened before scraping — no stale (true) read pre-scrape
    expect(getFromCache).toHaveBeenCalledWith("test_key");
  });

  test("bypassCache skips all cache reads and passes scrapeArgs", async () => {
    const scrape = jest.fn().mockResolvedValue(["photos"]);
    const fetchData = makeScraper({ scrape });
    await expect(
      fetchData({ bypassCache: true, scrapeArgs: { includePhotos: true } }),
    ).resolves.toEqual(["photos"]);
    expect(scrape).toHaveBeenCalledWith({ includePhotos: true });
    // no plain fresh-cache read occurred
    expect(getFromCache).not.toHaveBeenCalledWith("test_key");
  });

  test("cacheKey function is resolved per call", async () => {
    let season = 2025;
    getFromCache.mockReturnValue(null);
    const fetchData = makeScraper({ cacheKey: () => `key_${season}` });
    await fetchData();
    expect(saveToCache).toHaveBeenCalledWith(expect.anything(), "key_2025", 1000);
    season = 2026;
    await fetchData();
    expect(saveToCache).toHaveBeenCalledWith(expect.anything(), "key_2026", 1000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.server.config.js --testPathPattern="create-cached-scraper"`
Expected: FAIL — `Cannot find module '../server/scrapers/create-cached-scraper'`.

- [ ] **Step 3: Implement**

Create `server/scrapers/create-cached-scraper.js`:

```js
// create-cached-scraper.js
// Shared scrape pipeline: fresh-cache check → fallback-only short-circuit →
// SWR (serve stale, refresh in background) → request-coalesced blocking
// scrape → validate/health-guard → save → error recovery (stale → fallback).
// Replaces the four hand-rolled copies that lived in scraper.js,
// transfer-scraper.js, alumni-scraper.js and recruiting-scraper.js.

const Sentry = require("@sentry/node");
const { saveToCache, getFromCache } = require("../cache/caching-system");

function createCachedScraper({
  name,
  cacheKey,
  ttl,
  scrape,
  validate = () => true,
  fallback = null,
  fallbackOnly = () => false,
  swr = true,
  normalizeCached = (data) => data,
  onScrapeError = null,
}) {
  // Coalescing: one in-flight scrape per scraper, shared by concurrent callers.
  let inFlight = null;

  const resolveKey = () =>
    typeof cacheKey === "function" ? cacheKey() : cacheKey;

  function recoverWithStaleOrFallback(key) {
    const stale = getFromCache(key, true);
    if (stale) {
      console.log(`[${name}] Recovering with stale cache`);
      return normalizeCached(stale);
    }
    const bundled = fallback && fallback();
    if (bundled) {
      console.log(`[${name}] Recovering with bundled fallback`);
      return bundled;
    }
    return undefined;
  }

  async function runScrape(key, scrapeArgs) {
    const start = Date.now();
    try {
      const data = await scrape(scrapeArgs);
      if (validate(data)) {
        await saveToCache(data, key, ttl);
        return data;
      }
      console.warn(`[${name}] Scrape result failed validation; not caching`);
      const recovered = recoverWithStaleOrFallback(key);
      return recovered !== undefined ? recovered : data;
    } catch (error) {
      console.error(`[${name}] Scrape failed:`, error.message);
      const recovered = recoverWithStaleOrFallback(key);
      if (recovered !== undefined) return recovered;
      if (onScrapeError) return onScrapeError(error);
      throw error;
    } finally {
      Sentry.metrics.distribution(
        `scraper.${name}.duration`,
        Date.now() - start,
        { unit: "millisecond" },
      );
    }
  }

  function startCoalescedScrape(key, scrapeArgs) {
    if (!inFlight) {
      inFlight = runScrape(key, scrapeArgs).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  return async function fetchData(options = {}) {
    const { force = false, bypassCache = false, scrapeArgs } = options;
    const key = resolveKey();

    if (!bypassCache) {
      // force skips only this fresh-cache check; the SWR branch below still
      // serves current data and refreshes in the background, matching the
      // pre-refactor force-refresh semantics (post-game cron relies on this).
      if (!force) {
        try {
          const fresh = getFromCache(key);
          if (fresh) {
            console.log(`[${name}] Returning fresh cached data`);
            return normalizeCached(fresh);
          }
        } catch (error) {
          console.error(`[${name}] Cache read failed:`, error.message);
        }
      }

      // EP scrapers run fallback-only in production/prerender (cloud IPs 403).
      if (fallbackOnly()) {
        const bundled = fallback && fallback();
        if (bundled) {
          console.log(`[${name}] Fallback-only mode; returning bundled data`);
          return bundled;
        }
      }

      if (swr) {
        try {
          const stale = getFromCache(key, true);
          if (stale) {
            console.log(
              `[${name}] Serving stale cache; refreshing in background`,
            );
            startCoalescedScrape(key, scrapeArgs).catch((error) =>
              console.error(
                `[${name}] Background refresh failed:`,
                error.message,
              ),
            );
            return normalizeCached(stale);
          }
        } catch (error) {
          console.error(`[${name}] Stale cache read failed:`, error.message);
        }
      }
    }

    console.log(`[${name}] No usable cache; scraping live`);
    return startCoalescedScrape(key, scrapeArgs);
  };
}

module.exports = { createCachedScraper };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx jest --config jest.server.config.js --testPathPattern="create-cached-scraper"`
Expected: PASS (12 tests). Then run the full server suite: `npx jest --config jest.server.config.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scrapers/create-cached-scraper.js __tests__/create-cached-scraper.test.js
git commit -m "feat(server): add createCachedScraper shared pipeline (Phase 6, item 12)"
```

---

### Task 4: Split `scraper.js` — news and schedule modules

**Files:**
- Create: `server/scrapers/news.js`, `server/scrapers/schedule.js`
- Modify: `scraper.js` (delete moved code), `server.js`, `server/scheduler.js`
- Test (modify): `__tests__/sundevils-api.test.js`

**Interfaces:**
- Consumes: `createCachedScraper` (Task 3 signature), `requestWithRetry`/`delayBetweenRequests` from `../lib/request-helper`, `config` from `../../config/scraper-config`.
- Produces: `server/scrapers/news.js` exports `{ fetchNewsData, scrapeSunDevilsNewsList, scrapeCHN }`; `server/scrapers/schedule.js` exports `{ fetchScheduleData, scrapeSunDevilsSchedule, scrapeCHNScheduleLinks, scrapeUSCHORecord }`. Signatures identical to today's `scraper.js` exports.

- [ ] **Step 1: Create `server/scrapers/news.js`**

Move these verbatim from `scraper.js` (they are pure functions/scrapes, no pipeline logic): `JSON_REQUEST_OPTIONS`, `asJson()`, `formatArticleDate()`, `scrapeSunDevilsNewsList()` (lines 45–68), `scrapeCHN()` (lines 70–137), and the dedupe + sort bodies from `refreshNewsCache()` (lines 575–627) extracted into named helpers. Assemble as:

```js
// news.js — news aggregation (thesundevils.com website-api + CHN HTML)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

// ── verbatim from scraper.js: JSON_REQUEST_OPTIONS, asJson, formatArticleDate,
//    scrapeSunDevilsNewsList, scrapeCHN (keep their comments) ──

function dedupeArticles(articles) {
  // verbatim body of the dedupe block from refreshNewsCache (scraper.js:577-594),
  // returning uniqueArticles
}

function sortArticles(articles) {
  // verbatim comparator from refreshNewsCache (scraper.js:597-627): date desc,
  // then source, then title
}

async function scrapeAllNews() {
  const sunDevilsArticles = await scrapeSunDevilsNewsList();
  await delayBetweenRequests();
  const chnArticles = await scrapeCHN();
  const allArticles = dedupeArticles([...sunDevilsArticles, ...chnArticles]);
  sortArticles(allArticles);
  return allArticles;
}

const fetchNews = createCachedScraper({
  name: "news",
  cacheKey: "asu_hockey_news",
  ttl: config.cache.news,
  scrape: scrapeAllNews,
  validate: (articles) => articles.length > 0,
  // Older cache entries may be the raw array or a {data: []} wrapper.
  normalizeCached: (cached) =>
    Array.isArray(cached) ? cached : cached.data || [],
  onScrapeError: () => [],
});

async function fetchNewsData() {
  return fetchNews();
}

module.exports = { fetchNewsData, scrapeSunDevilsNewsList, scrapeCHN };
```

- [ ] **Step 2: Create `server/scrapers/schedule.js`**

Move verbatim from `scraper.js`: `seasonSlugFor()`, `formatGameResult()`, `mapScheduleEvent()`, `scrapeSunDevilsSchedule()`, `scrapeCHNScheduleLinks()`, `scrapeUSCHORecord()`, `enrichScheduleWithCHNLinks()` (lines 141–352, with their load-bearing format comments). It also needs `JSON_REQUEST_OPTIONS`/`asJson` — duplicate those two small definitions here (they are 5 lines; a shared module for them is not worth the coupling). Assemble:

```js
// schedule.js — Sun Devils schedule API + CHN box/metrics links + USCHO record
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

const JSON_REQUEST_OPTIONS = { headers: { Accept: "application/json" } };
function asJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data;
}

// ── verbatim from scraper.js: seasonSlugFor, formatGameResult,
//    mapScheduleEvent, scrapeSunDevilsSchedule, scrapeCHNScheduleLinks,
//    scrapeUSCHORecord, enrichScheduleWithCHNLinks ──

async function scrapeScheduleWithExtras() {
  const games = await scrapeSunDevilsSchedule(config.seasons.current);
  if (!games || games.length === 0) {
    return { games: games || [], team_record: null };
  }
  const { games: enriched, npi, krach } = await enrichScheduleWithCHNLinks(games);
  const teamRecord = await scrapeUSCHORecord();
  return { games: enriched, team_record: { ...teamRecord, npi, krach } };
}

const fetchSchedule = createCachedScraper({
  name: "schedule",
  cacheKey: () => `asu_hockey_schedule_${config.seasons.current}`,
  ttl: config.cache.schedule,
  scrape: scrapeScheduleWithExtras,
  validate: (result) => result.games.length > 0,
  // Pre-team_record cache entries were a bare games array.
  normalizeCached: (cached) =>
    Array.isArray(cached) ? { games: cached, team_record: null } : cached,
  onScrapeError: () => ({ games: [], team_record: null }),
});

async function fetchScheduleData(forceRefresh = false) {
  return fetchSchedule({ force: forceRefresh });
}

module.exports = {
  fetchScheduleData,
  scrapeSunDevilsSchedule,
  scrapeCHNScheduleLinks,
  scrapeUSCHORecord,
};
```

- [ ] **Step 3: Shrink `scraper.js` and update consumers**

- Delete from `scraper.js`: everything now living in news.js/schedule.js, plus the `newsPromise`/`schedulePromise` variables, `fetchScheduleData`, `fetchNewsData`, `refreshNewsCache`. Keep: stats, roster, standings code and their coalescing vars. Update its `module.exports` to only `{ scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings }`.
- `server.js`: replace the `require("./scraper")` destructure with:
```js
const { fetchNewsData } = require("./server/scrapers/news");
const { fetchScheduleData } = require("./server/scrapers/schedule");
const { scrapeCHNStats, scrapeNCHCStandings } = require("./scraper");
```
- `server/scheduler.js`: same split —
```js
const { fetchNewsData } = require('./scrapers/news');
const { fetchScheduleData } = require('./scrapers/schedule');
const { scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('../scraper');
```
- `__tests__/sundevils-api.test.js`: `require("../scraper")` → `require("../server/scrapers/news")` for `scrapeSunDevilsNewsList` and `require("../server/scrapers/schedule")` for `scrapeSunDevilsSchedule` (two separate requires).

- [ ] **Step 4: Verify and commit**

Run: `npx jest --config jest.server.config.js` → PASS (the sundevils-api and scraper-caching suites are the guard here).

```bash
git add -A
git commit -m "refactor(server): split news and schedule out of scraper.js onto the shared pipeline (Phase 6, items 12-13)"
```

---

### Task 5: Split `scraper.js` — stats, standings, roster; delete the god module

**Files:**
- Create: `server/scrapers/stats.js`, `server/scrapers/standings.js`, `server/scrapers/roster.js`, `server/scrapers/index.js`
- Modify: `config/scraper-config.js` (add `urls.chnRoster`), `server.js`, `server/scheduler.js`, `server/services/roster-service.js`
- Delete: `scraper.js`, `scraper.test.js` (root)
- Test (modify): `__tests__/scraper-caching.test.js`

**Interfaces:**
- Produces: `stats.js` exports `{ scrapeCHNStats }` (`(forceRefresh = false)`, throws on scrape failure with no stale cache); `standings.js` exports `{ scrapeNCHCStandings }` (`(forceRefresh = false)`); `roster.js` exports `{ scrapeCHNRoster }` (`()`); `index.js` re-exports the full scraper API for `server.js`/`scheduler.js`:

```js
// index.js — public scraper API
module.exports = {
  ...require("./news"),
  ...require("./schedule"),
  ...require("./stats"),
  ...require("./standings"),
  ...require("./roster"),
};
```
(transfers/alumni/recruiting are appended to this index in Tasks 6–7.)

- [ ] **Step 1: Add the roster URL to config**

In `config/scraper-config.js` `urls`, after `chnStats`, add:
```js
chnRoster:
  "https://www.collegehockeynews.com/reports/roster/Arizona-State/61",
```
And in `__tests__/scraper-caching.test.js`'s `jest.mock("../config/scraper-config", …)` `urls` object add: `chnRoster: "http://test/chn-roster",`.

- [ ] **Step 2: Create `server/scrapers/stats.js`**

```js
// stats.js — CHN player statistics (skaters + goalies)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

// ── verbatim from scraper.js: parseStatsHtml (lines 655-694) ──

async function scrapeStats() {
  const url = config.urls.chnStats(config.seasons.stats);
  console.log(`[CHN Stats Scraper] Fetching from: ${url}`);
  const { data } = await requestWithRetry(url);
  const $ = cheerio.load(data);
  const stats = parseStatsHtml($);
  console.log(
    `[CHN Stats Scraper] Scraped ${stats.skaters.length} skaters and ${stats.goalies.length} goalies.`,
  );
  return stats;
}

const fetchStats = createCachedScraper({
  name: "stats",
  cacheKey: "asu_hockey_stats",
  ttl: config.cache.stats,
  scrape: scrapeStats,
  // Empty is a valid offseason state — returned to callers but never cached.
  validate: (stats) => stats.skaters.length > 0 || stats.goalies.length > 0,
  // No onScrapeError: a failed scrape with no stale cache must propagate so
  // callers can distinguish failure from a legitimately empty stats page.
});

async function scrapeCHNStats(forceRefresh = false) {
  return fetchStats({ force: forceRefresh });
}

module.exports = { scrapeCHNStats };
```

- [ ] **Step 3: Create `server/scrapers/standings.js`**

```js
// standings.js — NCHC conference standings from USCHO's inertia data blob
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

async function scrapeStandings() {
  // verbatim body of fetchAndCacheNCHCStandings (scraper.js:933-975) MINUS
  // the try/catch wrapper, the saveToCache call and the teams.length guard —
  // parse and `return teams;`; let errors throw (the pipeline handles them)
}

const fetchStandings = createCachedScraper({
  name: "standings",
  cacheKey: "nchc_standings",
  ttl: config.cache.standings,
  scrape: scrapeStandings,
  validate: (teams) => teams.length > 0,
  onScrapeError: () => [],
});

async function scrapeNCHCStandings(forceRefresh = false) {
  return fetchStandings({ force: forceRefresh });
}

module.exports = { scrapeNCHCStandings };
```

Notes for the verbatim move: the `NCHC_TEAM_NAMES` constant (scraper.js:921-931) is referenced by nothing — drop it. Inside the parse, the "No NCHC data found" branch should `throw new Error('No NCHC data found in USCHO response')` instead of `return []` so the pipeline's recovery path handles it (today an empty return simply isn't cached and callers get `[]`; the pipeline's validate+onScrapeError produce the same `[]`).

- [ ] **Step 4: Create `server/scrapers/roster.js`**

```js
// roster.js — CHN roster scrape (merged with static data by roster-service)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

async function scrapeRoster() {
  const url = config.urls.chnRoster;
  console.log(`[CHN Roster Scraper] Attempting to fetch roster from: ${url}`);
  // verbatim parse body of scrapeAndCacheRoster (scraper.js:798-862): the
  // table/header heuristics and player normalization, ending with
  // `console.log(...players.length...)` and `return players;`.
  // Drop the saveToCache call and the outer try/catch (pipeline handles both).
}

const fetchRoster = createCachedScraper({
  name: "roster",
  cacheKey: "asu_hockey_roster",
  ttl: config.cache.roster,
  scrape: scrapeRoster,
  validate: (players) => players.length > 0,
  onScrapeError: () => [],
});

async function scrapeCHNRoster() {
  return fetchRoster();
}

module.exports = { scrapeCHNRoster };
```

- [ ] **Step 5: Create `server/scrapers/index.js`** (code in Interfaces above), **delete `scraper.js` and `scraper.test.js`, update consumers**

```bash
git rm scraper.js scraper.test.js
```
(`scraper.test.js` is a manual `node scraper.test.js` script no Jest config runs, and it asserts the pre-2026 schedule array shape — dead.)

- `server.js`: collapse the scraper imports to
```js
const {
  fetchNewsData,
  fetchScheduleData,
  scrapeCHNStats,
  scrapeNCHCStandings,
} = require("./server/scrapers");
```
- `server/scheduler.js`:
```js
const { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('./scrapers');
```
- `server/services/roster-service.js`: `require('../../scraper')` → `require('../scrapers/roster')`
- `__tests__/scraper-caching.test.js`: replace the `require("../scraper")` destructure with requires from the new modules:
```js
const { scrapeCHNRoster } = require("../server/scrapers/roster");
const { scrapeCHNScheduleLinks, scrapeUSCHORecord } = require("../server/scrapers/schedule");
const { scrapeCHNStats } = require("../server/scrapers/stats");
```
- `__tests__/roster-service.test.js`: its `jest.mock('../scraper')` / `require('../scraper')` become `../server/scrapers/roster` (mock shape `{ scrapeCHNRoster: jest.fn() }` unchanged).
- Sweep: `grep -rn "require(.*['\"]\.\./scraper['\"]\|require(.*['\"]\./scraper['\"]" --include="*.js" .` (excluding node_modules, docs) → no hits.

- [ ] **Step 6: Verify and commit**

Run: `npx jest --config jest.server.config.js` → PASS. The scraper-caching suite exercises SWR/coalescing/force behavior for roster, stats, schedule-links, USCHO — this is the main behavioral gate for the pipeline swap. If any test fails, fix the scraper module, not the test (the tests encode current production behavior).

```bash
git add -A
git commit -m "refactor(server): split stats/standings/roster onto the shared pipeline; delete scraper.js god module (Phase 6, items 12-13)"
```

---

### Task 6: Rewrite transfers and alumni on the pipeline

**Files:**
- Create: `server/scrapers/transfers.js` (from `transfer-scraper.js`), `server/scrapers/alumni.js` (from `alumni-scraper.js`)
- Delete: `transfer-scraper.js`, `alumni-scraper.js`
- Modify: `server.js` (via index import), `server/scheduler.js`, `server/scrapers/index.js`, `scripts/refresh-alumni.js`, `scripts/refresh-transfers.js`

**Interfaces:**
- Produces: `transfers.js` exports `{ scrapeTransferData }`; `alumni.js` exports `{ scrapeAlumniData }`. Both keep today's result shapes (`{incoming, outgoing, lastUpdated}` / `{skaters, goalies, lastUpdated}`), fallback-only behavior in production/prerender, `TRANSFER_SCRAPE_LIVE`/`ALUMNI_SCRAPE_LIVE` overrides, and the `reportScrapeHealth` guard.

- [ ] **Step 1: Create `server/scrapers/transfers.js`**

Move verbatim from `transfer-scraper.js`: `getFallbackTransferData()`, `shouldUseFallbackOnly()`, `extractPlayerId()`, `extractDateFromUrl()`, `parseTransferRow()`, and the entire parse body of the in-flight IIFE (lines 100–250: fetch → three-strategy parse → `result` object + logging). Drop: the cache check, coalescing var, health-guard/stale/fallback/error blocks (pipeline owns those now). New header/tail:

```js
// transfers.js — EliteProspects transfer feed (fallback-only in production:
// EP 403s cloud IPs; bundled JSON refreshed weekly via scripts/refresh-and-push.cmd)
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { reportScrapeHealth } = require('../cache/scrape-health');
const { requestWithRetry } = require('../lib/request-helper');
const { createCachedScraper } = require('./create-cached-scraper');

const TRANSFERS_URL = 'https://www.eliteprospects.com/team/18066/arizona-state-univ/transfers';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const FALLBACK_FILE = path.join(__dirname, '..', '..', 'data', 'asu_transfers_fallback.json');

// ── verbatim: getFallbackTransferData, shouldUseFallbackOnly,
//    extractPlayerId, extractDateFromUrl, parseTransferRow ──

async function scrapeTransfersLive() {
  // verbatim parse body: fetch TRANSFERS_URL, build incoming/outgoing,
  // return { incoming, outgoing, lastUpdated: new Date().toISOString() }
}

const fetchTransfers = createCachedScraper({
  name: 'transfers',
  cacheKey: 'asu_transfers',
  ttl: CACHE_TTL,
  swr: false, // EP scrapers never served stale pre-scrape; stale is error recovery only
  scrape: scrapeTransfersLive,
  // Only flag when BOTH directions are empty — one empty direction during a
  // quiet period is normal.
  validate: (result) =>
    reportScrapeHealth('transfers', {
      totalTransfers: result.incoming.length + result.outgoing.length,
    }),
  fallback: getFallbackTransferData,
  fallbackOnly: shouldUseFallbackOnly,
  onScrapeError: () => ({ incoming: [], outgoing: [], lastUpdated: null }),
});

async function scrapeTransferData() {
  return fetchTransfers();
}

module.exports = { scrapeTransferData };
```

(The `testScraper()` / `require.main` block is dropped — `scripts/refresh-transfers.js` is the supported manual runner.)

- [ ] **Step 2: Create `server/scrapers/alumni.js`**

Same pattern. Move verbatim from `alumni-scraper.js`: `getFallbackAlumniData()`, `shouldUseFallbackOnly()`, `extractPlayerId()`, `parsePlayerInfo()`, `scrapePage()`, `scrapeAllPages()`. `FALLBACK_FILE = path.join(__dirname, '..', '..', 'data', 'asu_alumni_fallback.json')`. Scrape + config:

```js
async function scrapeAlumniLive() {
  const [skaters, goalies] = await Promise.all([
    scrapeAllPages('skaters'),
    scrapeAllPages('goalies'),
  ]);
  // keep the unique-count + NHL-entries logging block verbatim
  return { skaters, goalies, lastUpdated: new Date().toISOString() };
}

const fetchAlumni = createCachedScraper({
  name: 'alumni',
  cacheKey: 'asu_alumni',
  ttl: CACHE_TTL,
  swr: false,
  scrape: scrapeAlumniLive,
  validate: (result) =>
    reportScrapeHealth('alumni', {
      skaters: result.skaters.length,
      goalies: result.goalies.length,
    }),
  fallback: getFallbackAlumniData,
  fallbackOnly: shouldUseFallbackOnly,
  onScrapeError: () => ({ skaters: [], goalies: [], lastUpdated: null }),
});

async function scrapeAlumniData() {
  return fetchAlumni();
}

module.exports = { scrapeAlumniData };
```

- [ ] **Step 3: Delete old files, wire consumers**

```bash
git rm transfer-scraper.js alumni-scraper.js
```
- `server/scrapers/index.js`: add `...require("./transfers"), ...require("./alumni"),`
- `server.js`: drop the two direct requires; add `scrapeTransferData, scrapeAlumniData` to the `require("./server/scrapers")` destructure.
- `server/scheduler.js`: drop `require('../transfer-scraper')` / `require('../alumni-scraper')` lines; add both names to the `require('./scrapers')` destructure.
- `scripts/refresh-alumni.js`: `require('../alumni-scraper')` → `require('../server/scrapers/alumni')`
- `scripts/refresh-transfers.js`: `require('../transfer-scraper')` → `require('../server/scrapers/transfers')`

- [ ] **Step 4: Verify and commit**

Run: `npx jest --config jest.server.config.js` → PASS.
Smoke the fallback-only path (this is what production and Playwright exercise):
```powershell
$env:IS_PRERENDER='true'; node -e "require('./server/scrapers/transfers').scrapeTransferData().then(d => console.log('transfers', d.incoming.length, d.outgoing.length)); require('./server/scrapers/alumni').scrapeAlumniData().then(d => console.log('alumni', d.skaters.length, d.goalies.length))"
```
Expected: non-zero counts from the bundled fallback JSON, no network hit (watch for the "Fallback-only mode" log). Note: if a fresh `asu_transfers`/`asu_alumni` cache file exists locally the cache short-circuits first — that's correct behavior; delete the two cache files from `server/cache/data/` to see the fallback log.

```bash
git add -A
git commit -m "refactor(server): move transfers and alumni scrapers onto the shared pipeline (Phase 6, item 12)"
```

---

### Task 7: Rewrite recruiting on the pipeline

**Files:**
- Create: `server/scrapers/recruiting.js` (from `recruiting-scraper.js`)
- Delete: `recruiting-scraper.js`
- Modify: `server/scrapers/index.js`, `add-photos.js`, `add-current-team.js`
- Test (modify): `__tests__/recruiting-scraper.test.js`

**Interfaces:**
- Produces: `recruiting.js` exports `{ fetchRecruitingData, scrapeEliteProspectsRecruiting, scrapePlayerProfile, scrapePlayerPhoto }`, signatures unchanged. `fetchRecruitingData(includePhotos = false)`: `includePhotos: true` bypasses the cache entirely (used only by root curation scripts).

- [ ] **Step 1: Create `server/scrapers/recruiting.js`**

Move verbatim: `scrapePlayerProfile()`, `scrapePlayerPhoto()`, `scrapeEliteProspectsRecruiting()`, and the per-season loop from `scrapeAndCacheRecruiting()` (minus its cache-save block). Replace `fetchRecruitingData` with the pipeline:

```js
const cheerio = require('cheerio');
const config = require('../../config/scraper-config');
const { requestWithRetry, delayBetweenRequests } = require('../lib/request-helper');
const { createCachedScraper } = require('./create-cached-scraper');

// ── verbatim: scrapePlayerProfile, scrapePlayerPhoto,
//    scrapeEliteProspectsRecruiting ──

async function scrapeAllSeasons({ includePhotos = false } = {}) {
  const recruitingData = {};
  for (const season of config.FUTURE_SEASONS || ['2026-2027', '2027-2028', '2028-2029']) {
    console.log(`[Recruiting] Scraping season: ${season}${includePhotos ? ' with photos' : ''}`);
    recruitingData[season] = await scrapeEliteProspectsRecruiting(season, includePhotos);
    await delayBetweenRequests();
  }
  return recruitingData;
}

const fetchRecruiting = createCachedScraper({
  name: 'recruiting',
  cacheKey: 'asu_hockey_recruiting',
  // no ttl: saveToCache's 24h default, same as the old bare saveToCache call
  scrape: scrapeAllSeasons,
  validate: (data) => Object.values(data).some((arr) => arr.length > 0),
});

async function fetchRecruitingData(includePhotos = false) {
  return fetchRecruiting({
    bypassCache: includePhotos,
    scrapeArgs: { includePhotos },
  });
}

module.exports = {
  fetchRecruitingData,
  scrapeEliteProspectsRecruiting,
  scrapePlayerProfile,
  scrapePlayerPhoto,
};
```

- [ ] **Step 2: Delete old file, wire consumers**

```bash
git rm recruiting-scraper.js
```
- `server/scrapers/index.js`: add `...require("./recruiting"),`
- `add-photos.js`: `require('./recruiting-scraper')` → `require('./server/scrapers/recruiting')`
- `add-current-team.js`: `require('./recruiting-scraper')` → `require('./server/scrapers/recruiting')`
- `__tests__/recruiting-scraper.test.js`: `require('../recruiting-scraper')` → `require('../server/scrapers/recruiting')`; the file now transitively requires `@sentry/node` (via the pipeline) — add at the top with the other mocks:
```js
jest.mock('@sentry/node', () => ({
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));
```
(if the file already mocks Sentry, keep the existing mock.)

- [ ] **Step 3: Verify and commit**

Run: `npx jest --config jest.server.config.js` → PASS.

```bash
git add -A
git commit -m "refactor(server): move recruiting scraper onto the shared pipeline (Phase 6, item 12)"
```

---

### Task 8: Thin routes + app assembly; server.js becomes an entry point

**Files:**
- Create: `server/routes/api.js`, `server/app.js`
- Modify: `server.js` (root — shrinks to ~40 lines)

**Interfaces:**
- Consumes: `server/scrapers` index, `server/services/*`, `server/cache/data-status`.
- Produces: `server/routes/api.js` exports an `express.Router` with `/status, /news, /schedule, /recruits, /transfers, /alumni, /roster, /stats, /standings` (paths relative to the `/api` mount). `server/app.js` exports the configured `app` (everything except Sentry.init, scheduler start, and `listen`).

- [ ] **Step 1: Create `server/routes/api.js`**

All nine `/api/*` handler bodies move verbatim from `server.js:141–315`; only the wrapper changes (`app.get("/api/news", …)` → `router.get("/news", …)`):

```js
// api.js — thin /api route handlers; all data logic lives in scrapers/services
const express = require("express");
const {
  fetchNewsData,
  fetchScheduleData,
  scrapeCHNStats,
  scrapeNCHCStandings,
  scrapeTransferData,
  scrapeAlumniData,
} = require("../scrapers");
const { getRoster } = require("../services/roster-service");
const { getStaticData } = require("../services/static-data");
const { getDataStatus, getCooldownStatus } = require("../cache/data-status");

const router = express.Router();

// ── the nine handlers, verbatim bodies from server.js, mounted as:
// router.get("/status", …)   router.get("/news", …)
// router.get("/schedule", …) router.get("/recruits", …)
// router.get("/transfers", …) router.get("/alumni", …)
// router.get("/roster", …)   router.get("/stats", …)
// router.get("/standings", …) ──

module.exports = router;
```

- [ ] **Step 2: Create `server/app.js`**

Everything from today's `server.js` between (exclusive) the Sentry.init block and (exclusive) `app.listen`, minus the scheduler start and the HTTPS-redirect/env bits that need `isProduction` — compute that locally:

```js
// app.js — express app assembly; no listening, no scheduler, no Sentry.init
// (those live in the root server.js entry point)
const Sentry = require("@sentry/node");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const path = require("path");
const apiRouter = require("./routes/api");
const { getSitemapPages } = require("./services/sitemap-metadata");

const isProduction = process.env.NODE_ENV === "production";
const app = express();
app.set("trust proxy", 1);

// ── verbatim from server.js, in this order: HTTPS-redirect middleware
// (guarded by isProduction && IS_PRERENDER !== "true"), compression, helmet
// block, CORS allowlist + middleware, apiLimiter + app.use("/api/", apiLimiter),
// /healthz handler ──

app.use("/api", apiRouter);

// ── verbatim: /sitemap.xml handler ──

app.use(express.static(path.join(__dirname, "..", "build")));
Sentry.setupExpressErrorHandler(app);
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "build", "index.html"));
});

module.exports = app;
```

Note the two `__dirname` changes: `build` paths gain a `".."` because app.js lives one level down.

- [ ] **Step 3: Rewrite root `server.js` as the entry point**

```js
// server.js — entry point: env, Sentry, scheduler, listen.
// App assembly lives in server/app.js; routes in server/routes/api.js.
require("dotenv").config();
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  profilesSampleRate: isProduction ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,
});

// Require after Sentry.init so instrumented modules see the client.
const app = require("./server/app");
const { startScheduler } = require("./server/scheduler");

const port = process.env.PORT || 5000;

if (process.env.IS_PRERENDER !== "true") {
  startScheduler();
}

app.listen(port, () => {
  // verbatim startup banner from today's server.js listen callback
});
```

- [ ] **Step 4: Verify end-to-end**

1. `npx jest --config jest.server.config.js` → PASS
2. `npm test` (React suite; nothing should have touched it, confirm) → PASS
3. `npm run build` → succeeds (prerender spawns the server — this exercises the new entry)
4. `npm run test:e2e:chromium` → PASS (`tests/api.spec.ts` hits every endpoint through the new router; Playwright spawns `node server.js` with `IS_PRERENDER=true`)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(server): extract app assembly and thin API router; server.js is now a thin entry (Phase 6, item 13/B7)"
```

---

### Task 9: Documentation sweep + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- **Architecture / Data flow**: item 1 file list → `server/scrapers/` modules (`news.js`, `schedule.js`, `stats.js`, `standings.js`, `roster.js`, `transfers.js`, `alumni.js`, `recruiting.js`, all built on `server/scrapers/create-cached-scraper.js`); item 2 → `server/cache/caching-system.js`, cache at `server/cache/data/`; item 3 → `server/scheduler.js`, maintenance via `server/cache/cache-maintenance.js`; item 4 → mention `server/app.js` + `server/routes/api.js`, status built on `server/cache/data-status.js`; "Key architectural decision" → `server/services/roster-service.js`.
- Note in Architecture: request coalescing now lives inside `createCachedScraper` (no more module-level promise variables).
- Any other `src/scripts/`, `utils/request-helper`, root-scraper path mentions → new paths (search CLAUDE.md for `src/scripts`, `utils/`, `scraper.js`, `transfer-scraper`, `alumni-scraper`, `recruiting-scraper`, `services/roster-service`).

- [ ] **Step 2: Repo-wide straggler sweep**

```bash
grep -rn "src/scripts\|utils/request-helper\|\./scraper'\|\./scraper\"\|transfer-scraper\|alumni-scraper\|recruiting-scraper" --include="*.js" --include="*.ts" --include="*.json" --include="*.cjs" --include="*.mjs" . | grep -v node_modules | grep -v docs/ | grep -v build/
```
Expected: no hits (docs/plans history is allowed to reference old paths).

- [ ] **Step 3: Final full verification**

Run all four gates from Task 8 Step 4 once more on the final tree. All green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: update CLAUDE.md for server/ backend layout (Phase 6)"
```

**Post-merge notes (for the session that lands this):**
- Update auto-memory: `MEMORY.md` "Key Files" section and the EP-cooldown memory reference `src/scripts/cache/.403-cooldown-…` → `server/cache/data/.403-cooldown-…`; `services/roster-service.js` → `server/services/roster-service.js`; scraper file names in the scraper-reviewer agent's description remain stale (it names root `scraper.js` etc.) — update `.claude/agents/scraper-reviewer.md` if present.
- On each dev machine, move any warm local cache once: `Move-Item src\scripts\cache\* server\cache\data\` (Task 1 Step 3 does this for the primary machine).
