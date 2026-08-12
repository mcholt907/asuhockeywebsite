# NCHC Offseason Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the latest played-season NCHC standings visible on the Home page until any NCHC member completes a game in the newly configured season.

**Architecture:** Introduce one standings-snapshot module that owns record validation, the first-game predicate, and bundled snapshot loading. The USCHO scraper will return season-tagged snapshots through the existing cached-scraper pipeline, while the API preserves its `data` array and adds season metadata for the Home-page heading. A guarded atomic refresh command will maintain the committed fallback through the existing weekly refresh workflow.

**Tech Stack:** Node.js 20, CommonJS, Express, Cheerio, file cache, Jest 29, React 19, TypeScript types, TanStack Query, Playwright Chromium, Windows batch automation.

## Global Constraints

- USCHO remains the only live standings provider.
- The season switches only when at least one NCHC team's overall wins, losses, and ties sum to more than zero.
- A missing, malformed, or all-`0-0-0` live table must resolve to the latest valid played-season snapshot and must never be cached.
- `GET /api/standings` must preserve the existing top-level `data` array and add `season` and `isPriorSeason`.
- The Home-page heading must identify the displayed season in compact `YYYY-YY` form.
- Snapshot writes must be same-directory, atomic, guarded from production/prerender, and preserve old bytes on no-change or failure.
- An unpublished NCHC dataset or structurally valid all-zero table is a successful refresh no-op; malformed data, requests, and writes fail nonzero.
- Do not add dependencies, calendar cutoffs, another standings provider, or Home-page layout changes.
- Keep all implementation work in `C:\Users\farkh\asuhockeywebsite\.worktrees\codex-elite-prospects-team-rosters` on `codex/nchc-offseason-standings`.
- Use strict red-green TDD for every behavior change and request a fresh review after each task.

---

## File Structure

- `server/services/standings-snapshot.js`: snapshot shape validation, record parsing, first-game predicate, and bundled JSON loading.
- `server/scrapers/standings.js`: USCHO parsing, current-season tagging, season-scoped cached recovery, and public scraper API.
- `data/nchc_standings_fallback.json`: committed most-recent played-season snapshot.
- `server/routes/api.js`: compatible HTTP envelope with season metadata.
- `server/cache/data-status.js`: season-scoped standings cache key and fallback observability.
- `scripts/refresh-standings.js`: guarded live-only scrape plus atomic fallback replacement.
- `src/types/api.ts` and `src/pages/Home.jsx`: response typing and season-labelled heading.
- Focused tests live in new files for the snapshot, scraper, route, refresh command, and Home page; existing status, maintenance, E2E, and workflow tests cover integration boundaries.

### Task 1: Standings Snapshot Contract and Seed Data

**Files:**
- Create: `server/services/standings-snapshot.js`
- Create: `data/nchc_standings_fallback.json`
- Create: `__tests__/standings-snapshot.test.js`

**Interfaces:**
- Produces: `parseRecordGames(record: unknown): number | null`.
- Produces: `hasPlayedGame(teams: unknown): boolean`.
- Produces: `validateStandingsSnapshot(snapshot: unknown, options?: { requirePlayedGame?: boolean }): boolean`.
- Produces: `readStandingsFallback(options?: { fallbackFile?: string, fileSystem?: typeof fs }): StandingsSnapshot`; throws on missing or invalid data.
- `StandingsSnapshot` is `{ season: string, lastUpdated: string, teams: StandingsTeam[] }`.

- [ ] **Step 1: Write the failing snapshot unit tests**

```js
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseRecordGames,
  hasPlayedGame,
  validateStandingsSnapshot,
  readStandingsFallback,
} = require("../server/services/standings-snapshot");

const team = (overallRecord = "0-0-0") => ({
  rank: "1",
  team: "Arizona State",
  pts: "0",
  confRecord: "0-0-0",
  overallRecord,
  isASU: true,
});

const snapshot = (overallRecord = "14-21-1") => ({
  season: "2025-2026",
  lastUpdated: "2026-07-17T20:09:00.364Z",
  teams: [team(overallRecord)],
});

test("counts wins, losses, and ties from a strict record", () => {
  expect(parseRecordGames("14-21-1")).toBe(36);
  expect(parseRecordGames("14-21")).toBeNull();
});

test("treats an all-zero table as not started", () => {
  expect(hasPlayedGame([team("0-0-0"), team("0-0-0")])).toBe(false);
  expect(hasPlayedGame([team("1-0-0"), team("0-1-0")])).toBe(true);
});

test("rejects malformed and unplayed snapshots", () => {
  expect(validateStandingsSnapshot(snapshot("not-a-record"))).toBe(false);
  expect(validateStandingsSnapshot(snapshot("0-0-0"))).toBe(false);
  expect(
    validateStandingsSnapshot(snapshot("0-0-0"), { requirePlayedGame: false }),
  ).toBe(true);
});

test("loads a valid fallback and throws for invalid bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "standings-snapshot-"));
  const fallbackFile = path.join(directory, "fallback.json");
  fs.writeFileSync(fallbackFile, JSON.stringify(snapshot()));
  expect(readStandingsFallback({ fallbackFile })).toEqual(snapshot());
  fs.writeFileSync(fallbackFile, JSON.stringify(snapshot("0-0-0")));
  expect(() => readStandingsFallback({ fallbackFile })).toThrow(
    "Standings fallback is incomplete or malformed",
  );
  fs.rmSync(directory, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the new test and capture the expected red result**

Run:

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/standings-snapshot.test.js
```

Expected: FAIL because `server/services/standings-snapshot.js` does not exist.

- [ ] **Step 3: Implement the minimal snapshot module**

```js
const fs = require("fs");
const path = require("path");

const DEFAULT_FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "nchc_standings_fallback.json",
);

function parseRecordGames(record) {
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(String(record || "").trim());
  return match ? Number(match[1]) + Number(match[2]) + Number(match[3]) : null;
}

function hasScalarValue(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    String(value).trim().length > 0
  );
}

function isTeam(team) {
  return Boolean(
    team &&
      hasScalarValue(team.rank) &&
      typeof team.team === "string" &&
      team.team.trim() &&
      hasScalarValue(team.pts) &&
      parseRecordGames(team.confRecord) !== null &&
      parseRecordGames(team.overallRecord) !== null &&
      typeof team.isASU === "boolean",
  );
}

function hasPlayedGame(teams) {
  return Array.isArray(teams) && teams.some((team) => {
    const games = parseRecordGames(team?.overallRecord);
    return games !== null && games > 0;
  });
}

function validateStandingsSnapshot(snapshot, { requirePlayedGame = true } = {}) {
  if (!snapshot || !/^\d{4}-\d{4}$/.test(snapshot.season)) return false;
  if (!Number.isFinite(Date.parse(snapshot.lastUpdated))) return false;
  if (!Array.isArray(snapshot.teams) || snapshot.teams.length === 0) return false;
  if (!snapshot.teams.every(isTeam)) return false;
  return !requirePlayedGame || hasPlayedGame(snapshot.teams);
}

function readStandingsFallback({
  fallbackFile = DEFAULT_FALLBACK_FILE,
  fileSystem = fs,
} = {}) {
  const snapshot = JSON.parse(fileSystem.readFileSync(fallbackFile, "utf8"));
  if (!validateStandingsSnapshot(snapshot)) {
    throw new Error("Standings fallback is incomplete or malformed");
  }
  return snapshot;
}

module.exports = {
  DEFAULT_FALLBACK_FILE,
  parseRecordGames,
  hasPlayedGame,
  validateStandingsSnapshot,
  readStandingsFallback,
};
```

- [ ] **Step 4: Seed the committed 2025-26 snapshot from the verified cache**

Create `data/nchc_standings_fallback.json` with `season: "2025-2026"`, `lastUpdated: "2026-07-17T20:09:00.364Z"`, and these exact rows:

```json
[
  { "rank": "1", "team": "North Dakota", "pts": "55", "confRecord": "17-6-1", "overallRecord": "29-10-1", "isASU": false },
  { "rank": "2", "team": "Denver", "pts": "52", "confRecord": "17-6-1", "overallRecord": "29-11-3", "isASU": false },
  { "rank": "3", "team": "Western Michigan", "pts": "48", "confRecord": "16-7-1", "overallRecord": "27-11-1", "isASU": false },
  { "rank": "4", "team": "Minnesota Duluth", "pts": "36", "confRecord": "11-12-1", "overallRecord": "24-15-1", "isASU": false },
  { "rank": "5", "team": "St. Cloud State", "pts": "30", "confRecord": "9-14-1", "overallRecord": "16-19-1", "isASU": false },
  { "rank": "6", "team": "Colorado College", "pts": "29", "confRecord": "7-11-6", "overallRecord": "13-17-6", "isASU": false },
  { "rank": "7", "team": "Miami", "pts": "28", "confRecord": "9-13-2", "overallRecord": "18-16-2", "isASU": false },
  { "rank": "8", "team": "Omaha", "pts": "24", "confRecord": "8-16-0", "overallRecord": "12-24-0", "isASU": false },
  { "rank": "9", "team": "Arizona State", "pts": "22", "confRecord": "7-16-1", "overallRecord": "14-21-1", "isASU": true }
]
```

Wrap the array as the `teams` property shown in the design spec.

- [ ] **Step 5: Run the focused test and validate the committed JSON**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/standings-snapshot.test.js
node -e "const s=require('./data/nchc_standings_fallback.json'); if(s.season!=='2025-2026'||s.teams.length!==9||!s.teams.find(t=>t.isASU)) process.exit(1)"
git diff --check
```

Expected: all checks PASS.

- [ ] **Step 6: Commit and request a fresh review**

```powershell
git add server/services/standings-snapshot.js data/nchc_standings_fallback.json __tests__/standings-snapshot.test.js
git commit -m "feat(standings): add played-season snapshot contract"
```

### Task 2: USCHO Scraper, Cache Recovery, and Status

**Files:**
- Modify: `server/scrapers/standings.js`
- Modify: `server/cache/data-status.js`
- Create: `__tests__/standings-scraper.test.js`
- Modify: `__tests__/data-status.test.js`
- Modify: `__tests__/cache-maintenance.test.js`

**Interfaces:**
- Consumes: Task 1's `validateStandingsSnapshot`, `hasPlayedGame`, and `readStandingsFallback`.
- Produces: `parseUSCHOStandings(html: string): StandingsTeam[]`.
- Produces: `StandingsNotPublishedError` with `code === "STANDINGS_NOT_PUBLISHED"` for a missing or empty `nt` dataset.
- Produces: `scrapeLiveNCHCStandings(): Promise<StandingsSnapshot>` with `season === config.CURRENT_SEASON`.
- Produces: `scrapeNCHCStandings(forceRefresh?: boolean, options?: { bypassCache?: boolean }): Promise<StandingsSnapshot>`.
- Produces: cache key `nchc_standings_${config.CURRENT_SEASON}`.

- [ ] **Step 1: Write failing parser and recovery regressions**

Create an HTML fixture helper inside `__tests__/standings-scraper.test.js`:

```js
jest.mock("@sentry/node", () => ({
  metrics: { distribution: jest.fn() },
}));
jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
}));
jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
}));
jest.mock("../server/services/standings-snapshot", () => {
  const actual = jest.requireActual("../server/services/standings-snapshot");
  return { ...actual, readStandingsFallback: jest.fn() };
});

function uschoHtml(rows) {
  const page = { props: { content: { data: { nt: rows } } } };
  const encoded = JSON.stringify(page).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
}

const row = (overall = "0-0-0") => ({
  team: "Arizona State",
  pts: 0,
  "conf-w-l-t": "0-0-0",
  "w-l-t": overall,
});

const fallbackSnapshot = require("../data/nchc_standings_fallback.json");
const { requestWithRetry } = require("../server/lib/request-helper");
const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const {
  readStandingsFallback,
} = require("../server/services/standings-snapshot");
const {
  parseUSCHOStandings,
  scrapeNCHCStandings,
} = require("../server/scrapers/standings");

test("parses a valid NCHC table without treating all-zero rows as played", () => {
  const { parseUSCHOStandings } = require("../server/scrapers/standings");
  const teams = parseUSCHOStandings(uschoHtml([row()]));
  expect(teams[0]).toEqual(expect.objectContaining({
    team: "Arizona State",
    overallRecord: "0-0-0",
    isASU: true,
  }));
});

test("throws when the NCHC dataset is missing", () => {
  const { parseUSCHOStandings } = require("../server/scrapers/standings");
  expect(() => parseUSCHOStandings(uschoHtml(undefined))).toThrow(
    "No NCHC data found in USCHO response",
  );
});
```

In the same file, mock `requestWithRetry` and the cache module before requiring the scraper, then assert:

```js
readStandingsFallback.mockReturnValue(fallbackSnapshot);
requestWithRetry.mockResolvedValue({ data: uschoHtml([row("0-0-0")]) });
getFromCache.mockReturnValue(null);
await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
expect(saveToCache).not.toHaveBeenCalled();

requestWithRetry.mockResolvedValue({ data: uschoHtml([row("1-0-0")]) });
await expect(scrapeNCHCStandings()).resolves.toEqual(
  expect.objectContaining({ season: "2026-2027" }),
);
expect(saveToCache).toHaveBeenCalledWith(
  expect.objectContaining({ teams: expect.any(Array) }),
  "nchc_standings_2026-2027",
  expect.any(Number),
);
```

Also cover network rejection with a stale current-season snapshot, followed by cold-cache fallback recovery.

- [ ] **Step 2: Add failing status and maintenance assertions**

Add to `__tests__/data-status.test.js`:

```js
test("uses the season-scoped standings cache key and bundled fallback", () => {
  const config = require("../config/scraper-config");
  const standings = datasetByName("standings");
  expect(standings.key).toBe(`nchc_standings_${config.CURRENT_SEASON}`);
  expect(standings.source).toBe("fallback");
  expect(standings.file).toBe("data/nchc_standings_fallback.json");
});
```

Add to `__tests__/cache-maintenance.test.js`:

```js
test("never prunes the configured-season standings cache", () => {
  const config = require("../config/scraper-config");
  const key = `nchc_standings_${config.CURRENT_SEASON}`;
  writeCacheEntry(key, 30 * DAY_MS);
  expect(maintenance.pruneCache()).toEqual([]);
  expect(fs.existsSync(path.join(tmpDir, key))).toBe(true);
});
```

- [ ] **Step 3: Run the focused tests and capture red failures**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/standings-scraper.test.js __tests__/data-status.test.js __tests__/cache-maintenance.test.js
```

Expected: FAIL because the scraper still returns an array, the cache key is unscoped, and no standings fallback is registered.

- [ ] **Step 4: Refactor the scraper around season-tagged snapshots**

Use these boundaries in `server/scrapers/standings.js`:

```js
class StandingsNotPublishedError extends Error {
  constructor() {
    super("No NCHC data found in USCHO response");
    this.name = "StandingsNotPublishedError";
    this.code = "STANDINGS_NOT_PUBLISHED";
  }
}

function parseUSCHOStandings(html) {
  const $ = cheerio.load(html);
  const raw = $("#app").attr("data-page");
  if (!raw) throw new Error("No data-page attribute found on #app");
  const page = JSON.parse(raw);
  const nchcRows = page?.props?.content?.data?.nt;
  if (!Array.isArray(nchcRows) || nchcRows.length === 0) {
    throw new StandingsNotPublishedError();
  }
  return nchcRows.map((row, index) => {
    const team = String(row.team || "").replace(/^\d+\s+/, "").trim();
    return {
      rank: String(index + 1),
      team,
      pts: row.pts == null ? "" : String(row.pts),
      confRecord: String(row["conf-w-l-t"] || ""),
      overallRecord: String(row["w-l-t"] || ""),
      isASU: team.toLowerCase().includes("arizona"),
    };
  });
}

async function scrapeLiveNCHCStandings() {
  const { data } = await requestWithRetry(config.urls.nchcStandings);
  return {
    season: config.CURRENT_SEASON,
    lastUpdated: new Date().toISOString(),
    teams: parseUSCHOStandings(data),
  };
}

const fetchStandings = createCachedScraper({
  name: "standings",
  cacheKey: () => `nchc_standings_${config.CURRENT_SEASON}`,
  ttl: config.cache.standings,
  scrape: scrapeLiveNCHCStandings,
  validate: (snapshot) => validateStandingsSnapshot(snapshot),
  fallback: () => readStandingsFallback(),
});

async function scrapeNCHCStandings(
  forceRefresh = false,
  { bypassCache = false } = {},
) {
  return fetchStandings({ force: forceRefresh, bypassCache });
}

module.exports = {
  StandingsNotPublishedError,
  parseUSCHOStandings,
  scrapeLiveNCHCStandings,
  scrapeNCHCStandings,
};
```

Do not retain `onScrapeError: () => []`; failures without cache or fallback must propagate.

- [ ] **Step 5: Register the scoped cache and fallback in data status**

Replace the standings dataset entry in `server/cache/data-status.js` with:

```js
{
  name: "standings",
  cacheKey: () => `nchc_standings_${config.CURRENT_SEASON}`,
  fallbackFile: "data/nchc_standings_fallback.json",
  staleAfterMs: DAY_MS,
  alert: true,
},
```

- [ ] **Step 6: Run focused and neighboring cache tests**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/standings-snapshot.test.js __tests__/standings-scraper.test.js __tests__/create-cached-scraper.test.js __tests__/data-status.test.js __tests__/cache-maintenance.test.js
git diff --check
```

Expected: all focused tests PASS; all-zero live data returns fallback without a cache write; played data uses the scoped cache.

- [ ] **Step 7: Commit and request a fresh review**

```powershell
git add server/scrapers/standings.js server/cache/data-status.js __tests__/standings-scraper.test.js __tests__/data-status.test.js __tests__/cache-maintenance.test.js
git commit -m "fix(standings): retain prior season until first game"
```

### Task 3: API Metadata and Home-Page Season Label

**Files:**
- Modify: `server/routes/api.js`
- Create: `__tests__/api-standings.test.js`
- Modify: `src/types/api.ts`
- Modify: `src/pages/Home.jsx`
- Create: `src/pages/__tests__/Home.test.jsx`
- Modify: `tests/api.spec.ts`
- Modify: `tests/home.spec.ts`

**Interfaces:**
- Consumes: Task 2's `scrapeNCHCStandings(): Promise<StandingsSnapshot>`.
- Produces: `{ data: StandingsTeam[], season: string, isPriorSeason: boolean, timestamp: string }` from `/api/standings`.
- Produces: `StandingsResponse.season: string` and `StandingsResponse.isPriorSeason: boolean`.

- [ ] **Step 1: Write failing route tests for compatible metadata**

Model `__tests__/api-standings.test.js` after `__tests__/api-recruits.test.js`. Mock every dependency imported by the router, locate the `/standings` handler, and assert:

```js
jest.mock("../server/scrapers", () => ({
  fetchNewsData: jest.fn(),
  fetchScheduleData: jest.fn(),
  scrapeCHNStats: jest.fn(),
  scrapeNCHCStandings: jest.fn(),
  scrapeTransferData: jest.fn(),
  scrapeAlumniData: jest.fn(),
  fetchRecruitingData: jest.fn(),
}));
jest.mock("../server/services/roster-service", () => ({ getRoster: jest.fn() }));
jest.mock("../server/services/static-data", () => ({ getStaticData: jest.fn() }));
jest.mock("../server/cache/data-status", () => ({
  getDataStatus: jest.fn(),
  getCooldownStatus: jest.fn(),
}));

const { scrapeNCHCStandings } = require("../server/scrapers");
const router = require("../server/routes/api");

const standingsHandler = () => router.stack.find(
  (layer) => layer.route?.path === "/standings",
).route.stack[0].handle;

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

scrapeNCHCStandings.mockResolvedValue({
  season: "2025-2026",
  lastUpdated: "2026-07-17T20:09:00.364Z",
  teams: [{
    rank: "9",
    team: "Arizona State",
    pts: "22",
    confRecord: "7-16-1",
    overallRecord: "14-21-1",
    isASU: true,
  }],
});

await standingsHandler()({}, res);
expect(res.statusCode).toBe(200);
expect(res.payload).toEqual(expect.objectContaining({
  data: expect.any(Array),
  season: "2025-2026",
  isPriorSeason: true,
  timestamp: expect.any(String),
}));
```

Add a current-season case expecting `isPriorSeason: false`, a malformed empty snapshot expecting the existing controlled 500, and a thrown scraper error expecting the existing internal-error 500.

- [ ] **Step 2: Write the failing Home-page rendering test**

Create `src/pages/__tests__/Home.test.jsx`, mock `getSchedule`, `getNews`, and `getStandings`, and render with `renderWithQueryClient` plus `HelmetProvider`:

```jsx
import React from "react";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import Home from "../Home";
import { renderWithQueryClient } from "../../test-utils/renderWithQueryClient";

jest.mock("../../services/api", () => ({
  getSchedule: jest.fn(),
  getNews: jest.fn(),
  getStandings: jest.fn(),
}));

import {
  getSchedule,
  getNews,
  getStandings,
} from "../../services/api";

const renderHome = () => renderWithQueryClient(
  <HelmetProvider>
    <Home />
  </HelmetProvider>,
);

getSchedule.mockResolvedValue({ data: [], team_record: {} });
getNews.mockResolvedValue({ data: [] });
getStandings.mockResolvedValue({
  data: [{
    rank: "9",
    team: "Arizona State",
    pts: "22",
    confRecord: "7-16-1",
    overallRecord: "14-21-1",
    isASU: true,
  }],
  season: "2025-2026",
  isPriorSeason: true,
});

renderHome();
expect(await screen.findByRole("heading", {
  name: "2025-26 NCHC Standings",
})).toBeInTheDocument();
expect(screen.getByText("Arizona State")).toBeInTheDocument();
```

Add a current `2026-2027` response and expect `2026-27 NCHC Standings`.

- [ ] **Step 3: Run route and Home tests to verify red**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/api-standings.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath src/pages/__tests__/Home.test.jsx
```

Expected: route test FAIL because it receives the old array contract; Home test FAIL because the title is still `NCHC Standings`.

- [ ] **Step 4: Implement the compatible API envelope**

In `server/routes/api.js`, validate the snapshot before responding and derive prior-season state from configuration:

```js
const { validateStandingsSnapshot } = require("../services/standings-snapshot");

const standings = await scrapeNCHCStandings();
if (validateStandingsSnapshot(standings)) {
  res.json({
    data: standings.teams,
    season: standings.season,
    isPriorSeason: standings.season !== config.CURRENT_SEASON,
    timestamp: new Date().toISOString(),
  });
} else {
  res.status(500).json({ error: "Failed to fetch standings data." });
}
```

Keep the existing `try/catch` and error copy.

- [ ] **Step 5: Extend the frontend type and heading**

In `src/types/api.ts` make the metadata required:

```ts
export interface StandingsResponse {
  data: StandingsTeam[];
  season: string;
  isPriorSeason: boolean;
  timestamp?: string;
}
```

In `src/pages/Home.jsx`, add a local formatter and replace the heading:

```jsx
const formatSeason = (season) => {
  const match = /^(\d{4})-(\d{2})(\d{2})$/.exec(season || "");
  return match ? `${match[1]}-${match[3]}` : season;
};

const standingsTitle = standingsResponse?.season
  ? `${formatSeason(standingsResponse.season)} NCHC Standings`
  : "NCHC Standings";

<h3 className="right-section-title">{standingsTitle}</h3>
```

- [ ] **Step 6: Add API and browser contract assertions**

Add `standings` to the expected `/api/status` names in `tests/api.spec.ts`, then add:

```ts
test("GET /api/standings should return a season-tagged played table", async () => {
  const response = await apiContext.get("/api/standings");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(Array.isArray(body.data)).toBeTruthy();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.season).toMatch(/^\d{4}-\d{4}$/);
  expect(typeof body.isPriorSeason).toBe("boolean");
  expect(body.data.some((team: { overallRecord: string }) =>
    team.overallRecord !== "0-0-0",
  )).toBeTruthy();
});
```

Add to `tests/home.spec.ts`:

```ts
test("should display season-labelled NCHC standings", async ({ page }) => {
  await expect(page.getByRole("heading", {
    name: /^\d{4}-\d{2} NCHC Standings$/,
  })).toBeVisible();
  await expect(page.locator(".standings-widget-table tbody tr").first()).toBeVisible();
});
```

- [ ] **Step 7: Run focused server and React tests**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/api-standings.test.js __tests__/standings-snapshot.test.js __tests__/standings-scraper.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath src/pages/__tests__/Home.test.jsx src/hooks/queries/__tests__/useStandings.test.js src/services/__tests__/api.test.js
npm run typecheck
git diff --check
```

Expected: all focused tests and type-checking PASS.

- [ ] **Step 8: Commit and request a fresh review**

```powershell
git add server/routes/api.js __tests__/api-standings.test.js src/types/api.ts src/pages/Home.jsx src/pages/__tests__/Home.test.jsx tests/api.spec.ts tests/home.spec.ts
git commit -m "feat(standings): expose season on Home table"
```

### Task 4: Guarded Atomic Standings Refresh

**Files:**
- Create: `scripts/refresh-standings.js`
- Create: `__tests__/refresh-standings.test.js`

**Interfaces:**
- Consumes: Task 2's `scrapeLiveNCHCStandings()` and Task 1's `validateStandingsSnapshot()`.
- Produces: `refreshStandingsSnapshot(options?: { fetchData?: () => Promise<StandingsSnapshot | null>, fallbackFile?: string, fileSystem?: typeof fs, environment?: NodeJS.ProcessEnv }): Promise<StandingsSnapshot | null>`; `null` means the new season is not published or has no completed game.

- [ ] **Step 1: Write failing refresh tests**

Model the harness after `__tests__/refresh-recruiting.test.js`. Cover a valid write, all-zero rejection, malformed rejection, write failure, rename failure, and environment guards. The core assertions are:

```js
await refreshStandingsSnapshot({
  fetchData: async () => validSnapshot,
  fallbackFile: file,
});
expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(validSnapshot);
expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);

await expect(refreshStandingsSnapshot({
  fetchData: async () => ({ ...validSnapshot, teams: [team("0-0-0")] }),
  fallbackFile: file,
})).resolves.toBeNull();
expect(fs.readFileSync(file, "utf8")).toBe(previousContents);

await expect(refreshStandingsSnapshot({
  fetchData: async () => null,
  fallbackFile: file,
})).resolves.toBeNull();
expect(fs.readFileSync(file, "utf8")).toBe(previousContents);

await expect(refreshStandingsSnapshot({
  fetchData: async () => ({ ...validSnapshot, teams: [{ broken: true }] }),
  fallbackFile: file,
})).rejects.toThrow("validation failed; fallback preserved");

await expect(refreshStandingsSnapshot({
  environment: { NODE_ENV: "production" },
  fallbackFile: file,
  fetchData: async () => { throw new Error("fetch was attempted"); },
})).rejects.toThrow("live refresh is disabled in production and prerender environments");
```

For write and rename failures, inject the same partial `fileSystem` doubles used in `__tests__/refresh-recruiting.test.js` and assert the original bytes plus a directory containing only `fallback.json`.

Use these concrete doubles:

```js
const writeFailureFileSystem = {
  mkdirSync: fs.mkdirSync,
  renameSync: fs.renameSync,
  rmSync: fs.rmSync,
  writeFileSync(tempFile, contents) {
    fs.writeFileSync(tempFile, contents.slice(0, 10));
    throw new Error("simulated write failure");
  },
};

const renameFailureFileSystem = {
  mkdirSync: fs.mkdirSync,
  rmSync: fs.rmSync,
  writeFileSync: fs.writeFileSync,
  renameSync() {
    throw new Error("simulated rename failure");
  },
};
```

- [ ] **Step 2: Run the refresh test and capture red**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/refresh-standings.test.js
```

Expected: FAIL because `scripts/refresh-standings.js` does not exist.

- [ ] **Step 3: Implement the guarded atomic refresh command**

```js
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  DEFAULT_FALLBACK_FILE,
  hasPlayedGame,
  validateStandingsSnapshot,
} = require("../server/services/standings-snapshot");

function fetchLiveStandings() {
  const {
    scrapeLiveNCHCStandings,
    StandingsNotPublishedError,
  } = require("../server/scrapers/standings");
  return scrapeLiveNCHCStandings().catch((error) => {
    if (error instanceof StandingsNotPublishedError) return null;
    throw error;
  });
}

async function refreshStandingsSnapshot({
  fetchData = fetchLiveStandings,
  fallbackFile = DEFAULT_FALLBACK_FILE,
  fileSystem = fs,
  environment = process.env,
} = {}) {
  if (environment.NODE_ENV === "production" || environment.IS_PRERENDER === "true") {
    throw new Error(
      "[refresh-standings] live refresh is disabled in production and prerender environments",
    );
  }
  const snapshot = await fetchData();
  if (snapshot === null) return null;
  if (!validateStandingsSnapshot(snapshot, { requirePlayedGame: false })) {
    throw new Error("[refresh-standings] validation failed; fallback preserved");
  }
  if (!hasPlayedGame(snapshot.teams)) return null;
  const directory = path.dirname(fallbackFile);
  const tempFile = path.join(
    directory,
    `.${path.basename(fallbackFile)}.${process.pid}.${randomUUID()}.tmp`,
  );
  fileSystem.mkdirSync(directory, { recursive: true });
  try {
    fileSystem.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
    fileSystem.renameSync(tempFile, fallbackFile);
  } catch (error) {
    try {
      fileSystem.rmSync(tempFile, { force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
  return snapshot;
}

if (require.main === module) {
  refreshStandingsSnapshot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { refreshStandingsSnapshot };
```

- [ ] **Step 4: Run the refresh and snapshot tests**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/refresh-standings.test.js __tests__/standings-snapshot.test.js __tests__/standings-scraper.test.js
node --check scripts/refresh-standings.js
git diff --check
```

Expected: all tests and syntax checks PASS.

- [ ] **Step 5: Commit and request a fresh review**

```powershell
git add scripts/refresh-standings.js __tests__/refresh-standings.test.js
git commit -m "feat(standings): add protected snapshot refresh"
```

### Task 5: Weekly Automation and Operator Documentation

**Files:**
- Modify: `package.json`
- Modify: `scripts/refresh-and-push.cmd`
- Modify: `scripts/RefreshDataTask.xml`
- Modify: `README.md`
- Create: `__tests__/refresh-workflow.test.js`

**Interfaces:**
- Consumes: Task 4's `node scripts/refresh-standings.js` command.
- Produces: `npm run refresh-standings` and a `refresh-data` chain that includes standings.
- Produces: scheduled change detection, staging, commit, and PR copy covering all four fallback files.

- [ ] **Step 1: Write failing workflow wiring tests**

```js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("package scripts include the standings snapshot in refresh-data", () => {
  const scripts = require("../package.json").scripts;
  expect(scripts["refresh-standings"]).toBe("node scripts/refresh-standings.js");
  expect(scripts["refresh-data"]).toContain("npm run refresh-standings");
});

test("scheduled refresh detects and stages the standings fallback", () => {
  const command = read("scripts/refresh-and-push.cmd");
  const tracked = "data\\nchc_standings_fallback.json";
  const lines = command.split(/\r?\n/).map((line) => line.trim());
  expect(lines.find((line) => line.startsWith("git diff --quiet --"))).toContain(tracked);
  expect(lines.find((line) => line.startsWith("git add "))).toContain(tracked);
  expect(command).toContain("data: refresh bundled fallbacks (automated)");
});

test("Task Scheduler and README describe the standings refresh", () => {
  expect(read("scripts/RefreshDataTask.xml")).toMatch(/standings/i);
  expect(read("README.md")).toContain("npm run refresh-standings");
  expect(read("README.md")).toContain("first completed game");
});
```

- [ ] **Step 2: Run the workflow test and capture red**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/refresh-workflow.test.js
```

Expected: FAIL because the command and automation do not include standings.

- [ ] **Step 3: Wire package scripts and all tracked fallback paths**

Set the package scripts to:

```json
"refresh-standings": "node scripts/refresh-standings.js",
"refresh-data": "npm run refresh-alumni && npm run refresh-transfers && npm run refresh-recruiting && npm run refresh-standings"
```

In `scripts/refresh-and-push.cmd`, include `data\nchc_standings_fallback.json` in both `git diff --quiet -- ...` and `git add ...`. Change the commit title to `data: refresh bundled fallbacks (automated)`, change the PR title to the same wording, and describe alumni, transfer, recruiting, and NCHC standings fallback data in the PR body and file header.

- [ ] **Step 4: Update Task Scheduler and README copy**

Change the XML description to:

```xml
<Description>Weekly refresh of ASU Hockey alumni, transfer, recruiting, and NCHC standings fallback JSON. Pulls main, runs npm run refresh-data, commits, and opens an auto-merging PR when data changes.</Description>
```

Update README's Data Refresh section so the command block contains:

```bash
npm run refresh-data        # all bundled fallbacks
npm run refresh-recruiting  # projected future team rosters only
npm run refresh-standings   # latest played-season NCHC table only
```

State that production serves `data/nchc_standings_fallback.json` when USCHO has no current NCHC table or every overall record is `0-0-0`, and switches after the first completed game by any NCHC member.

- [ ] **Step 5: Run workflow, refresh, and syntax tests**

```powershell
npx jest --config jest.server.config.js --runInBand --runTestsByPath __tests__/refresh-workflow.test.js __tests__/refresh-standings.test.js
node --check scripts/refresh-standings.js
git diff --check
```

Expected: all checks PASS.

- [ ] **Step 6: Commit and request a fresh review**

```powershell
git add package.json scripts/refresh-and-push.cmd scripts/RefreshDataTask.xml README.md __tests__/refresh-workflow.test.js
git commit -m "chore(standings): automate fallback refresh"
```

### Task 6: Integrated Verification and Delivery Review

**Files:**
- Verify only; do not modify production files unless a failing check exposes a defect.
- Record evidence in the task report used by the executing workflow.

**Interfaces:**
- Consumes: Tasks 1-5 as one integrated branch.
- Produces: evidence that cold-deploy fallback, first-game switching, API metadata, UI rendering, refresh safety, and automation all work together.

- [ ] **Step 1: Run the complete server suite**

From a normal checkout:

```powershell
npx jest --config jest.server.config.js --runInBand
```

From the linked Windows worktree, if Jest reports zero matches, enumerate the top-level `__tests__\*.test.js` files and pass them to `--runTestsByPath` in batches small enough for the Windows command-line limit. Expected: every server suite PASS with zero failing tests.

Use this exact fallback command:

```powershell
$serverTests = @(Get-ChildItem -LiteralPath '__tests__' -Filter '*.test.js' -File | ForEach-Object { $_.FullName })
for ($index = 0; $index -lt $serverTests.Count; $index += 8) {
  $last = [Math]::Min($index + 7, $serverTests.Count - 1)
  $batch = $serverTests[$index..$last]
  npx jest --config jest.server.config.js --runInBand --runTestsByPath $batch
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

- [ ] **Step 2: Run the complete React suite**

```powershell
npx jest --config jest.config.js --runInBand --testMatch='**/src/**/*.{test,spec}.{js,jsx,ts,tsx}'
```

Expected: every React suite PASS with zero failing tests.

- [ ] **Step 3: Run static and production checks**

```powershell
npm run typecheck
$env:CI='true'; npm run build
git diff --check
git status --short --branch
```

Expected: type-check and build exit 0; only documented build-size advisories are acceptable; the worktree has no unstaged implementation files.

- [ ] **Step 4: Verify the API and Home page with branch-owned servers**

Ensure ports 3000 and 5000 are free so Playwright cannot reuse unrelated processes, then run:

```powershell
$env:CI='true'; npx playwright test tests/api.spec.ts tests/home.spec.ts --project=chromium
```

Expected: `/api/standings` returns nine played 2025-26 rows with `isPriorSeason: true` while USCHO has no played 2026-27 table, and Chromium displays `2025-26 NCHC Standings` with visible table rows.

- [ ] **Step 5: Run a final snapshot integrity check**

```powershell
node -e "const s=require('./data/nchc_standings_fallback.json'); const games=r=>r.split('-').map(Number).reduce((a,b)=>a+b,0); if(s.season!=='2025-2026'||s.teams.length!==9||!s.teams.some(t=>t.isASU)||!s.teams.some(t=>games(t.overallRecord)>0)) process.exit(1)"
git log --oneline origin/main..HEAD
```

Expected: integrity check exits 0 and the log contains the design commit, the plan commit, and five scoped implementation commits.

- [ ] **Step 6: Request final code review and resolve only evidence-backed findings**

The reviewer must verify the approved spec line-by-line, classify findings as Critical, Important, or Minor, and rerun the focused suites. Apply Critical or Important fixes with their own red-green cycle and a dedicated commit; record deferred Minor findings explicitly.

- [ ] **Step 7: Use the finishing workflow for publication**

Invoke `superpowers:finishing-a-development-branch`, then follow the repository policy: push `codex/nchc-offseason-standings`, open a PR, enable auto-merge after CI passes, and verify no implementation commit is orphaned.
