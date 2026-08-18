# Automated Recruiting Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically scrape, validate, merge, review through CI, and deploy ASU recruiting updates once per day without a recurring manual run.

**Architecture:** A dedicated residential Windows runner performs an uncached Puppeteer-backed scrape, passes the result through a pure validation/merge service, and atomically updates only recruiting data and its removal-confirmation state. A PowerShell orchestrator publishes allowlisted changes through the existing automation PR, while Task Scheduler and Sentry provide missed-run recovery and monitoring.

**Tech Stack:** Node.js 20, Jest 29, Puppeteer fallback, PowerShell 5.1+, Windows Task Scheduler, GitHub CLI, GitHub Actions, Sentry Cron Monitor, Render.

**Spec:** `docs/superpowers/specs/2026-08-18-automated-recruiting-refresh-design.md`

## Global Constraints

- Run at 6:00 AM America/Phoenix every day.
- Use a dedicated local clone; never switch or commit from the developer's active checkout.
- Keep `asu_hockey_data.json` as the production source of truth for `/api/recruits`.
- Modify only the `recruiting` top-level property and preserve every other top-level value exactly.
- Require Puppeteer fallback for EliteProspects requests from the residential runner.
- Reject empty, malformed, duplicate, zeroed-season, or greater-than-35-percent aggregate count-drop snapshots.
- Preserve a nonblank curated value when its scraped replacement is blank.
- Remove a missing recruit only after two consecutive valid daily snapshots.
- An automated `auto/data-refresh` commit must never contain a path outside `asu_hockey_data.json`, `data/asu_recruiting_refresh_state.json`, `data/asu_alumni_fallback.json`, and `data/asu_transfers_fallback.json`.
- No-change runs create no commit and still send a successful Sentry check-in.

---

## File Structure

- `server/scrapers/recruiting.js` — expose the existing all-season scrape as an explicit uncached entry point.
- `server/services/recruiting-refresh-service.js` — pure validation, identity, safe merge, two-run removal, summary, and atomic two-file persistence.
- `scripts/refresh-recruiting.js` — dependency-injectable CLI that performs one live refresh.
- `scripts/refresh-and-push.ps1` — isolated runner orchestration, allowlist enforcement, tests, Git/PR delivery, logging, and Sentry status.
- `scripts/refresh-and-push.cmd` — compatibility wrapper used by Task Scheduler.
- `scripts/install-refresh-runner.ps1` — one-time dedicated-clone and Scheduled Task installer.
- `data/asu_recruiting_refresh_state.json` — committed active-miss state, initially `{ "version": 1, "misses": {} }`.
- `__tests__/recruiting-scraper.test.js` — uncached all-season scraper contract.
- `__tests__/recruiting-refresh-service.test.js` — validation, merge, state, preservation, and rollback behavior.
- `__tests__/refresh-recruiting-script.test.js` — CLI orchestration against temporary files and injected scrape results.
- `__tests__/refresh-automation.test.js` — static safety contract for the Windows automation scripts.
- `package.json` — recruiting refresh command and aggregate refresh chain.
- `.github/workflows/ci.yml` — execute server-side Jest tests before auto-merge.
- `.env.example` and `README.md` — daily monitor and runner operations.
- Delete `scripts/RefreshDataTask.xml` after the installer supersedes its machine-specific hardcoded paths.

---

### Task 1: Expose an uncached all-season recruiting scrape

**Files:**
- Modify: `server/scrapers/recruiting.js`
- Modify: `__tests__/recruiting-scraper.test.js`

**Interfaces:**
- Produces: `scrapeAllRecruitingSeasons({ includePhotos?: boolean }): Promise<Record<string, RecruitRecord[]>>`
- Preserves: `fetchRecruitingData(includePhotos?: boolean)` and all current exports and cache behavior.

- [ ] **Step 1: Write the failing direct-scrape test**

Extend the existing scraper test import and add a test using the existing roster HTML fixture:

```js
const {
  fetchRecruitingData,
  scrapeAllRecruitingSeasons,
  scrapeEliteProspectsRecruiting,
} = require("../server/scrapers/recruiting");

test("scrapeAllRecruitingSeasons performs a live scrape without reading cache", async () => {
  requestWithRetry.mockResolvedValue({ data: fixtureHtml });

  const result = await scrapeAllRecruitingSeasons({ includePhotos: false });

  expect(Object.keys(result)).toEqual(["2026-2027"]);
  expect(result["2026-2027"].map((player) => player.name)).toEqual([
    "Jane Smith",
    "Bob Jones",
  ]);
  expect(getFromCache).not.toHaveBeenCalled();
  expect(saveToCache).not.toHaveBeenCalled();
});
```

Keep this test inside the scope where `fixtureHtml` is defined, or lift the fixture to module scope so both parser and all-season tests use exactly the same markup.

- [ ] **Step 2: Run the focused test and verify the missing export failure**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js --runInBand
```

Expected: FAIL because `scrapeAllRecruitingSeasons` is not exported.

- [ ] **Step 3: Rename and export the existing all-season function**

In `server/scrapers/recruiting.js`, rename `scrapeAllSeasons` and use it in the cached scraper:

```js
async function scrapeAllRecruitingSeasons({ includePhotos = false } = {}) {
  const recruitingData = {};

  for (const season of config.FUTURE_SEASONS) {
    console.log(
      `[Recruiting] Scraping season: ${season}${includePhotos ? " with photos" : ""}`,
    );
    recruitingData[season] = await scrapeEliteProspectsRecruiting(
      season,
      includePhotos,
    );
    await delayBetweenRequests();
  }

  return recruitingData;
}

const fetchRecruiting = createCachedScraper({
  name: "recruiting",
  cacheKey: "asu_hockey_recruiting",
  scrape: scrapeAllRecruitingSeasons,
  validate: (data) => Object.values(data).some((arr) => arr.length > 0),
});
```

Add `scrapeAllRecruitingSeasons` to `module.exports`. Do not add cache reads or writes to this direct function. Update the module header comment to state that the direct entry point feeds the automated local refresh while `/api/recruits` continues to use static JSON.

- [ ] **Step 4: Run the focused scraper tests**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js --runInBand
```

Expected: PASS, including the existing SWR and HTML parsing tests.

- [ ] **Step 5: Commit the direct scraper entry point**

```powershell
git add server/scrapers/recruiting.js __tests__/recruiting-scraper.test.js
git commit -m "feat(recruiting): expose uncached all-season scrape"
```

---

### Task 2: Build the recruiting validation and merge service

**Files:**
- Create: `server/services/recruiting-refresh-service.js`
- Create: `__tests__/recruiting-refresh-service.test.js`

**Interfaces:**
- Produces: `validateRecruitingSnapshot({ snapshot, existingRecruiting, seasons, maxDropFraction? }): void`, throwing a descriptive `Error` on rejection.
- Produces: `mergeRecruitingSnapshot({ sourceDocument, snapshot, removalState, seasons }): { document, removalState, summary }`.
- Produces: `writeRecruitingFilesAtomically({ dataFile, stateFile, document, removalState, fsAdapter? }): void`, where `fsAdapter` defaults to Node's `fs` module.
- Produces: `emptyRemovalState(): { version: 1, misses: Record<string, 1> }`.

- [ ] **Step 1: Write failing validation tests**

Create fixtures with two configured seasons and add these exact behavioral cases:

```js
const {
  validateRecruitingSnapshot,
} = require("../server/services/recruiting-refresh-service");

const player = (id, overrides = {}) => ({
  number: "",
  name: `Player ${id}`,
  position: "F",
  age: "18",
  birth_year: "2008",
  birthplace: "Phoenix, AZ, USA",
  height: "6'0\"",
  weight: "180",
  shoots: "L",
  player_link: `https://www.eliteprospects.com/player/${id}/player-${id}`,
  player_photo: "",
  current_team: "Test Team",
  ...overrides,
});

test.each([
  ["missing configured season", { "2027-2028": [player(1)] }],
  ["non-array season", { "2027-2028": [player(1)], "2028-2029": {} }],
  ["all seasons empty", { "2027-2028": [], "2028-2029": [] }],
  ["missing player URL", { "2027-2028": [player(1, { player_link: "" })], "2028-2029": [] }],
  ["duplicate player URL", { "2027-2028": [player(1), player(1)], "2028-2029": [] }],
])("rejects %s", (_, snapshot) => {
  expect(() =>
    validateRecruitingSnapshot({
      snapshot,
      existingRecruiting: { "2027-2028": [], "2028-2029": [] },
      seasons: ["2027-2028", "2028-2029"],
    }),
  ).toThrow();
});
```

Add separate tests proving a formerly nonempty season returning zero fails and an aggregate drop from 20 existing records to 12 scraped records fails because it exceeds 35 percent. Add a boundary test showing 20 to 13 succeeds.

- [ ] **Step 2: Run validation tests and verify they fail**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/recruiting-refresh-service.test.js --runInBand
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement identity and validation**

Implement the service with these constants and rules:

```js
const SCRAPER_FIELDS = [
  "number", "name", "position", "age", "birth_year", "birthplace",
  "height", "weight", "shoots", "player_link", "player_photo", "current_team",
];
const DEFAULT_MAX_DROP_FRACTION = 0.35;

function normalizePlayerUrl(value) {
  const url = new URL(String(value).trim());
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}
```

`validateRecruitingSnapshot` must verify object/season/array shapes, nonblank `name`, `position`, and `player_link`, URL parseability, URL uniqueness within a season, nonzero combined count, no previously nonempty season becoming empty, and:

```js
const dropFraction = existingCount === 0
  ? 0
  : (existingCount - scrapedCount) / existingCount;
if (dropFraction > maxDropFraction) {
  throw new Error(
    `Recruiting count dropped ${(dropFraction * 100).toFixed(1)}%; limit is ${maxDropFraction * 100}%`,
  );
}
```

Export `normalizePlayerUrl` for direct unit testing.

- [ ] **Step 4: Write failing merge and removal-state tests**

Add tests that establish this state shape and behavior:

```js
const initialState = { version: 1, misses: {} };
const missKey = "2027-2028|https://www.eliteprospects.com/player/1/player-1";
```

Cover all of the following with explicit `expect` assertions:

- A new URL is appended to its configured season.
- A present URL updates nonblank scraper fields.
- `player_photo: ""` and `current_team: ""` preserve existing nonblank values.
- An unknown curated property such as `editor_note: "verified"` survives.
- An unconfigured season remains deeply equal to its input.
- Every top-level property except `recruiting` remains deeply equal to its input.
- First absence retains the recruit and sets `misses[missKey]` to `1`.
- Second absence with `misses[missKey] === 1` removes the recruit and deletes the key.
- Reappearance deletes an existing miss key.
- Summary counts report `{ added, updated, retained, removed }` accurately.

- [ ] **Step 5: Implement the pure merge**

Build new objects rather than mutating the supplied document or state. For a present player, start with the existing record, then copy only nonblank `SCRAPER_FIELDS` values. Treat a string as nonblank only when `value.trim() !== ""`; retain numeric zero if it ever appears.

Use this removal transition:

```js
if (!scrapedByUrl.has(identity)) {
  if (nextMisses[missKey] === 1) {
    delete nextMisses[missKey];
    summary.removed += 1;
    continue;
  }
  nextMisses[missKey] = 1;
  summary.retained += 1;
  nextSeason.push(existingPlayer);
}
```

Count a player as updated only when the merged record differs from the existing record. Sort each configured season deterministically by case-insensitive last name and then full name so repeated runs serialize identically.

- [ ] **Step 6: Write failing atomic-persistence tests**

Use `fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-refresh-"))` and verify:

1. Both files are valid JSON after a successful write.
2. Neither destination changes when serialization validation fails.
3. If replacement of the second destination throws, both original files are restored and temporary/backup files are removed.

Inject a minimal filesystem adapter into `writeRecruitingFilesAtomically` for the forced-failure test instead of monkey-patching global `fs` methods.

- [ ] **Step 7: Implement atomic two-file persistence**

Serialize and parse-check both values first. Write sibling temporary files with a unique suffix, copy existing destinations to sibling backups, replace the destinations, and remove backups only after both replacements succeed. In `catch`, restore any original destination already replaced, remove remaining temporary files, and rethrow. Use `try/finally` cleanup and explicit file paths; do not use recursive deletion.

- [ ] **Step 8: Run the service tests**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/recruiting-refresh-service.test.js --runInBand
```

Expected: PASS with validation, merge, removal, preservation, summary, and rollback cases covered.

- [ ] **Step 9: Commit the refresh service**

```powershell
git add server/services/recruiting-refresh-service.js __tests__/recruiting-refresh-service.test.js
git commit -m "feat(recruiting): add validated refresh merge service"
```

---

### Task 3: Add the production recruiting refresh command

**Files:**
- Create: `scripts/refresh-recruiting.js`
- Create: `data/asu_recruiting_refresh_state.json`
- Create: `__tests__/refresh-recruiting-script.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `scrapeAllRecruitingSeasons`, `validateRecruitingSnapshot`, `mergeRecruitingSnapshot`, and `writeRecruitingFilesAtomically`.
- Produces: `runRecruitingRefresh({ dataFile?, stateFile?, seasons?, scrape? }): Promise<summary>`.
- Produces: `npm run refresh-recruiting` and an expanded `npm run refresh-data`.

- [ ] **Step 1: Write failing CLI orchestration tests**

Create temporary data and state files in `beforeEach`, inject a resolved `scrape` function, and assert:

```js
const summary = await runRecruitingRefresh({
  dataFile,
  stateFile,
  seasons: ["2027-2028"],
  scrape: async () => ({ "2027-2028": [player(2)] }),
});

expect(summary.added).toBe(1);
expect(JSON.parse(fs.readFileSync(dataFile, "utf8")).recruiting["2027-2028"])
  .toEqual([player(2)]);
```

Add a rejection case where the injected scrape returns an empty configured season and assert the exact original bytes of both files are unchanged. Add a missing-state-file case that succeeds with `emptyRemovalState()`.

- [ ] **Step 2: Run the script tests and verify they fail**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/refresh-recruiting-script.test.js --runInBand
```

Expected: FAIL because `scripts/refresh-recruiting.js` does not exist.

- [ ] **Step 3: Implement the dependency-injectable command**

At module load, set the fallback before importing the scraper:

```js
process.env.SCRAPER_PUPPETEER_FALLBACK =
  process.env.SCRAPER_PUPPETEER_FALLBACK || "true";
```

Implement `runRecruitingRefresh` with production defaults pointing to the root data file and committed state file. Read and parse the source document, read state or use `emptyRemovalState()`, call `scrape({ includePhotos: true })`, validate, merge, persist, and log per-season and summary counts. The injected `scrape` signature must match the real scraper.

Use this executable guard so tests can import without starting network work:

```js
if (require.main === module) {
  runRecruitingRefresh().catch((error) => {
    console.error(`[refresh-recruiting] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runRecruitingRefresh };
```

- [ ] **Step 4: Add state and package commands**

Create:

```json
{
  "version": 1,
  "misses": {}
}
```

Update `package.json`:

```json
"refresh-recruiting": "node scripts/refresh-recruiting.js",
"refresh-data": "npm run refresh-alumni && npm run refresh-transfers && npm run refresh-recruiting"
```

- [ ] **Step 5: Run focused and full server tests**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js __tests__/recruiting-refresh-service.test.js __tests__/refresh-recruiting-script.test.js --runInBand
npx jest --config jest.server.config.js --runInBand
```

Expected: both commands PASS. Do not run the live `npm run refresh-recruiting` as part of automated tests.

- [ ] **Step 6: Commit the refresh command**

```powershell
git add scripts/refresh-recruiting.js data/asu_recruiting_refresh_state.json __tests__/refresh-recruiting-script.test.js package.json
git commit -m "feat(recruiting): add safe automated refresh command"
```

---

### Task 4: Replace fragile batch orchestration with an allowlisted PowerShell runner

**Files:**
- Create: `scripts/refresh-and-push.ps1`
- Modify: `scripts/refresh-and-push.cmd`
- Create: `__tests__/refresh-automation.test.js`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run refresh-data`, `scripts/ping-refresh-monitor.js`, Git, and authenticated `gh`.
- Produces: exit code `0` for successful no-op/publish runs and nonzero for scrape, validation, test, Git, push, or PR failures.
- Preserves: `scripts/refresh-and-push.cmd` as the Scheduled Task entry point.

- [ ] **Step 1: Write failing automation contract tests**

Create a Node/Jest static contract test that reads both scripts and asserts:

```js
const allowed = [
  "asu_hockey_data.json",
  "data/asu_recruiting_refresh_state.json",
  "data/asu_alumni_fallback.json",
  "data/asu_transfers_fallback.json",
];

for (const file of allowed) expect(powerShell).toContain(file);
expect(powerShell).toContain("npm run refresh-data");
expect(powerShell).toContain("jest.server.config.js");
expect(powerShell).toContain("ping-refresh-monitor.js");
expect(powerShell).toContain("auto/data-refresh");
expect(powerShell).toContain("gh pr merge");
expect(batchWrapper).toContain("refresh-and-push.ps1");
```

Also assert that the PowerShell script requires a `.refresh-runner` marker and compares every changed/staged path against the allowlist.

- [ ] **Step 2: Run the automation test and verify it fails**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/refresh-automation.test.js --runInBand
```

Expected: FAIL because the PowerShell orchestrator does not exist and the batch file still contains orchestration.

- [ ] **Step 3: Implement the PowerShell orchestrator**

Use strict mode and terminating errors:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AllowedPaths = @(
  'asu_hockey_data.json',
  'data/asu_recruiting_refresh_state.json',
  'data/asu_alumni_fallback.json',
  'data/asu_transfers_fallback.json'
)
```

Implement focused helpers:

```powershell
function Write-RefreshLog([string]$Message) { }
function Invoke-Native([string]$FilePath, [string[]]$Arguments) { }
function Assert-AllowedChanges([string[]]$Paths) { }
function Send-MonitorStatus([ValidateSet('ok','error')] [string]$Status) { }
```

`Invoke-Native` must execute with an argument array, capture the exit code, log output, and throw on nonzero. Do not construct a command string for `Invoke-Expression`.

The main `try` block must:

1. Resolve the repository root from `$PSScriptRoot` and require a `.refresh-runner` marker at that exact root.
2. Reject tracked dirty paths outside `$AllowedPaths`; restore only allowlisted leftovers from a prior failed run.
3. Fetch `origin` and recreate `auto/data-refresh` from `origin/main`.
4. Run `npm.cmd run refresh-data`.
5. Run the three focused recruiting tests and then the full server Jest suite with `--runInBand`.
6. Parse `asu_hockey_data.json` and `data/asu_recruiting_refresh_state.json` with `ConvertFrom-Json`.
7. Read `git diff --name-only`, normalize separators to `/`, and call `Assert-AllowedChanges`.
8. On no changes, send `ok` and exit zero.
9. Stage only `$AllowedPaths`, inspect `git diff --cached --name-only`, and call `Assert-AllowedChanges` again.
10. Commit `data: refresh hockey datasets (automated)`, force-push only `auto/data-refresh`, create or reuse the PR, print its URL, and enable `--auto --merge`.
11. Send `ok` only after every required step succeeds.

The `catch` block logs the exception, sends `error`, and exits `1`. Monitoring send failures remain nonfatal inside `Send-MonitorStatus`.

Add `/.refresh-runner` to `.gitignore` so the dedicated-clone marker never appears as an untracked candidate.

- [ ] **Step 4: Reduce the batch file to a compatibility wrapper**

Replace its body with:

```bat
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0refresh-and-push.ps1"
exit /b %ERRORLEVEL%
```

- [ ] **Step 5: Add server Jest to GitHub CI**

After the existing frontend unit-test step in `.github/workflows/ci.yml`, add:

```yaml
      - name: Server tests
        run: npx jest --config jest.server.config.js --runInBand
```

This makes the validation and merge safeguards part of the protected PR gate.

- [ ] **Step 6: Run automation and YAML verification**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/refresh-automation.test.js --runInBand
npx jest --config jest.server.config.js --runInBand
npx --yes actionlint .github/workflows/ci.yml
```

Expected: both Jest commands PASS and actionlint exits `0`. Do not execute the publishing script from the active checkout because its marker guard must reject that location.

- [ ] **Step 7: Commit orchestration and CI**

```powershell
git add scripts/refresh-and-push.ps1 scripts/refresh-and-push.cmd __tests__/refresh-automation.test.js .gitignore .github/workflows/ci.yml
git commit -m "feat(automation): publish validated daily data refreshes"
```

---

### Task 5: Install and document the isolated daily runner

**Files:**
- Create: `scripts/install-refresh-runner.ps1`
- Delete: `scripts/RefreshDataTask.xml`
- Modify: `__tests__/refresh-automation.test.js`
- Modify: `.env.example`
- Modify: `scripts/ping-refresh-monitor.js`
- Modify: `server/cache/data-status.js`
- Modify: `__tests__/data-status.test.js`
- Modify: `README.md`

**Interfaces:**
- Produces: `scripts/install-refresh-runner.ps1 -RunnerPath [string] -EnvironmentFile [string]`, with both values resolved and validated as absolute paths before use.
- Produces: Windows task `ASU Hockey Data Refresh`, daily at local 06:00.
- Requires: Git, Node/npm, authenticated GitHub CLI, an existing readable environment file, and permission to register a Scheduled Task.

- [ ] **Step 1: Extend the failing automation contract test for installation**

Read `scripts/install-refresh-runner.ps1` and assert it contains:

```js
expect(installer).toContain("Register-ScheduledTask");
expect(installer).toContain("New-ScheduledTaskTrigger");
expect(installer).toContain("-Daily");
expect(installer).toContain("06:00");
expect(installer).toContain("-WakeToRun");
expect(installer).toContain("-StartWhenAvailable");
expect(installer).toContain("-RunOnlyIfNetworkAvailable");
expect(installer).toContain("New-TimeSpan -Minutes 30");
expect(installer).toContain(".refresh-runner");
expect(installer).toContain("npm.cmd");
expect(installer).toContain("ci");
```

Assert that `scripts/RefreshDataTask.xml` no longer exists after implementation.

- [ ] **Step 2: Run the automation test and verify the installer assertions fail**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/refresh-automation.test.js --runInBand
```

Expected: FAIL because the installer does not exist and the old XML still exists.

- [ ] **Step 3: Implement the one-time installer**

Declare mandatory absolute paths and safe defaults:

```powershell
param(
  [string]$RunnerPath = (Join-Path $env:USERPROFILE 'asuhockeywebsite-refresh-runner'),
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentFile,
  [string]$TaskName = 'ASU Hockey Data Refresh'
)
```

The installer must:

1. Resolve and validate `RunnerPath` is not the current repository root and is not an ancestor of it.
2. Resolve `EnvironmentFile`, require it to exist, and never print its contents.
3. Obtain the origin URL using `git remote get-url origin` with an argument array.
4. Clone into a missing runner path; for an existing runner, require `.git`, validate the same origin URL, and refuse unexpected tracked changes.
5. Fetch origin, recreate local `main` from `origin/main`, and run `npm.cmd ci`.
6. Copy the environment file to `<RunnerPath>/.env` and create `<RunnerPath>/.refresh-runner` containing only a version marker.
7. Register an action for `<RunnerPath>/scripts/refresh-and-push.cmd` with the runner as working directory.
8. Register a daily 06:00 trigger and settings with one instance, wake-to-run, start-when-available, network required, no battery restriction, and a 30-minute limit.
9. Register or replace only the exact `$TaskName` and print `Get-ScheduledTaskInfo` plus the runner path.

Use native PowerShell task objects rather than generating machine-specific XML. Delete `scripts/RefreshDataTask.xml` after the installer test passes.

Construct and register the task with explicit objects:

```powershell
$Action = New-ScheduledTaskAction `
  -Execute (Join-Path $RunnerPath 'scripts\refresh-and-push.cmd') `
  -WorkingDirectory $RunnerPath
$Trigger = New-ScheduledTaskTrigger -Daily -At '06:00'
$Settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description 'Daily validated ASU Hockey data refresh and automated PR' `
  -Force
```

- [ ] **Step 4: Update monitor and operating documentation**

Change `.env.example` from weekly Sunday monitoring to daily 06:00 America/Phoenix with an approximately 12-hour grace period.

Update `scripts/ping-refresh-monitor.js` to describe a daily all-data refresh, not a weekly alumni/transfer refresh. Update the recruiting comment in `server/cache/data-status.js` and the corresponding test name in `__tests__/data-status.test.js` to say the production source is static JSON but successful refresh cadence is monitored externally by the Sentry Cron Monitor. Keep recruiting `alert: false` and `staleAfterMs: null`, because file mtime measures content changes rather than successful no-op checks.

Add a `Daily data refresh` section to `README.md` documenting:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-refresh-runner.ps1 -EnvironmentFile C:\Users\farkh\asuhockeywebsite\.env
```

Document the four-file commit allowlist, two-run recruit removal rule, 35-percent guard, no-op behavior, `npm run refresh-recruiting` as a diagnostic override, `Get-ScheduledTaskInfo -TaskName 'ASU Hockey Data Refresh'`, `.refresh-log.txt`, the Sentry monitor, authenticated `gh`, and season rollover updates to `config.FUTURE_SEASONS`.

- [ ] **Step 5: Run focused tests and static verification**

Run:

```powershell
npx jest --config jest.server.config.js __tests__/refresh-automation.test.js --runInBand
rg -n "weekly|Sunday 06:00|alumni \+ transfer" scripts .env.example README.md
```

Expected: Jest PASS. The text search returns no stale cadence/scope descriptions in the maintained automation documentation or scripts.

- [ ] **Step 6: Commit runner installation and documentation**

```powershell
git add scripts/install-refresh-runner.ps1 scripts/RefreshDataTask.xml scripts/ping-refresh-monitor.js server/cache/data-status.js __tests__/data-status.test.js __tests__/refresh-automation.test.js .env.example README.md
git commit -m "docs(automation): install isolated daily refresh runner"
```

---

### Task 6: Complete repository verification and installation acceptance

**Files:**
- Verify only; modify a preceding task's files if a verification failure exposes a defect.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–5.
- Produces: evidence that the feature is safe to install and publish.

- [ ] **Step 1: Run formatting and diff checks**

Run:

```powershell
npx prettier --check "server/**/*.{js,json}" "scripts/**/*.{js,json}" "__tests__/**/*.js" "package.json"
git diff --check
```

Expected: both commands exit `0`. If Prettier reports only new or modified supported files, run Prettier on those exact files and re-run the check. Do not format `.ps1` or `.cmd` with Prettier.

- [ ] **Step 2: Run all unit and build verification**

Run:

```powershell
npx jest --config jest.server.config.js --runInBand
$env:CI='true'; npm test -- --watchAll=false
$env:CI='true'; npm run build
npx --yes actionlint .github/workflows/ci.yml
```

Expected: server Jest PASS, React Jest PASS, production build PASS including prerender, and actionlint exit `0`.

- [ ] **Step 3: Verify the production source contract**

Run:

```powershell
node -e "const d=require('./asu_hockey_data.json'); if(!d.recruiting || typeof d.recruiting !== 'object') process.exit(1); console.log(Object.keys(d.recruiting))"
node -e "const s=require('./data/asu_recruiting_refresh_state.json'); if(s.version!==1 || !s.misses || Array.isArray(s.misses)) process.exit(1); console.log('state ok')"
```

Expected: configured recruiting keys print and the second command prints `state ok`.

- [ ] **Step 4: Inspect final repository scope**

Run:

```powershell
git status --short
git log --oneline -6
```

Expected: only pre-existing unrelated user files remain untracked or modified; the five feature commits are present and no generated live scrape has been committed during testing.

- [ ] **Step 5: Perform the one-time installation with explicit approval**

From the developer checkout, run only after the user supplies the intended environment-file path and approves task registration:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-refresh-runner.ps1 -EnvironmentFile C:\Users\farkh\asuhockeywebsite\.env
```

Expected: the installer reports the dedicated runner path and task state without displaying environment-file contents.

- [ ] **Step 6: Verify the installed task without forcing a live publish**

Run:

```powershell
Get-ScheduledTask -TaskName 'ASU Hockey Data Refresh' | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName 'ASU Hockey Data Refresh' | Select-Object LastRunTime, LastTaskResult, NextRunTime
```

Expected: the task is enabled, the next run is the next local 06:00 occurrence, and no manual live refresh is required. Let the first scheduled execution exercise the scrape and publishing path; inspect its PR and Sentry check-in afterward.
