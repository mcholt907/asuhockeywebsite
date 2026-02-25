# Team Record Widget — USCHO Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scrape Overall, NCHC, Home, and Away records from USCHO and display them in the Schedule page record widget.

**Architecture:** `scrapeUSCHORecord()` is called inside `fetchScheduleData()` alongside the existing CHN links enrichment. The result is stored as `team_record` alongside `games` in the schedule cache. `fetchScheduleData()` return type changes from `games[]` to `{ games, team_record }`. Server passes `team_record` through to the frontend; `Schedule.jsx` renders a 4-row table layout.

**Tech Stack:** Node.js, axios, cheerio (Inertia.js JSON parsing), React, CSS Grid

---

### Task 1: Add `scrapeUSCHORecord()` to scraper.js (TDD)

**Files:**
- Modify: `__tests__/scraper-caching.test.js` (add after line 43)
- Modify: `scraper.js` (add after line 310, before `enrichScheduleWithCHNLinks`)
- Modify: `scraper.js:754` (add to `module.exports`)

**Context:** The USCHO page is an Inertia.js SPA. All data is in `<div id="app" data-page="...">` as a JSON string. `config.urls.uscho` is already set to `'https://www.uscho.com/team/arizona-state/mens-hockey/'`. The test file mocks `requestWithRetry` and already has `uscho: 'http://test/uscho'` in the config mock (line 36).

**Step 1: Write the failing tests**

Add to `__tests__/scraper-caching.test.js` — update the import on line 43 first:

```js
// Line 43 — change to:
const { scrapeCHNRoster, scrapeCHNScheduleLinks, scrapeUSCHORecord } = require('../scraper');
```

Then add after the existing `scrapeCHNRoster` describe block:

```js
describe('scrapeUSCHORecord', () => {
  const makeInertiaHtml = (record) => {
    const page = { props: { content: { record } } };
    return `<html><body><div id="app" data-page='${JSON.stringify(page)}'></div></body></html>`;
  };

  test('returns overall, conf, home, and away records from Inertia JSON', async () => {
    const record = {
      total: { wins: 14, losses: 19, ties: 1 },
      conf:  { total: { wins: 7, losses: 14, ties: 1 } },
      home:  { wins: 9,  losses: 10, ties: 1 },
      road:  { wins: 5,  losses: 9,  ties: 0 },
    };
    requestWithRetry.mockResolvedValueOnce({ data: makeInertiaHtml(record) });

    const result = await scrapeUSCHORecord();

    expect(result).toEqual({
      overall: { wins: 14, losses: 19, ties: 1 },
      conf:    { wins: 7,  losses: 14, ties: 1 },
      home:    { wins: 9,  losses: 10, ties: 1 },
      away:    { wins: 5,  losses: 9,  ties: 0 },
    });
  });

  test('returns null when the request fails', async () => {
    requestWithRetry.mockRejectedValueOnce(new Error('network error'));

    const result = await scrapeUSCHORecord();

    expect(result).toBeNull();
  });

  test('returns null when the page has no Inertia JSON', async () => {
    requestWithRetry.mockResolvedValueOnce({ data: '<html><body><div id="app"></div></body></html>' });

    const result = await scrapeUSCHORecord();

    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx jest --config jest.server.config.js --testPathPattern="scraper-caching" --verbose
```
Expected: 3 FAIL — "scrapeUSCHORecord is not a function"

**Step 3: Implement `scrapeUSCHORecord` in scraper.js**

Add after line 310 (after `scrapeCHNScheduleLinks`, before `enrichScheduleWithCHNLinks`):

```js
async function scrapeUSCHORecord() {
  const url = config.urls.uscho;
  console.log(`[USCHO Record] Fetching from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const raw = $('#app').attr('data-page');
    if (!raw) throw new Error('No data-page attribute found');
    const page = JSON.parse(raw);
    const r = page.props.content.record;
    return {
      overall: { wins: r.total.wins,       losses: r.total.losses,       ties: r.total.ties },
      conf:    { wins: r.conf.total.wins,   losses: r.conf.total.losses,  ties: r.conf.total.ties },
      home:    { wins: r.home.wins,         losses: r.home.losses,        ties: r.home.ties },
      away:    { wins: r.road.wins,         losses: r.road.losses,        ties: r.road.ties },
    };
  } catch (error) {
    console.error(`[USCHO Record] Error: ${error.message}`);
    return null;
  }
}
```

Also update `module.exports` on line 754:

```js
module.exports = { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeCHNScheduleLinks, scrapeUSCHORecord };
```

**Step 4: Run tests to verify they pass**

```bash
npx jest --config jest.server.config.js --testPathPattern="scraper-caching" --verbose
```
Expected: All tests PASS (including the 3 new ones)

**Step 5: Commit**

```bash
git add scraper.js __tests__/scraper-caching.test.js
git commit -m "feat(schedule): add scrapeUSCHORecord — parses Inertia JSON for W/L/T records"
```

---

### Task 2: Integrate `scrapeUSCHORecord` into `fetchScheduleData`

**Files:**
- Modify: `scraper.js:324-405` — change return type from `games[]` to `{ games, team_record }`

**Context:** `fetchScheduleData` has three return paths:
1. Fresh cache hit (line 334-337) — `return cachedData`
2. Stale cache hit (line 366) — `return staleData` (background refresh runs)
3. Fresh scrape (line 395) — `return scheduleData`

The cache currently stores a raw `games[]`. After this task it stores `{ games, team_record }`. We need a backward-compat guard for path 1 & 2 in case old cache is still on disk.

**Step 1: Update the background refresh path (lines 346-365)**

Change this block:
```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });
if (scheduleData && scheduleData.length > 0) {
  await enrichScheduleWithCHNLinks(scheduleData);
  await saveToCache(scheduleData, fullCacheKey);
}
```

To:
```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });
if (scheduleData && scheduleData.length > 0) {
  await enrichScheduleWithCHNLinks(scheduleData);
  const teamRecord = await scrapeUSCHORecord();
  await saveToCache({ games: scheduleData, team_record: teamRecord }, fullCacheKey);
}
```

**Step 2: Update the stale-data return (lines 343-366)**

Wrap the stale return to normalise legacy format:
```js
if (staleData) {
  console.log('[Cache System] Stale schedule found. Returning immediately and refreshing in background.');
  // ... (background IIFE unchanged except as modified in Step 1)
  const normalised = Array.isArray(staleData) ? { games: staleData, team_record: null } : staleData;
  return normalised;
}
```

**Step 3: Update the fresh-cache return (lines 334-337)**

```js
if (cachedData) {
  console.log(`[Cache System] Schedule data found in cache for ${targetSeasonStartYear}. Returning cached data.`);
  const normalised = Array.isArray(cachedData) ? { games: cachedData, team_record: null } : cachedData;
  return normalised;
}
```

**Step 4: Update the live-scrape path (lines 381-404)**

Change:
```js
await enrichScheduleWithCHNLinks(scheduleData);
await saveToCache(scheduleData, fullCacheKey);
// ...
return scheduleData;
```

To:
```js
await enrichScheduleWithCHNLinks(scheduleData);
const teamRecord = await scrapeUSCHORecord();
await saveToCache({ games: scheduleData, team_record: teamRecord }, fullCacheKey);
// ...
return { games: scheduleData, team_record: teamRecord };
```

And update the error-return to:
```js
} catch (error) {
  console.error(`[FetchScheduleData] Error fetching schedule: ${error.message}`);
  return { games: [], team_record: null };
}
```

**Step 5: Run server tests**

```bash
npx jest --config jest.server.config.js --verbose
```
Expected: All PASS

**Step 6: Commit**

```bash
git add scraper.js
git commit -m "feat(schedule): enrich fetchScheduleData with USCHO team record"
```

---

### Task 3: Update server.js to pass `team_record` through

**Files:**
- Modify: `server.js:123-141`

**Context:** `fetchScheduleData` now returns `{ games, team_record }` instead of a plain array. The endpoint currently does `scheduleDataArray.length > 0`. Update it to destructure the result.

**Step 1: Update the `/api/schedule` handler**

Replace lines 123-141:
```js
// API endpoint for schedule data
app.get('/api/schedule', async (req, res) => {
  try {
    const { games, team_record } = await fetchScheduleData();

    if (games && games.length > 0) {
      res.json({
        data: games,
        team_record: team_record || null,
        source: 'api',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('/api/schedule: No schedule data returned from fetchScheduleData or an error occurred internally in scraper.');
      res.status(500).json({ error: 'Failed to fetch schedule data or no schedule available.' });
    }
  } catch (error) {
    console.error('Error in /api/schedule endpoint:', error);
    res.status(500).json({ error: 'Internal server error while fetching schedule data.' });
  }
});
```

**Step 2: Start the backend server and verify**

```bash
node server.js
```

In a separate terminal:
```bash
curl http://localhost:5000/api/schedule | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('team_record:', JSON.stringify(d.team_record)); console.log('games count:', d.data.length);"
```
Expected: `team_record` shows `{ overall, conf, home, away }` with win/loss/tie numbers. `games count` > 0.

(Note: First call will scrape live. Delete `src/scripts/cache/asu_hockey_schedule_2025` first if the cache exists with old format.)

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat(schedule): pass team_record through /api/schedule endpoint"
```

---

### Task 4: Update Schedule.jsx — consume `team_record` and render 4-row widget

**Files:**
- Modify: `src/pages/__tests__/Schedule.test.jsx` (add tests first)
- Modify: `src/pages/Schedule.jsx`

**Context:** The existing record widget (lines 92-117 of Schedule.jsx) uses `calculateRecord()` (lines 51-76) which regex-parses game result strings. The new widget should use `responseData.team_record` when present and fall back to `calculateRecord()` when absent. The layout changes from horizontal big-number cards to a compact 4-row table.

**Step 1: Write failing frontend tests**

Add to `src/pages/__tests__/Schedule.test.jsx`:

```js
it('should render 4-row record widget when team_record is provided', async () => {
  const mockScheduleData = {
    data: [
      { date: '2024-01-15', opponent: 'Denver', status: 'Home', time: '7:00 PM', location: 'Mullett Arena' }
    ],
    team_record: {
      overall: { wins: 14, losses: 19, ties: 1 },
      conf:    { wins: 7,  losses: 14, ties: 1 },
      home:    { wins: 9,  losses: 10, ties: 1 },
      away:    { wins: 5,  losses: 9,  ties: 0 },
    },
    source: 'api',
    timestamp: '2024-01-15T00:00:00Z',
  };

  getSchedule.mockResolvedValue(mockScheduleData);
  render(<Schedule />);

  await waitFor(() => {
    expect(screen.getByText('Overall Record')).toBeInTheDocument();
    expect(screen.getByText('NCHC Record')).toBeInTheDocument();
    expect(screen.getByText('Home Record')).toBeInTheDocument();
    expect(screen.getByText('Away Record')).toBeInTheDocument();
    expect(screen.getByText('14-19-1')).toBeInTheDocument();
    expect(screen.getByText('7-14-1')).toBeInTheDocument();
    expect(screen.getByText('9-10-1')).toBeInTheDocument();
    expect(screen.getByText('5-9')).toBeInTheDocument(); // ties=0 omitted
  });
});

it('should render single-row overall record fallback when team_record is absent', async () => {
  const mockScheduleData = {
    data: [
      { date: '2024-01-15', opponent: 'Denver', status: 'Home', time: '7:00 PM', location: 'Mullett Arena', result: 'W 3-1' }
    ],
    source: 'api',
    timestamp: '2024-01-15T00:00:00Z',
  };

  getSchedule.mockResolvedValue(mockScheduleData);
  render(<Schedule />);

  await waitFor(() => {
    expect(screen.getByText('Overall Record')).toBeInTheDocument();
    expect(screen.queryByText('NCHC Record')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run to verify they fail**

```bash
npm test -- --testPathPattern="Schedule" --watchAll=false
```
Expected: 2 new tests FAIL

**Step 3: Update Schedule.jsx**

Replace the `calculateRecord` function and the record widget JSX.

Add a `formatRecord` helper after the `formatDate` function (after line 49):
```js
const formatRecord = (r) =>
  r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
```

Update state to capture `team_record` (add alongside `games` state):
```js
const [teamRecord, setTeamRecord] = useState(null);
```

In the `fetchSchedulePageData` function, after `setGames(sortedSchedule)`:
```js
setTeamRecord(responseData.team_record || null);
```

Replace the record widget JSX (lines 92-117) with:
```jsx
{/* Team Record Display */}
<div className="team-record">
  <div className="record-card">
    <div className="record-label">Team Record</div>
    {teamRecord ? (
      <div className="record-table">
        <div className="record-row">
          <span className="record-row-label">Overall Record</span>
          <span className="record-row-value">{formatRecord(teamRecord.overall)}</span>
        </div>
        <div className="record-row">
          <span className="record-row-label">NCHC Record</span>
          <span className="record-row-value">{formatRecord(teamRecord.conf)}</span>
        </div>
        <div className="record-row">
          <span className="record-row-label">Home Record</span>
          <span className="record-row-value">{formatRecord(teamRecord.home)}</span>
        </div>
        <div className="record-row">
          <span className="record-row-label">Away Record</span>
          <span className="record-row-value">{formatRecord(teamRecord.away)}</span>
        </div>
      </div>
    ) : (
      <div className="record-table">
        <div className="record-row">
          <span className="record-row-label">Overall Record</span>
          <span className="record-row-value">{formatRecord(calculateRecord())}</span>
        </div>
      </div>
    )}
  </div>
</div>
```

The `calculateRecord()` function already returns `{wins, losses, ties}` so `formatRecord` works on it directly.

**Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="Schedule" --watchAll=false
```
Expected: All PASS

**Step 5: Commit**

```bash
git add src/pages/Schedule.jsx src/pages/__tests__/Schedule.test.jsx
git commit -m "feat(schedule): render 4-row USCHO record widget with fallback"
```

---

### Task 5: Update Schedule.css for the new record table layout + final verification

**Files:**
- Modify: `src/pages/Schedule.css:51-115`

**Context:** The old `.record-stats`, `.stat-item`, `.stat-value`, `.stat-label`, `.stat-separator` styles are no longer used. Replace them with `.record-table` and `.record-row` styles. Keep `.record-card`, `.record-card::before`, `.record-card:hover`, `.record-label` styles unchanged (lines 23-58).

**Step 1: Replace the record-stats block in Schedule.css**

Remove lines 60-95 (`.record-stats` through `.stat-separator`) and replace with:

```css
/* Record Table */
.record-table {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
}

.record-row:last-child {
  border-bottom: none;
}

.record-row-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.record-row-value {
  font-size: 1rem;
  font-weight: 800;
  color: var(--asu-maroon);
  letter-spacing: -0.01em;
}
```

**Step 2: Update `.record-card` padding to suit the table layout**

Change `padding: 24px 40px` to `padding: 24px 32px` (line 27 of Schedule.css) so the wider table content isn't too cramped.

**Step 3: Run the full test suite**

```bash
npm test -- --watchAll=false
```
Expected: All tests PASS

**Step 4: Delete stale schedule cache and do a live smoke test**

```bash
# Delete stale cache so the server scrapes fresh with new format
del src\scripts\cache\asu_hockey_schedule_2025
```
Start backend: `node server.js`
Start frontend: `npm start`
Open http://localhost:3000 → Schedule page → verify 4-row record widget shows.

**Step 5: Commit and push**

```bash
git add src/pages/Schedule.css
git commit -m "feat(schedule): update record widget CSS for 4-row table layout"
git push
```
