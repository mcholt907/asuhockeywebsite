# Team Record Widget — USCHO Enrichment Design

**Goal:** Add Overall, NCHC, Home, and Away records to the Schedule page record widget, sourced from USCHO.

**Architecture:** Scrape USCHO record data inside the existing `fetchScheduleData()` flow and store it alongside the games array in the schedule cache. No new endpoint or cache file needed.

**Tech Stack:** Node.js, axios, cheerio, React, CSS

---

## Data Source

`https://www.uscho.com/team/arizona-state/mens-hockey`

The page is an Inertia.js SPA. Record data is embedded as JSON in `<div id="app" data-page="...">`. Parse with:

```js
const page = JSON.parse($('#app').attr('data-page'));
const record = page.props.content.record;
// record.total   → overall  { wins, losses, ties }
// record.conf.total → NCHC  { wins, losses, ties }
// record.home    → home     { wins, losses, ties }
// record.road    → away     { wins, losses, ties }
```

## Backend Changes

### `config/scraper-config.js`
Add USCHO URL:
```js
uscho: 'https://www.uscho.com/team/arizona-state/mens-hockey',
```

### `scraper.js`
1. New `scrapeUSCHORecord()` — fetches USCHO page, parses Inertia JSON, returns:
   ```js
   { overall: {wins,losses,ties}, conf: {wins,losses,ties}, home: {wins,losses,ties}, away: {wins,losses,ties} }
   ```
   Returns `null` on any error (never breaks schedule).

2. `enrichScheduleWithCHNLinks()` pattern already exists — call `scrapeUSCHORecord()` in both scrape paths inside `fetchScheduleData()` and store as `team_record` in the cache object.

3. Change `fetchScheduleData()` return type from `games[]` to `{ games, team_record }`.

### `server.js`
Destructure `fetchScheduleData()` result, pass `team_record` through:
```js
const { games, team_record } = await fetchScheduleData();
res.json({ data: games, team_record, source: 'api', timestamp });
```

## Frontend Changes

### `Schedule.jsx`
- If `responseData.team_record` is present, use it for the widget.
- Otherwise fall back to existing `calculateRecord()` (regex parsing of game results).
- `calculateRecord()` stays as fallback — no deletion.

### Record Widget Layout
Switch from horizontal big-number layout to compact 4-row table:

```
Overall Record    14-19-1
NCHC Record        7-14-1
Home Record        9-10-1
Away Record        5-9-0
```

Label on left, W-L-T string on right. Card keeps gold top stripe and hover styles.

### `Schedule.css`
Replace `.record-stats` / `.stat-item` / `.stat-value` styles with a simple row grid layout for the 4-record table. Card outer styles (border-radius, shadow, gold stripe) unchanged.

## Error Handling
- USCHO scraping failure → `team_record: null` in API response → frontend falls back to `calculateRecord()`
- Ties = 0 → render as `W-L` (omit `-0`)

## Tests
- `__tests__/scraper-caching.test.js`: add tests for `scrapeUSCHORecord` (success, error→null, Inertia JSON parsing)
- `src/pages/__tests__/Schedule.test.jsx`: add tests for widget rendering with `team_record` present and absent (fallback)
