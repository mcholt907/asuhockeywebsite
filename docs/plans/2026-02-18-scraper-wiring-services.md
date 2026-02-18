# Scraper Wiring + Service Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire `/api/recruits` and `/api/roster` to use the existing JS scrapers instead of the static `asu_hockey_data.json`, and extract business logic from `server.js` into a `services/` layer.

**Architecture:** `fetchRecruitingData()` in `recruiting-scraper.js` gets SWR caching to match the pattern used by other scrapers. A new `services/roster-service.js` extracts the roster merge/mapping logic. `server.js` routes become thin — they call a service and return the result.

**Tech Stack:** Node.js, Express, cheerio, existing `caching-system.js` (synchronous file-based cache with SWR), Jest (`npx jest --config jest.server.config.js`)

---

## Task 1: Add SWR caching to `fetchRecruitingData()`

**Files:**
- Modify: `recruiting-scraper.js`
- Create: `__tests__/recruiting-scraper.test.js`

### Step 1: Write the failing tests

Create `__tests__/recruiting-scraper.test.js`:

```javascript
jest.mock('../src/scripts/caching-system', () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
}));

jest.mock('../utils/request-helper', () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

jest.mock('../config/scraper-config', () => ({
  CURRENT_SEASON: '2025-2026',
  FUTURE_SEASONS: ['2026-2027'],
  seasons: { current: 2025, stats: '20252026' },
  http: {
    userAgent: 'test-agent',
    timeout: 5000,
    retry: { maxRetries: 1, initialDelay: 0, maxDelay: 0 },
    rateLimiting: { delayBetweenRequests: 0 },
  },
  cache: { news: 60000, schedule: 86400000, stats: 21600000 },
  seasonBoundary: { boundaryMonth: 7 },
  urls: {
    chnStats: () => 'http://test/stats',
    chnNews: 'http://test/chn-news',
    sunDevilsNews: 'http://test/sd-news',
    sunDevilsSchedule: () => 'http://test/schedule',
  },
}));

const { getFromCache, saveToCache } = require('../src/scripts/caching-system');
const { requestWithRetry } = require('../utils/request-helper');
const { fetchRecruitingData } = require('../recruiting-scraper');

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockReturnValue(undefined);
  requestWithRetry.mockResolvedValue({ data: '<html></html>' });
});

describe('fetchRecruitingData — SWR caching', () => {
  test('returns fresh cached data without hitting the network', async () => {
    const freshData = { '2026-2027': [{ name: 'Jane Smith' }] };
    getFromCache.mockReturnValueOnce(freshData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(freshData);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test('returns stale data immediately when cache is expired', async () => {
    const staleData = { '2026-2027': [{ name: 'John Doe' }] };
    // First call (fresh): miss. Second call (ignoreExpiration=true): stale hit.
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(staleData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(staleData);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js
```

Expected: Both tests FAIL — `fetchRecruitingData` has no SWR path.

### Step 3: Refactor `recruiting-scraper.js` to add SWR

Add `recruitingPromise` module-level variable after the existing imports (line 4):

```javascript
let recruitingPromise = null;
```

Extract the actual scraping work from `fetchRecruitingData()` into a new helper. Add this function before `fetchRecruitingData`:

```javascript
async function scrapeAndCacheRecruiting(cacheKey, includePhotos) {
  try {
    const recruitingData = {};
    for (const season of config.FUTURE_SEASONS || ['2026-2027', '2027-2028', '2028-2029']) {
      console.log(`[Recruiting] Scraping season: ${season}${includePhotos ? ' with photos' : ''}`);
      const players = await scrapeEliteProspectsRecruiting(season, includePhotos);
      recruitingData[season] = players;
      await delayBetweenRequests();
    }
    if (Object.keys(recruitingData).length > 0) {
      saveToCache(recruitingData, cacheKey);
    }
    return recruitingData;
  } catch (error) {
    console.error('[FetchRecruitingData] Error fetching recruiting data:', error.message);
    return {};
  }
}
```

Replace the body of `fetchRecruitingData` with the 3-step SWR pattern:

```javascript
async function fetchRecruitingData(includePhotos = false) {
  const RECRUITING_CACHE_KEY = 'asu_hockey_recruiting';

  // 1. Fresh cache
  try {
    const cachedData = getFromCache(RECRUITING_CACHE_KEY);
    if (cachedData && !includePhotos) {
      console.log('[Recruiting Scraper] Returning cached recruiting data.');
      return cachedData;
    }

    // 2. SWR: return stale immediately, refresh in background
    const staleData = getFromCache(RECRUITING_CACHE_KEY, true);
    if (staleData && !includePhotos) {
      console.log('[Recruiting Scraper] Stale data found. Returning immediately and refreshing in background.');
      if (!recruitingPromise) {
        recruitingPromise = scrapeAndCacheRecruiting(RECRUITING_CACHE_KEY, includePhotos)
          .finally(() => { recruitingPromise = null; });
      }
      return staleData;
    }
  } catch (error) {
    console.log('[Recruiting Scraper] No valid cache found.');
  }

  // 3. No cache — must block on live scrape
  if (recruitingPromise) {
    return await recruitingPromise;
  }
  recruitingPromise = scrapeAndCacheRecruiting(RECRUITING_CACHE_KEY, includePhotos)
    .finally(() => { recruitingPromise = null; });
  return await recruitingPromise;
}
```

### Step 4: Run tests to verify they pass

```bash
npx jest --config jest.server.config.js __tests__/recruiting-scraper.test.js
```

Expected: Both tests PASS.

### Step 5: Commit

```bash
git add recruiting-scraper.js __tests__/recruiting-scraper.test.js
git commit -m "feat: add SWR caching to fetchRecruitingData()"
```

---

## Task 2: Create `services/roster-service.js`

**Files:**
- Create: `services/roster-service.js`
- Create: `__tests__/roster-service.test.js`

### Step 1: Write the failing tests

Create `__tests__/roster-service.test.js`:

```javascript
jest.mock('../scraper', () => ({
  scrapeCHNRoster: jest.fn(),
}));

const { scrapeCHNRoster } = require('../scraper');
const { determineNationality, getRoster } = require('../services/roster-service');

beforeEach(() => jest.clearAllMocks());

describe('determineNationality', () => {
  test('defaults to USA for US city/state', () => {
    expect(determineNationality('Scottsdale, AZ')).toBe('USA');
  });

  test('detects Canada from province abbreviation', () => {
    expect(determineNationality('Winnipeg, MB, CAN')).toBe('CAN');
  });

  test('detects Slovakia', () => {
    expect(determineNationality('Bratislava, SVK')).toBe('SVK');
  });

  test('returns USA for empty or dash', () => {
    expect(determineNationality('')).toBe('USA');
    expect(determineNationality('-')).toBe('USA');
  });
});

describe('getRoster', () => {
  test('maps CHN player fields to API format', async () => {
    scrapeCHNRoster.mockResolvedValue([
      {
        '#': '30',
        Player: 'Chase Hamm',
        Pos: 'G',
        'S/C': 'L',
        Ht: '5-10',
        Wt: '168',
        DOB: '05/07/2000',
        Hometown: 'Saskatoon, SK CAN',
      },
    ]);

    const result = await getRoster();

    expect(result).toHaveLength(1);
    const player = result[0];
    expect(player.number).toBe('30');
    expect(player.name).toBe('Chase Hamm (G)');
    expect(player.position).toBe('G');
    expect(player.shoots).toBe('L');
    expect(player.height).toBe('5-10');
    expect(player.weight).toBe('168');
    expect(player.nationality).toBe('CAN');
    expect(player.player_link).toContain('eliteprospects.com');
  });

  test('returns empty array when scraper returns nothing', async () => {
    scrapeCHNRoster.mockResolvedValue([]);
    const result = await getRoster();
    expect(result).toEqual([]);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx jest --config jest.server.config.js __tests__/roster-service.test.js
```

Expected: FAIL — `services/roster-service.js` does not exist.

### Step 3: Create `services/roster-service.js`

```javascript
// services/roster-service.js
const { scrapeCHNRoster } = require('../scraper');

function determineNationality(hometown) {
  if (!hometown || hometown === '-') return 'USA';
  const h = hometown.toUpperCase();

  const europeMap = {
    'SVK': 'SVK', 'SLOVAKIA': 'SVK',
    'CZE': 'CZE', 'CZECH': 'CZE',
    'SWE': 'SWE', 'SWEDEN': 'SWE',
    'FIN': 'FIN', 'FINLAND': 'FIN',
    'RUS': 'RUS', 'RUSSIA': 'RUS',
    'GER': 'GER', 'GERMANY': 'GER',
    'LAT': 'LAT', 'LATVIA': 'LAT',
    'BLR': 'BLR', 'BELARUS': 'BLR',
    'SUI': 'SUI', 'SWITZERLAND': 'SUI',
    'AUT': 'AUT', 'AUSTRIA': 'AUT',
    'GBR': 'GBR', 'UK': 'GBR',
  };

  for (const [key, code] of Object.entries(europeMap)) {
    if (h.includes(key)) return code;
  }

  if (
    h.includes('CAN') || h.includes('CANADA') ||
    h.includes(' ON') || h.includes('QUE') || h.includes(' BC') || h.includes(' AB') || h.includes(' MB') ||
    h.includes(' SK') || h.includes(' NS') || h.includes(' NB') || h.includes(' PE') || h.includes(' NL') ||
    h.includes('ONT') || h.includes('MAN') || h.includes('ALB') || h.includes('SASK')
  ) {
    return 'CAN';
  }

  return 'USA';
}

async function getRoster() {
  const chnPlayers = await scrapeCHNRoster();

  return chnPlayers
    .filter(p => p.Player)
    .map(p => {
      const name = p.Player.trim();
      const pos = p.Pos || '';
      const hometown = p.Hometown || '';
      const cleanName = name.replace(/\s*\([A-Z]+\)\s*/i, '').trim();

      return {
        number: p['#'] || '',
        name: pos ? `${name} (${pos})` : name,
        position: pos,
        height: p.Ht || '-',
        weight: p.Wt || '-',
        shoots: p['S/C'] || '-',
        born: p.DOB || '-',
        birthplace: hometown || '-',
        nationality: determineNationality(hometown),
        player_link: `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(cleanName)}`,
      };
    });
}

module.exports = { determineNationality, getRoster };
```

Note: create the `services/` directory first:
```bash
mkdir -p services
```

### Step 4: Run tests to verify they pass

```bash
npx jest --config jest.server.config.js __tests__/roster-service.test.js
```

Expected: All 6 tests PASS.

### Step 5: Commit

```bash
git add services/roster-service.js __tests__/roster-service.test.js
git commit -m "feat: add roster-service with determineNationality and getRoster"
```

---

## Task 3: Wire `/api/recruits` to `fetchRecruitingData()`

**Files:**
- Modify: `server.js`

### Step 1: Add import at top of `server.js`

After the existing scraper imports (around line 21-23), add:

```javascript
const { fetchRecruitingData } = require('./recruiting-scraper');
```

### Step 2: Replace the `/api/recruits` handler body

Find the current handler (lines 161-179). Replace the body:

**Old:**
```javascript
app.get('/api/recruits', async (req, res) => {
  try {
    console.log('[API /recruits] Fetching recruiting data from static JSON file...');
    const fileData = await fs.readFile(HOCKEY_DATA_PATH, 'utf-8');
    const parsedData = JSON.parse(fileData);
    const recruitingData = parsedData.recruiting || {};
    console.log('[API /recruits] Successfully returning recruiting data from JSON file');
    res.json(recruitingData);
  } catch (error) {
    console.error('[API /recruits] Error reading recruiting data:', error.message);
    res.status(500).json({
      error: 'Failed to fetch recruiting data',
      message: error.message
    });
  }
});
```

**New:**
```javascript
app.get('/api/recruits', async (req, res) => {
  try {
    console.log('[API /recruits] Fetching recruiting data...');
    const recruitingData = await fetchRecruitingData();
    console.log('[API /recruits] Successfully returning recruiting data');
    res.json(recruitingData);
  } catch (error) {
    console.error('[API /recruits] Error fetching recruiting data:', error.message);
    res.status(500).json({
      error: 'Failed to fetch recruiting data',
      message: error.message
    });
  }
});
```

### Step 3: Verify server starts without errors

```bash
node -e "require('./server')" 2>&1 | head -5
```

Expected: Server starts, prints port and endpoint list, no crash.

Stop it with Ctrl+C.

### Step 4: Commit

```bash
git add server.js
git commit -m "feat: wire /api/recruits to fetchRecruitingData() scraper"
```

---

## Task 4: Wire `/api/roster` to `rosterService.getRoster()`

**Files:**
- Modify: `server.js`

### Step 1: Add import at top of `server.js`

After the `fetchRecruitingData` import, add:

```javascript
const { getRoster } = require('./services/roster-service');
```

### Step 2: Replace the `/api/roster` handler

Find the current handler (lines 213-375). Replace the entire handler with:

```javascript
app.get('/api/roster', async (req, res) => {
  try {
    const roster = await getRoster();
    if (roster.length > 0) {
      res.json(roster);
    } else {
      res.status(404).json({ error: 'Roster data not found.' });
    }
  } catch (error) {
    console.error('Error in /api/roster:', error);
    res.status(500).json({ error: 'Internal server error while fetching roster data.' });
  }
});
```

### Step 3: Verify server starts without errors

```bash
node -e "require('./server')" 2>&1 | head -5
```

Expected: no crash.

### Step 4: Commit

```bash
git add server.js
git commit -m "feat: wire /api/roster to rosterService.getRoster()"
```

---

## Task 5: Clean up `server.js`

**Files:**
- Modify: `server.js`

### Step 1: Remove unused code

Remove these items from `server.js` (now that `/api/roster` no longer uses them):

1. **`getHockeyData()` function** (lines ~146-158) — delete entirely
2. **`determineNationality()` function** (lines ~377-414) — delete entirely
3. **`const HOCKEY_DATA_PATH = ...`** (line ~44) — delete
4. **`const fs = require('fs').promises`** (line ~25) — delete (no longer used)
5. **`const { scrapeCHNRoster } = require('./scraper')` inline require** inside the old `/api/roster` handler — already gone after Task 4

### Step 2: Verify server starts without errors

```bash
node -e "require('./server')" 2>&1 | head -10
```

Expected: clean startup, no `ReferenceError`.

### Step 3: Run all server-side tests

```bash
npx jest --config jest.server.config.js
```

Expected: All tests PASS (scraper-caching, recruiting-scraper, roster-service).

### Step 4: Commit

```bash
git add server.js
git commit -m "chore: remove getHockeyData, determineNationality and fs import from server.js"
```

---

## Final Verification

```bash
npx jest --config jest.server.config.js
```

Expected output:
```
PASS __tests__/scraper-caching.test.js
PASS __tests__/recruiting-scraper.test.js
PASS __tests__/roster-service.test.js

Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total
```
