# Elite Prospects Team Rosters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every future-season tab on the Recruiting page serve the exact Arizona State roster published by Elite Prospects for that season.

**Architecture:** Extend the existing Elite Prospects recruiting scraper with the fallback-only production pattern already used by alumni and transfers. A validated local refresh writes a bundled season-roster snapshot; `/api/recruits` serves that scraper result, and the frontend presents each key as a team season without rolling players between seasons.

**Tech Stack:** Node.js 20, Express, Cheerio, Puppeteer request fallback, Jest, React 19, TanStack Query, Testing Library, Playwright.

## Global Constraints

- Elite Prospects is authoritative for membership in every displayed future-season roster.
- A player may appear in multiple seasons, and no cross-season deduplication is allowed.
- Production and prerendering must not make an Elite Prospects recruiting request.
- Every configured future season must be present; an individual far-future season may be empty, but the complete snapshot must contain at least one player.
- Invalid or partial refreshes must leave the previous fallback file untouched.
- Keep `asu_hockey_data.json.recruiting` available for current-roster profile enrichment, but do not serve it from `/api/recruits`.
- Preserve the existing `Record<string, Recruit[]>` API response shape.
- Use Barlow Condensed and the established Recruiting page layout; no CSS redesign is in scope.
- Create or switch to `codex/elite-prospects-team-rosters` before implementation.
- After editing `server/scrapers/recruiting.js`, invoke the scraper-reviewer agent before completing the task.

---

## File Structure

- Create `server/services/recruiting-snapshot.js`: pure validation and filesystem loading for bundled recruiting snapshots.
- Modify `server/scrapers/recruiting.js`: live scrape, fallback-only selection, cached recovery, and exported test seams.
- Create `scripts/refresh-recruiting.js`: validated local refresh command with an injectable core function.
- Create `data/asu_recruiting_fallback.json`: latest validated Elite Prospects season-roster snapshot.
- Modify `server/routes/api.js`: asynchronously serve `fetchRecruitingData()`.
- Modify `server/cache/data-status.js`: report recruiting cache/fallback age and alert on staleness.
- Modify `src/pages/Recruiting.jsx`: present season keys as team rosters.
- Create `src/pages/__tests__/Recruiting.test.jsx`: page-level season behavior tests.
- Modify refresh workflow, package scripts, API tests, status tests, scraper tests, and repository documentation.

---

### Task 1: Snapshot Validation and Loading

**Files:**
- Create: `server/services/recruiting-snapshot.js`
- Create: `__tests__/recruiting-snapshot.test.js`

**Interfaces:**
- Consumes: `data: unknown`, `seasons: string[]`, and an optional JSON file path.
- Produces: `validateRecruitingSnapshot(data, seasons): boolean` and `readRecruitingSnapshot(filePath, seasons): object | null`.

- [ ] **Step 1: Write the failing validation tests**

```js
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateRecruitingSnapshot,
  readRecruitingSnapshot,
} = require("../server/services/recruiting-snapshot");

const seasons = ["2027-2028", "2028-2029", "2029-2030"];
const player = (name) => ({
  name,
  player_link: `https://www.eliteprospects.com/player/1/${name.toLowerCase()}`,
});

test("accepts all configured seasons and a legitimately empty far-future roster", () => {
  expect(validateRecruitingSnapshot({
    "2027-2028": [player("Shared Player")],
    "2028-2029": [player("Shared Player")],
    "2029-2030": [],
  }, seasons)).toBe(true);
});

test.each([
  [{ "2027-2028": [player("A")], "2028-2029": [] }],
  [{ "2027-2028": [], "2028-2029": [], "2029-2030": [] }],
  [{ "2027-2028": [{ name: "No Link" }], "2028-2029": [], "2029-2030": [] }],
])("rejects an incomplete, all-empty, or malformed snapshot", (candidate) => {
  expect(validateRecruitingSnapshot(candidate, seasons)).toBe(false);
});

test("reads a valid snapshot and rejects an invalid file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-snapshot-"));
  const file = path.join(dir, "snapshot.json");
  const valid = {
    "2027-2028": [player("One")],
    "2028-2029": [],
    "2029-2030": [],
  };
  fs.writeFileSync(file, JSON.stringify(valid));
  expect(readRecruitingSnapshot(file, seasons)).toEqual(valid);
  fs.writeFileSync(file, JSON.stringify({ "2027-2028": [] }));
  expect(readRecruitingSnapshot(file, seasons)).toBeNull();
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test and verify the module-not-found failure**

Run: `npx jest --config jest.server.config.js __tests__/recruiting-snapshot.test.js --runInBand`

Expected: FAIL because `server/services/recruiting-snapshot.js` does not exist.

- [ ] **Step 3: Implement the snapshot service**

```js
const fs = require("fs");

function validateRecruitingSnapshot(data, seasons) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(seasons) || seasons.length === 0) return false;
  let totalPlayers = 0;
  for (const season of seasons) {
    const roster = data[season];
    if (!Array.isArray(roster)) return false;
    for (const player of roster) {
      if (
        !player ||
        typeof player !== "object" ||
        typeof player.name !== "string" ||
        !player.name.trim() ||
        typeof player.player_link !== "string" ||
        !player.player_link.trim()
      ) return false;
      totalPlayers += 1;
    }
  }
  return totalPlayers > 0;
}

function readRecruitingSnapshot(filePath, seasons) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return validateRecruitingSnapshot(parsed, seasons) ? parsed : null;
  } catch (error) {
    console.warn(`[Recruiting Snapshot] Unavailable: ${error.message}`);
    return null;
  }
}

module.exports = { validateRecruitingSnapshot, readRecruitingSnapshot };
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx jest --config jest.server.config.js __tests__/recruiting-snapshot.test.js --runInBand`

Expected: PASS with four validation cases covered.

- [ ] **Step 5: Commit the snapshot boundary**

```powershell
git add server/services/recruiting-snapshot.js __tests__/recruiting-snapshot.test.js
git commit -m "feat(recruiting): validate bundled team roster snapshots"
```

---

### Task 2: Production-Safe Elite Prospects Recruiting Scraper

**Files:**
- Modify: `server/scrapers/recruiting.js`
- Modify: `__tests__/recruiting-scraper.test.js`

**Interfaces:**
- Consumes: `config.FUTURE_SEASONS`, `RECRUITING_SCRAPE_LIVE`, `NODE_ENV`, `IS_PRERENDER`, and `data/asu_recruiting_fallback.json`.
- Produces: `fetchRecruitingData(includeProfiles?: boolean): Promise<Record<string, Recruit[]>>`, `getFallbackRecruitingData(): object | null`, and `shouldUseFallbackOnly(): boolean`.

- [ ] **Step 1: Extend the scraper tests with fallback-only and cross-season cases**

Add `"2027-2028"` as a second season in the existing config mock. Mock `readRecruitingSnapshot` to return a small valid season map and use `jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 })` in the production test so Task 2 does not depend on the live-generated fallback from Task 3. Replace the existing SWR-specific stale-cache test with a recovery test because Elite Prospects scrapers use `swr: false`:

```js
test("recovers with stale data when a blocking live scrape fails", async () => {
  const staleData = { "2026-2027": [{ name: "John Doe" }] };
  getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(staleData);
  requestWithRetry.mockRejectedValue(new Error("EP unavailable"));
  await expect(fetchRecruitingData()).resolves.toEqual(staleData);
});
```

Add the cross-season case inside the HTML-parsing describe block so it can reuse `fixtureHtml`, then add the mode-selection cases:

```js
test("keeps the same player in every Elite Prospects season that lists them", async () => {
  getFromCache.mockReturnValue(null);
  requestWithRetry
    .mockResolvedValueOnce({ data: fixtureHtml })
    .mockResolvedValueOnce({ data: fixtureHtml });

  const result = await fetchRecruitingData(false, { bypassCache: true });

  expect(result["2026-2027"].map((p) => p.name)).toContain("Jane Smith");
  expect(result["2027-2028"].map((p) => p.name)).toContain("Jane Smith");
});

test("uses the bundled snapshot without a network request in production", async () => {
  process.env.NODE_ENV = "production";
  getFromCache.mockReturnValue(null);
  jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });
  const result = await fetchRecruitingData();
  expect(result).toEqual(expect.objectContaining({
    "2027-2028": expect.any(Array),
  }));
  expect(requestWithRetry).not.toHaveBeenCalled();
  delete process.env.NODE_ENV;
});

test("the explicit live flag disables fallback-only mode", () => {
  process.env.NODE_ENV = "production";
  process.env.RECRUITING_SCRAPE_LIVE = "true";
  expect(shouldUseFallbackOnly()).toBe(false);
  delete process.env.RECRUITING_SCRAPE_LIVE;
  delete process.env.NODE_ENV;
});
```

Add `const fs = require("fs")` to the test, mock `readRecruitingSnapshot` before requiring the scraper, restore all spies, and update `afterEach` to delete both recruiting environment variables. Change `fetchRecruitingData` to accept an optional options object while preserving all current boolean-only callers.

- [ ] **Step 2: Run the scraper tests and verify the expected failures**

Run: `npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js --runInBand`

Expected: FAIL because production fallback selection, the exported mode helper, and explicit bypass options do not exist.

- [ ] **Step 3: Add the fallback-only pipeline to the scraper**

Add constants and helpers:

```js
const fs = require("fs");
const path = require("path");
const { reportScrapeHealth } = require("../cache/scrape-health");
const {
  validateRecruitingSnapshot,
  readRecruitingSnapshot,
} = require("../services/recruiting-snapshot");

const CACHE_TTL = 24 * 60 * 60 * 1000;
const FALLBACK_FILE = path.join(__dirname, "..", "..", "data", "asu_recruiting_fallback.json");
let fallbackCache = { mtimeMs: 0, value: null };

function getFallbackRecruitingData() {
  try {
    const stat = fs.statSync(FALLBACK_FILE);
    if (fallbackCache.value && fallbackCache.mtimeMs === stat.mtimeMs) {
      return fallbackCache.value;
    }
    const value = readRecruitingSnapshot(FALLBACK_FILE, config.FUTURE_SEASONS);
    if (value) fallbackCache = { mtimeMs: stat.mtimeMs, value };
    return value;
  } catch (error) {
    console.warn(`[Recruiting] Fallback unavailable: ${error.message}`);
    return null;
  }
}

function shouldUseFallbackOnly() {
  if (process.env.RECRUITING_SCRAPE_LIVE === "true") return false;
  return process.env.NODE_ENV === "production" || process.env.IS_PRERENDER === "true";
}
```

Configure `createCachedScraper` with this validation and recovery behavior. Preserve within-season link deduplication and do not add cross-season deduplication.

```js
const fetchRecruiting = createCachedScraper({
  name: "recruiting",
  cacheKey: "asu_hockey_recruiting",
  ttl: CACHE_TTL,
  swr: false,
  scrape: scrapeAllSeasons,
  validate: (data) => {
    const valid = validateRecruitingSnapshot(data, config.FUTURE_SEASONS);
    const totalPlayers = valid
      ? config.FUTURE_SEASONS.reduce((sum, season) => sum + data[season].length, 0)
      : 0;
    return reportScrapeHealth("recruiting", { validSnapshot: valid ? 1 : 0, totalPlayers });
  },
  fallback: getFallbackRecruitingData,
  fallbackOnly: shouldUseFallbackOnly,
  onScrapeError: () => ({}),
});
```

Use this backward-compatible fetch signature:

```js
async function fetchRecruitingData(includeProfiles = false, options = {}) {
  return fetchRecruiting({
    bypassCache: includeProfiles || options.bypassCache === true,
    scrapeArgs: { includePhotos: includeProfiles },
  });
}
```

Export `getFallbackRecruitingData` and `shouldUseFallbackOnly` for focused tests.

- [ ] **Step 4: Run the scraper and shared-pipeline tests**

Run: `npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js __tests__/create-cached-scraper.test.js --runInBand`

Expected: PASS; production fallback test performs no request, and the shared player is present in both season arrays.

- [ ] **Step 5: Request the required scraper review**

Invoke the `scraper-reviewer` agent with ownership limited to reviewing `server/scrapers/recruiting.js` for brittle Elite Prospects selectors, fallback correctness, and within-season-only deduplication. Apply any confirmed issues and rerun Step 4.

- [ ] **Step 6: Commit the scraper integration**

```powershell
git add server/scrapers/recruiting.js __tests__/recruiting-scraper.test.js
git commit -m "feat(recruiting): serve EP rosters through bundled fallback"
```

---

### Task 3: Validated Recruiting Refresh and Initial Snapshot

**Files:**
- Create: `scripts/refresh-recruiting.js`
- Create: `__tests__/refresh-recruiting.test.js`
- Create: `data/asu_recruiting_fallback.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `fetchRecruitingData(true, { bypassCache: true })`, `validateRecruitingSnapshot`, and `config.FUTURE_SEASONS`.
- Produces: `refreshRecruitingSnapshot({ fetchData, fallbackFile }): Promise<object>` and `npm run refresh-recruiting`.

- [ ] **Step 1: Write tests proving valid replacement and invalid preservation**

```js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { refreshRecruitingSnapshot } = require("../scripts/refresh-recruiting");

const valid = {
  "2027-2028": [{ name: "Jane", player_link: "https://www.eliteprospects.com/player/1/jane" }],
  "2028-2029": [],
  "2029-2030": [],
};

test("writes a complete valid snapshot", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-recruiting-"));
  const file = path.join(dir, "fallback.json");
  await refreshRecruitingSnapshot({ fetchData: async () => valid, fallbackFile: file });
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(valid);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("leaves the previous snapshot untouched when refresh data is partial", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-recruiting-"));
  const file = path.join(dir, "fallback.json");
  fs.writeFileSync(file, JSON.stringify(valid));
  await expect(refreshRecruitingSnapshot({
    fetchData: async () => ({ "2027-2028": [] }),
    fallbackFile: file,
  })).rejects.toThrow("validation failed");
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(valid);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the refresh test and verify the module-not-found failure**

Run: `npx jest --config jest.server.config.js __tests__/refresh-recruiting.test.js --runInBand`

Expected: FAIL because `scripts/refresh-recruiting.js` does not exist.

- [ ] **Step 3: Implement the injectable refresh command**

At module load, set `RECRUITING_SCRAPE_LIVE=true` and default `SCRAPER_PUPPETEER_FALLBACK=true`. Implement:

```js
async function refreshRecruitingSnapshot({
  fetchData = () => fetchRecruitingData(true, { bypassCache: true }),
  fallbackFile = FALLBACK_FILE,
} = {}) {
  const data = await fetchData();
  if (!validateRecruitingSnapshot(data, config.FUTURE_SEASONS)) {
    throw new Error("[refresh-recruiting] validation failed; fallback preserved");
  }
  fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
  fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 2));
  return data;
}

if (require.main === module) {
  refreshRecruitingSnapshot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

Export `refreshRecruitingSnapshot`. Add these package scripts:

```json
"refresh-recruiting": "node scripts/refresh-recruiting.js",
"refresh-data": "npm run refresh-alumni && npm run refresh-transfers && npm run refresh-recruiting"
```

- [ ] **Step 4: Run the focused refresh tests**

Run: `npx jest --config jest.server.config.js __tests__/refresh-recruiting.test.js --runInBand`

Expected: PASS, including byte-for-byte preservation after invalid data.

- [ ] **Step 5: Generate the bundled Elite Prospects snapshot**

Run: `npm run refresh-recruiting`

Expected: exit code 0 and `data/asu_recruiting_fallback.json` containing keys `2027-2028`, `2028-2029`, and `2029-2030`. Verify the 2027-2028 names against the current Elite Prospects page and confirm that repeated players remain in every season in which EP lists them.

- [ ] **Step 6: Commit the refresh command and snapshot**

```powershell
git add scripts/refresh-recruiting.js __tests__/refresh-recruiting.test.js data/asu_recruiting_fallback.json package.json
git commit -m "feat(recruiting): add validated EP roster refresh"
```

---

### Task 4: API Source and Freshness Status

**Files:**
- Modify: `server/routes/api.js`
- Modify: `server/cache/data-status.js`
- Modify: `__tests__/data-status.test.js`
- Modify: `tests/api.spec.ts`

**Interfaces:**
- Consumes: `fetchRecruitingData()` and `data/asu_recruiting_fallback.json`.
- Produces: `/api/recruits` with the unchanged season-map response and `/api/status` reporting recruiting as cache/fallback-backed.

- [ ] **Step 1: Change tests to require the new API and status semantics**

Replace the static recruiting status test with:

```js
test("reports the bundled recruiting roster as an alerting fallback dataset", () => {
  const recruiting = datasetByName("recruiting");
  expect(recruiting.source).toBe("fallback");
  expect(recruiting.file).toBe("data/asu_recruiting_fallback.json");
  expect(recruiting.alert).toBe(true);
  expect(recruiting.status).toBe("ok");
});
```

Strengthen the Playwright API assertion:

```ts
const data = await response.json();
for (const season of ["2027-2028", "2028-2029", "2029-2030"]) {
  expect(Array.isArray(data[season])).toBeTruthy();
}
expect(data["2027-2028"].length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the status test and verify it fails on source `static`**

Run: `npx jest --config jest.server.config.js __tests__/data-status.test.js --runInBand`

Expected: FAIL because recruiting still points to `asu_hockey_data.json` with `alert: false`.

- [ ] **Step 3: Serve scraper data and report fallback freshness**

Import `fetchRecruitingData` from `../scrapers`. Replace the route with:

```js
router.get("/recruits", async (req, res) => {
  try {
    const recruiting = await fetchRecruitingData();
    if (!recruiting || typeof recruiting !== "object" || Object.keys(recruiting).length === 0) {
      return res.status(500).json({ error: "Recruiting roster data unavailable." });
    }
    return res.json(recruiting);
  } catch (error) {
    console.error("Error in /api/recruits:", error);
    return res.status(500).json({ error: "Internal server error while fetching recruiting rosters." });
  }
});
```

Replace the recruiting `DATASETS` entry with:

```js
{
  name: "recruiting",
  cacheKey: "asu_hockey_recruiting",
  fallbackFile: "data/asu_recruiting_fallback.json",
  staleAfterMs: 21 * DAY_MS,
  alert: true,
},
```

- [ ] **Step 4: Run the server tests**

Run: `npx jest --config jest.server.config.js __tests__/data-status.test.js __tests__/cache-maintenance.test.js __tests__/recruiting-scraper.test.js --runInBand`

Expected: PASS; recruiting is protected through its dataset cache key and participates in stale/missing alerts.

- [ ] **Step 5: Commit the API migration**

```powershell
git add server/routes/api.js server/cache/data-status.js __tests__/data-status.test.js tests/api.spec.ts
git commit -m "feat(api): serve EP future team rosters"
```

---

### Task 5: Team-Season Frontend Semantics

**Files:**
- Create: `src/pages/__tests__/Recruiting.test.jsx`
- Modify: `src/pages/Recruiting.jsx`
- Modify: `src/types/api.ts`

**Interfaces:**
- Consumes: `Record<string, Recruit[]>` from `useRecruits()`.
- Produces: `<season> Team` tabs, nearest-season default selection, and exact per-season rendering.

- [ ] **Step 1: Write the failing Recruiting page test**

```jsx
import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import Recruiting from "../Recruiting";
import { renderWithQueryClient } from "../../test-utils/renderWithQueryClient";

jest.mock("../../services/api", () => ({
  getRecruits: jest.fn(),
  getTransfers: jest.fn(),
}));
import { getRecruits, getTransfers } from "../../services/api";

test("labels seasons as teams and renders the exact selected EP roster", async () => {
  getRecruits.mockResolvedValue({
    "2027-2028": [
      { name: "Shared Player", position: "F", player_link: "https://example.com/shared" },
      { name: "First Team Only", position: "D", player_link: "https://example.com/first" },
    ],
    "2028-2029": [
      { name: "Shared Player", position: "F", player_link: "https://example.com/shared" },
      { name: "Second Team Only", position: "G", player_link: "https://example.com/second" },
    ],
  });
  getTransfers.mockResolvedValue({ incoming: [], outgoing: [] });

  renderWithQueryClient(<HelmetProvider><Recruiting /></HelmetProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "2027-2028 Team" })).toBeInTheDocument());
  expect(screen.queryByText(/Class$/)).not.toBeInTheDocument();
  expect(screen.getByText("First Team Only")).toBeInTheDocument();
  expect(screen.queryByText("Second Team Only")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "2028-2029 Team" }));
  expect(screen.getByText("Shared Player")).toBeInTheDocument();
  expect(screen.getByText("Second Team Only")).toBeInTheDocument();
  expect(screen.queryByText("First Team Only")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test and verify it fails on `Class` wording**

Run: `npm test -- --runInBand src/pages/__tests__/Recruiting.test.jsx`

Expected: FAIL because the buttons currently use `<season> Class`.

- [ ] **Step 3: Change visible semantics without merging data**

In `Recruiting.jsx`:

- Rename the section heading from `Future Commits` to `Projected Future Teams`.
- Change each tab label expression to `{season} Team`.
- Rename comments and local descriptions from class selectors to team-season selectors.
- Keep `activeRecruits = recruitsBySeason[activeSeason] || []`; do not concatenate or roll forward arrays.
- Keep the current earliest-season default calculation and position grouping.
- Change the empty state to `No players listed for the ${activeSeason} team yet.`

In `src/types/api.ts`, update the response comment to state that keys are Elite Prospects projected team seasons.

- [ ] **Step 4: Run the page and API-client tests**

Run: `npm test -- --runInBand src/pages/__tests__/Recruiting.test.jsx src/hooks/queries/__tests__/useRecruits.test.js src/services/__tests__/api.test.js`

Expected: PASS with no act warnings or unhandled query errors.

- [ ] **Step 5: Commit the frontend semantics**

```powershell
git add src/pages/Recruiting.jsx src/pages/__tests__/Recruiting.test.jsx src/types/api.ts
git commit -m "feat(recruiting): present EP rosters as future teams"
```

---

### Task 6: Weekly Refresh Workflow and Documentation

**Files:**
- Modify: `scripts/refresh-and-push.cmd`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `npm run refresh-data` and `data/asu_recruiting_fallback.json`.
- Produces: automated PRs that include all three Elite Prospects fallbacks and repository guidance for manual recruiting refreshes.

- [ ] **Step 1: Extend the weekly workflow scope**

Update `scripts/refresh-and-push.cmd` so its comments, `git diff --quiet`, `git add`, commit title, PR title, and PR body include `data\asu_recruiting_fallback.json`. Use commit title:

```text
data: refresh Elite Prospects fallbacks (automated)
```

- [ ] **Step 2: Document the refresh and override**

In `.env.example`, add:

```dotenv
# Local-only override used by npm run refresh-recruiting; never enable on Render.
RECRUITING_SCRAPE_LIVE=false
```

Add a Data Refresh section to `README.md` stating that alumni, transfers, and recruiting are bundled Elite Prospects fallbacks, and list:

```bash
npm run refresh-data        # all Elite Prospects fallbacks
npm run refresh-recruiting  # projected future team rosters only
```

Document that `/api/recruits` reads `data/asu_recruiting_fallback.json`, while `asu_hockey_data.json.recruiting` remains profile-enrichment data only.

- [ ] **Step 3: Check batch-file and documentation diffs**

Run: `git diff --check -- scripts/refresh-and-push.cmd README.md .env.example`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 4: Commit workflow and documentation**

```powershell
git add scripts/refresh-and-push.cmd README.md .env.example
git commit -m "chore(data): refresh recruiting rosters weekly"
```

---

### Task 7: Full Verification, Browser Parity, and Publication

**Files:**
- Verify all changed files.
- Modify only files required to correct failures found by these checks.

**Interfaces:**
- Consumes: the completed server, refresh, API, and frontend work.
- Produces: a tested branch, pushed remote branch, and auto-merging pull request.

- [ ] **Step 1: Run the full server test suite**

Run: `npx jest --config jest.server.config.js --runInBand`

Expected: all server suites pass, including scraper, snapshot, refresh, status, and cache maintenance tests.

- [ ] **Step 2: Run the full React test suite**

Run: `$env:CI='true'; npm test -- --watchAll=false --runInBand`

Expected: all React suites pass without warnings introduced by this change.

- [ ] **Step 3: Run type checking and production build**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `$env:CI='true'; npm run build`

Expected: Vite build and Puppeteer prerender both complete; prerender obtains recruiting data from the bundled fallback without an Elite Prospects request.

- [ ] **Step 4: Run the focused Chromium API/page checks**

Run: `npm run test:e2e:chromium -- tests/api.spec.ts`

Expected: `/api/recruits` returns every configured season and `/api/status` reports recruiting successfully.

- [ ] **Step 5: Compare the rendered 2027-2028 team to Elite Prospects**

Start the backend and frontend using the repository's Playwright web server or normal development commands. Capture the Recruiting page at desktop width, select `2027-2028 Team`, and compare its normalized set of player names with `data/asu_recruiting_fallback.json["2027-2028"]`. Confirm that the snapshot itself was produced by the latest successful EP refresh and contains the current EP roster membership.

- [ ] **Step 6: Review the final diff and commit any verification-only corrections**

Run: `git status --short` and `git diff --check main...HEAD`.

Expected: only scoped recruiting, fallback, tests, workflow, and documentation changes; no whitespace errors or unrelated user files.

If verification required corrections, rerun the failed check and then commit the scoped files that can be affected by this feature:

```powershell
git add server/services/recruiting-snapshot.js server/scrapers/recruiting.js scripts/refresh-recruiting.js server/routes/api.js server/cache/data-status.js src/pages/Recruiting.jsx src/types/api.ts package.json scripts/refresh-and-push.cmd .env.example README.md __tests__/recruiting-snapshot.test.js __tests__/recruiting-scraper.test.js __tests__/refresh-recruiting.test.js __tests__/data-status.test.js tests/api.spec.ts src/pages/__tests__/Recruiting.test.jsx data/asu_recruiting_fallback.json
git commit -m "fix(recruiting): address roster verification findings"
```

- [ ] **Step 7: Push and open the pull request**

Run:

```powershell
git push -u origin codex/elite-prospects-team-rosters
gh pr create --base main --head codex/elite-prospects-team-rosters --title "Match Recruiting seasons to Elite Prospects team rosters" --body "Switches future-season recruiting tabs from arrival classes to validated Elite Prospects projected team rosters. Adds a production-safe bundled fallback, weekly refresh integration, freshness reporting, and regression coverage."
gh pr merge codex/elite-prospects-team-rosters --auto --merge
```

Expected: branch push succeeds, the PR opens, required CI starts, and auto-merge is enabled.
