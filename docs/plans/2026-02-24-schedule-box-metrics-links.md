# Schedule Box & Metrics Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scrape Box and Metrics links from the CHN schedule page and display them as small link badges on completed games on the Schedule page.

**Architecture:** Add `scrapeCHNScheduleLinks()` to `scraper.js` that fetches the CHN schedule page and returns a date-keyed map of `{ box_link, metrics_link }`. Call this in `fetchScheduleData()` after each `scrapeSunDevilsSchedule()` call to merge the links into each game object before caching. The frontend renders the links when present on completed games.

**Tech Stack:** Node.js/cheerio (backend scraping), React (frontend render), Jest + React Testing Library (tests)

---

### Task 1: Add CHN schedule URL to scraper config

**Files:**
- Modify: `config/scraper-config.js`

**Step 1: Add the URL**

Open `config/scraper-config.js`. In the `urls` object, add after `chnStats`:

```js
chnSchedule: 'https://www.collegehockeynews.com/schedules/team/Arizona-State/61',
```

**Step 2: Verify no tests break**

```bash
npx jest --config jest.server.config.js
```

Expected: all tests pass (config mock in tests uses its own values, this is additive only).

**Step 3: Commit**

```bash
git add config/scraper-config.js
git commit -m "feat(config): add CHN schedule URL for Box & Metrics scraping"
```

---

### Task 2: Write failing test for `scrapeCHNScheduleLinks`

**Files:**
- Modify: `__tests__/scraper-caching.test.js`

**Step 1: Add import at top of test file**

The test file already imports `scrapeCHNRoster` from `../scraper`. Add `scrapeCHNScheduleLinks` to that import line:

```js
const { scrapeCHNRoster, scrapeCHNScheduleLinks } = require('../scraper');
```

Also update the mock for `scraper-config.js` to include the new URL (add to `urls` in the existing mock object):

```js
chnSchedule: 'http://test/chn-schedule',
```

**Step 2: Write the failing test**

Add at the bottom of `__tests__/scraper-caching.test.js`:

```js
describe('scrapeCHNScheduleLinks', () => {
  test('returns date-keyed map of box and metrics links', async () => {
    const html = `<html><body><table>
      <tr>
        <td><a href="/box/final/20251003/psu/asu/">Box</a></td>
        <td><a href="/box/metrics.php?gd=110368">Metrics</a></td>
      </tr>
      <tr>
        <td><a href="/box/final/20251010/ndm/asu/">Box</a></td>
        <td><a href="/box/metrics.php?gd=110371">Metrics</a></td>
      </tr>
    </table></body></html>`;

    requestWithRetry.mockResolvedValueOnce({ data: html });

    const result = await scrapeCHNScheduleLinks();

    expect(result).toEqual({
      '2025-10-03': {
        box_link: 'https://www.collegehockeynews.com/box/final/20251003/psu/asu/',
        metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=110368',
      },
      '2025-10-10': {
        box_link: 'https://www.collegehockeynews.com/box/final/20251010/ndm/asu/',
        metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=110371',
      },
    });
  });

  test('returns empty object when request fails', async () => {
    requestWithRetry.mockRejectedValueOnce(new Error('network error'));

    const result = await scrapeCHNScheduleLinks();

    expect(result).toEqual({});
  });

  test('skips rows without a box link', async () => {
    const html = `<html><body><table>
      <tr>
        <td>No links here</td>
      </tr>
      <tr>
        <td><a href="/box/final/20251003/psu/asu/">Box</a></td>
        <td><a href="/box/metrics.php?gd=110368">Metrics</a></td>
      </tr>
    </table></body></html>`;

    requestWithRetry.mockResolvedValueOnce({ data: html });

    const result = await scrapeCHNScheduleLinks();

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['2025-10-03']).toBeDefined();
  });
});
```

**Step 3: Run test to confirm it fails**

```bash
npx jest --config jest.server.config.js --testPathPattern="scraper-caching" -t "scrapeCHNScheduleLinks"
```

Expected: FAIL — `scrapeCHNScheduleLinks is not a function`

---

### Task 3: Implement `scrapeCHNScheduleLinks` in `scraper.js`

**Files:**
- Modify: `scraper.js`

**Step 1: Add the function**

Add this function in `scraper.js` after `scrapeSunDevilsSchedule` (around line 265, before `fetchScheduleData`):

```js
async function scrapeCHNScheduleLinks() {
  const url = config.urls.chnSchedule;
  console.log(`[CHN Schedule Links] Fetching from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const linkMap = {};

    $('tr').each((_, row) => {
      let boxHref = null;
      let metricsHref = null;

      $(row).find('a').each((_, a) => {
        const text = $(a).text().trim();
        const href = $(a).attr('href');
        if (text === 'Box' && href) boxHref = href;
        if (text === 'Metrics' && href) metricsHref = href;
      });

      if (boxHref) {
        const match = boxHref.match(/\/box\/final\/(\d{4})(\d{2})(\d{2})\//);
        if (match) {
          const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
          linkMap[isoDate] = {
            box_link: `https://www.collegehockeynews.com${boxHref}`,
            metrics_link: metricsHref
              ? `https://www.collegehockeynews.com${metricsHref}`
              : null,
          };
        }
      }
    });

    console.log(`[CHN Schedule Links] Found links for ${Object.keys(linkMap).length} games.`);
    return linkMap;
  } catch (error) {
    console.error(`[CHN Schedule Links] Error: ${error.message}`);
    return {};
  }
}
```

**Step 2: Export the function**

Update the `module.exports` line at the bottom of `scraper.js` (currently line 695):

```js
module.exports = { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeCHNScheduleLinks };
```

**Step 3: Run the tests**

```bash
npx jest --config jest.server.config.js --testPathPattern="scraper-caching" -t "scrapeCHNScheduleLinks"
```

Expected: all 3 tests PASS

**Step 4: Commit**

```bash
git add scraper.js
git commit -m "feat(scraper): add scrapeCHNScheduleLinks to fetch Box & Metrics hrefs from CHN"
```

---

### Task 4: Merge CHN links into `fetchScheduleData`

**Files:**
- Modify: `scraper.js`

**Step 1: Add a helper that enriches games with CHN links**

Add this helper function in `scraper.js` right after `scrapeCHNScheduleLinks`:

```js
async function enrichScheduleWithCHNLinks(games) {
  const chnLinks = await scrapeCHNScheduleLinks();
  for (const game of games) {
    if (game.date && chnLinks[game.date]) {
      game.box_link = chnLinks[game.date].box_link;
      game.metrics_link = chnLinks[game.date].metrics_link;
    }
  }
  return games;
}
```

**Step 2: Call helper in background refresh path**

In `fetchScheduleData`, the background refresh path (around line 294) currently reads:

```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });
if (scheduleData && scheduleData.length > 0) {
  await saveToCache(scheduleData, fullCacheKey);
}
```

Change the cache save line to enrich first:

```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });
if (scheduleData && scheduleData.length > 0) {
  await enrichScheduleWithCHNLinks(scheduleData);
  await saveToCache(scheduleData, fullCacheKey);
}
```

**Step 3: Call helper in fresh scrape path**

The fresh scrape path (around line 326) currently reads:

```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });

if (scheduleData && scheduleData.length > 0) {
  console.log(`[Cache System] Successfully scraped ${scheduleData.length} games. Saving to cache for ${targetSeasonStartYear}.`);
  await saveToCache(scheduleData, fullCacheKey);
} else {
  console.log(`[Cache System] No schedule data returned from scraper for ${targetSeasonStartYear}. Not caching.`);
}
return scheduleData;
```

Change to:

```js
const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
const duration = Date.now() - startTime;
Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });

if (scheduleData && scheduleData.length > 0) {
  console.log(`[Cache System] Successfully scraped ${scheduleData.length} games. Saving to cache for ${targetSeasonStartYear}.`);
  await enrichScheduleWithCHNLinks(scheduleData);
  await saveToCache(scheduleData, fullCacheKey);
} else {
  console.log(`[Cache System] No schedule data returned from scraper for ${targetSeasonStartYear}. Not caching.`);
}
return scheduleData;
```

**Step 4: Run all server tests**

```bash
npx jest --config jest.server.config.js
```

Expected: all tests pass (existing tests don't test cache enrichment, so no breakage)

**Step 5: Commit**

```bash
git add scraper.js
git commit -m "feat(scraper): merge CHN Box & Metrics links into schedule data before caching"
```

---

### Task 5: Write failing frontend test for Box/Metrics links

**Files:**
- Modify: `src/pages/__tests__/Schedule.test.jsx`

**Step 1: Add test cases**

Add to the `describe('Schedule Page')` block in `src/pages/__tests__/Schedule.test.jsx`:

```jsx
it('should render Box and Metrics links for completed games', async () => {
  const mockScheduleData = {
    data: [
      {
        date: '2024-01-15',
        opponent: 'Penn State',
        status: 'Home',
        time: '7:00 PM',
        location: 'Mullett Arena',
        result: 'W 4-1',
        box_link: 'https://www.collegehockeynews.com/box/final/20240115/psu/asu/',
        metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=12345',
      },
    ],
    source: 'api',
    timestamp: '2024-01-15T00:00:00Z',
  };

  getSchedule.mockResolvedValue(mockScheduleData);
  render(<Schedule />);

  await waitFor(() => {
    const boxLink = screen.getByRole('link', { name: /box/i });
    const metricsLink = screen.getByRole('link', { name: /metrics/i });
    expect(boxLink).toHaveAttribute('href', 'https://www.collegehockeynews.com/box/final/20240115/psu/asu/');
    expect(boxLink).toHaveAttribute('target', '_blank');
    expect(metricsLink).toHaveAttribute('href', 'https://www.collegehockeynews.com/box/metrics.php?gd=12345');
    expect(metricsLink).toHaveAttribute('target', '_blank');
  });
});

it('should not render Box/Metrics links when fields are absent', async () => {
  const mockScheduleData = {
    data: [
      {
        date: '2024-02-01',
        opponent: 'Denver',
        status: 'Away',
        time: '7:00 PM',
        location: 'Magness Arena',
        result: 'L 1-3',
        // no box_link or metrics_link
      },
    ],
    source: 'api',
    timestamp: '2024-02-01T00:00:00Z',
  };

  getSchedule.mockResolvedValue(mockScheduleData);
  render(<Schedule />);

  await waitFor(() => {
    expect(screen.queryByRole('link', { name: /box/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /metrics/i })).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="Schedule" --watchAll=false
```

Expected: FAIL — Box and Metrics links not rendered yet

---

### Task 6: Update `Schedule.jsx` to render Box/Metrics links

**Files:**
- Modify: `src/pages/Schedule.jsx`

**Step 1: Replace the empty `game-broadcast` div with conditional link rendering**

Find this block in `Schedule.jsx` (around line 139):

```jsx
{game.result && (
  <div className="game-result">
    Result: {game.result}
  </div>
)}
<div className="game-broadcast">
  {/* Future enhancement: add broadcast info if available in data */}
</div>
```

Replace with:

```jsx
{game.result && (
  <div className="game-result">
    Result: {game.result}
  </div>
)}
{game.result && (game.box_link || game.metrics_link) && (
  <div className="game-links">
    {game.box_link && (
      <a href={game.box_link} target="_blank" rel="noopener noreferrer" className="game-link-btn">
        Box
      </a>
    )}
    {game.metrics_link && (
      <a href={game.metrics_link} target="_blank" rel="noopener noreferrer" className="game-link-btn">
        Metrics
      </a>
    )}
  </div>
)}
```

**Step 2: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="Schedule" --watchAll=false
```

Expected: all Schedule tests PASS

**Step 3: Commit**

```bash
git add src/pages/Schedule.jsx
git commit -m "feat(schedule): render Box and Metrics links for completed games"
```

---

### Task 7: Style the Box/Metrics link badges

**Files:**
- Modify: `src/pages/Schedule.css`

**Step 1: Add styles**

Add at the end of `Schedule.css`, before the `@media (max-width: 768px)` block:

```css
/* Box & Metrics Links */
.game-links {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}

.game-link-btn {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--asu-maroon);
  text-decoration: none;
  padding: 4px 10px;
  background: rgba(232, 168, 51, 0.25);
  border: 1px solid rgba(232, 168, 51, 0.4);
  border-radius: 4px;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.game-link-btn:hover {
  background: var(--asu-gold);
  border-color: var(--asu-gold);
}
```

Inside the existing `@media (max-width: 768px)` block, add:

```css
  .game-links {
    justify-content: flex-start;
  }
```

**Step 2: Visually verify in browser**

Start both servers (`npm start` and `node server.js`), open the Schedule page, and confirm:
- Completed games show small "Box" and "Metrics" badge links
- Clicking opens the correct CHN URL in a new tab
- Upcoming games show no links
- Mobile layout looks correct

**Step 3: Commit**

```bash
git add src/pages/Schedule.css
git commit -m "style(schedule): add Box & Metrics link badge styling"
```

---

### Task 8: Clear schedule cache and push

**Step 1: Delete the schedule cache file so it re-scrapes with CHN links**

```bash
ls src/scripts/cache/
```

Find the schedule cache file (named `asu_hockey_schedule_2025.json` or similar) and delete it:

```bash
rm src/scripts/cache/asu_hockey_schedule_2025.json
```

(If the file doesn't exist locally, no action needed — Render will start fresh.)

**Step 2: Run full test suite**

```bash
npm test -- --watchAll=false
npx jest --config jest.server.config.js
```

Expected: all tests pass

**Step 3: Push to deploy**

```bash
git push origin main
```
