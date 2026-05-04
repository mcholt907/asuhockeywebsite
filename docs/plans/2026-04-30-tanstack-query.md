# TanStack Query Adoption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Source design doc:** `2026-04-30-tanstack-query-design.md`
**Goal:** Adopt `@tanstack/react-query` as the client data layer to dedupe the duplicate `/api/schedule` fetch on Home, eliminate `useEffect → axios → setLoading` boilerplate across all 7 pages, and refactor `src/services/api.js` to throw on error so `isError` flows naturally.
**Tech stack:** React 19, CRA, axios, Jest + Testing Library, Playwright

**Rollout:** Two PRs. Stop and open PR 1 after Task 13. Resume Tasks 14+ on a fresh branch for PR 2.

---

## PR 1 — Foundation + Schedule Dedup

### Task 1: Install dependencies

**Files:**

- Modify: `package.json`, `package-lock.json`

**Step 1: Install both packages**

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Step 2: Verify**

```bash
npm ls @tanstack/react-query @tanstack/react-query-devtools
```

Expected: both listed at top level. Note both versions for the PR description (e.g., `^5.x.x`).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @tanstack/react-query + devtools"
```

---

### Task 2: Create query client + key registry

**Files:**

- Create: `src/hooks/queries/queryClient.js`
- Create: `src/hooks/queries/queryKeys.js`

**Step 1: Create the QueryClient singleton**

`src/hooks/queries/queryClient.js`:

```js
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: 1000,
    },
  },
});
```

**Step 2: Create the query-key registry**

`src/hooks/queries/queryKeys.js`:

```js
export const queryKeys = {
  news:      ['news'],
  schedule:  ['schedule'],
  roster:    ['roster'],
  recruits:  ['recruits'],
  standings: ['standings'],
  alumni:    ['alumni'],
  transfers: ['transfers'],
  stats:     ['stats'],
};
```

**Step 3: Commit**

```bash
git add src/hooks/queries/queryClient.js src/hooks/queries/queryKeys.js
git commit -m "feat(data): add QueryClient singleton and centralized query keys"
```

---

### Task 3: Wire QueryClientProvider into App.js

**Files:**

- Modify: `src/App.js`

**Step 1: Replace the imports block at the top of `src/App.js`**

Currently:

```js
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import './App.css';
```

Change to:

```js
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './hooks/queries/queryClient';
import './App.css';
```

**Step 2: Conditionally import devtools (dev-only)**

Add directly below the imports (above page imports):

```js
const ReactQueryDevtools =
  process.env.NODE_ENV !== 'production'
    ? require('@tanstack/react-query-devtools').ReactQueryDevtools
    : () => null;
```

This pattern is what tree-shakes the devtools out of the prod bundle — `process.env.NODE_ENV` is statically replaced by webpack at build time, so the `require` only runs in dev.

**Step 3: Wrap the existing `App` body in `QueryClientProvider`**

Find the existing `App` function (currently the last function in the file):

```js
function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
```

Replace with:

```js
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**Step 4: Smoke check — existing tests still pass**

```bash
npm test -- --watchAll=false
```

Expected: all currently-passing tests still pass. (The provider is mounted but no hook consumes it yet.)

**Step 5: Commit**

```bash
git add src/App.js
git commit -m "feat(data): mount QueryClientProvider + dev-only devtools"
```

---

### Task 4: Add `renderWithQueryClient` test helper

**Files:**

- Create: `src/test-utils/renderWithQueryClient.jsx`

**Step 1: Create the helper**

`src/test-utils/renderWithQueryClient.jsx`:

```jsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export const renderWithQueryClient = (ui) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
```

A **fresh client per render** prevents cross-test cache pollution. `retry: false` keeps error tests fast and deterministic.

**Step 2: Commit**

```bash
git add src/test-utils/renderWithQueryClient.jsx
git commit -m "test(infra): add renderWithQueryClient helper"
```

---

### Task 5: Rewrite `getSchedule` test to expect a thrown error (TDD red)

**Files:**

- Modify: `src/services/__tests__/api.test.js`

**Step 1: Replace the `describe('getSchedule', ...)` block**

Find the existing block (currently lines 117-148) and replace it with:

```js
  describe('getSchedule', () => {
    it('should return schedule data when API call succeeds', async () => {
      const mockSchedule = {
        data: {
          data: [
            { date: '2024-01-01', opponent: 'Team A', status: 'Home' }
          ],
          source: 'api',
          timestamp: '2024-01-01T00:00:00Z'
        }
      };

      axios.get.mockResolvedValue(mockSchedule);

      const result = await getSchedule();

      expect(result).toEqual(mockSchedule.data);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/schedule'));
    });

    it('should throw when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(getSchedule()).rejects.toThrow('Network error');
    });

    it('should throw when the response shape is invalid', async () => {
      axios.get.mockResolvedValue({ data: { invalid: 'format' } });

      await expect(getSchedule()).rejects.toThrow(/Invalid data format/i);
    });
  });
```

**Step 2: Run the schedule tests — they MUST fail**

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

Expected: the `getSchedule` "should throw" cases fail because the current `getSchedule` returns a sentinel object instead of throwing. Do **not** commit yet.

---

### Task 6: Refactor `getSchedule` to throw (TDD green)

**Files:**

- Modify: `src/services/api.js`

**Step 1: Replace the `getSchedule` export**

Find the existing `export const getSchedule = ...` (currently lines 110-124) and replace it with:

```js
export const getSchedule = async () => {
  const response = await axios.get(`${API_BASE_URL}/schedule`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/schedule');
  }
  return response.data;
};
```

**Step 2: Run the schedule tests — they MUST pass**

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

Expected: all `getSchedule` tests green.

**Step 3: Run the full unit suite to catch fallout**

```bash
npm test -- --watchAll=false
```

Expected: all tests green. (`Schedule.test.jsx` mocks `getSchedule.mockResolvedValue(...)` directly, so it's unaffected; we'll align that mock to reflect the new throwing behavior in Task 7.)

**Step 4: Commit**

```bash
git add src/services/api.js src/services/__tests__/api.test.js
git commit -m "refactor(api): getSchedule throws on network/format error"
```

---

### Task 7: Align `Schedule.test.jsx` error mock with new API contract

**Files:**

- Modify: `src/pages/__tests__/Schedule.test.jsx`

The existing error-case test mocks `getSchedule.mockResolvedValue({ source: 'error', ... })`, but the real function now throws. Updating the mock keeps the test honest — `Schedule.jsx` still uses the old try/catch (it's not migrated until PR 2), so the behavior under test (rendering an error message) doesn't change.

**Step 1: Replace the error-case test**

Find the test starting at line 65 (`should render error message when API call fails`) and replace it with:

```js
  it('should render error message when API call fails', async () => {
    getSchedule.mockRejectedValue(new Error('Failed to fetch schedule'));

    renderSchedule();

    await waitFor(() => {
      expect(screen.getByText(/failed to load schedule/i)).toBeInTheDocument();
    });
  });
```

The assertion text changed: when `getSchedule` throws, `Schedule.jsx`'s catch block sets `error` to its hardcoded fallback `'Failed to load schedule data. Please try again later.'` (see `Schedule.jsx:36`), not the error message itself. The regex `/failed to load schedule/i` matches that fallback.

**Step 2: Run the file**

```bash
npm test -- --watchAll=false --testPathPattern="pages/__tests__/Schedule"
```

Expected: all tests green.

**Step 3: Commit**

```bash
git add src/pages/__tests__/Schedule.test.jsx
git commit -m "test(schedule): align error mock with new throwing api contract"
```

---

### Task 8: Write `useSchedule` hook test (TDD red)

**Files:**

- Create: `src/hooks/queries/__tests__/useSchedule.test.js`

**Step 1: Create the test**

```js
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getSchedule } from '../../../services/api';
import { useSchedule } from '../useSchedule';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns schedule data on success', async () => {
    const mock = { data: [{ date: '2024-01-01', opponent: 'Team A' }], source: 'api' };
    getSchedule.mockResolvedValue(mock);

    const { result } = renderHook(() => useSchedule(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mock);
  });

  it('surfaces isError when getSchedule throws', async () => {
    getSchedule.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSchedule(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe('boom');
  });
});
```

**Step 2: Run — MUST fail (hook doesn't exist)**

```bash
npm test -- --watchAll=false --testPathPattern="hooks/queries/__tests__/useSchedule"
```

Expected: import error, "Cannot find module '../useSchedule'". Do not commit.

---

### Task 9: Create `useSchedule` hook (TDD green)

**Files:**

- Create: `src/hooks/queries/useSchedule.js`

**Step 1: Create the hook**

```js
import { useQuery } from '@tanstack/react-query';
import { getSchedule } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useSchedule = () =>
  useQuery({
    queryKey: queryKeys.schedule,
    queryFn: getSchedule,
  });
```

**Step 2: Run — MUST pass**

```bash
npm test -- --watchAll=false --testPathPattern="hooks/queries/__tests__/useSchedule"
```

Expected: both tests green.

**Step 3: Commit**

```bash
git add src/hooks/queries/useSchedule.js src/hooks/queries/__tests__/useSchedule.test.js
git commit -m "feat(data): add useSchedule hook"
```

---

### Task 10: Add dedup integration test

**Files:**

- Create: `src/hooks/queries/__tests__/dedup.test.js`

**Step 1: Create the test**

This is the headline assertion that PR 1 actually fixes F2: two components calling `useSchedule()` under the same provider share one underlying request.

```js
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getSchedule } from '../../../services/api';
import { useSchedule } from '../useSchedule';

const ConsumerA = () => {
  const { data } = useSchedule();
  return <div data-testid="a">{data ? 'A loaded' : 'A loading'}</div>;
};

const ConsumerB = () => {
  const { data } = useSchedule();
  return <div data-testid="b">{data ? 'B loaded' : 'B loading'}</div>;
};

describe('useSchedule deduplication', () => {
  it('two components calling useSchedule share one network request', async () => {
    getSchedule.mockResolvedValue({ data: [], source: 'api' });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const { getByTestId } = render(
      <QueryClientProvider client={client}>
        <ConsumerA />
        <ConsumerB />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(getByTestId('a').textContent).toBe('A loaded');
      expect(getByTestId('b').textContent).toBe('B loaded');
    });

    expect(getSchedule).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run — MUST pass on first try**

```bash
npm test -- --watchAll=false --testPathPattern="hooks/queries/__tests__/dedup"
```

Expected: green. TanStack Query dedupes by `queryKey` automatically.

**Step 3: Commit**

```bash
git add src/hooks/queries/__tests__/dedup.test.js
git commit -m "test(data): verify useSchedule dedupes parallel callers"
```

---

### Task 11: Refactor `UpcomingGames` to use `useSchedule`

**Files:**

- Modify: `src/components/UpcomingGames.jsx`

**Step 1: Replace the entire file**

```jsx
// src/components/UpcomingGames.jsx
import React, { useMemo } from 'react';
import { useSchedule } from '../hooks/queries/useSchedule';
import './UpcomingGames.css';

const formatGameDisplay = (dateStr, timeStr) => {
  if (!dateStr || dateStr === 'TBD') return 'Date TBD';
  const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const dateParts = dateStr.split('-');
  const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
  const displayDate = date.toLocaleDateString('en-US', options);
  return `${displayDate} - ${timeStr && timeStr !== 'TBD' ? timeStr : 'TBD'}`;
};

function UpcomingGames({ limit = 3 }) {
  const { data, isLoading, isError } = useSchedule();

  const upcomingGames = useMemo(() => {
    const games = data?.data;
    if (!Array.isArray(games)) return [];
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return games
      .filter(game => game.date >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const displayGames = upcomingGames.slice(0, limit);

  return (
    <div className="upcoming-games-widget">
      {isLoading && <p className="loading-message">Loading upcoming games...</p>}
      {!isLoading && isError && <p className="error-message">An unexpected error occurred while fetching schedule.</p>}
      {!isLoading && !isError && displayGames.length === 0 && (
        <p className="no-games">No upcoming games to display currently.</p>
      )}
      {!isLoading && !isError && displayGames.length > 0 && (
        <ul>
          {displayGames.map((game, idx) => (
            <li key={`${game.date}-${game.opponent}-${idx}`}>
              <span className="game-date-time-display">{formatGameDisplay(game.date, game.time)}</span>
              <span className="game-opponent-display"> {game.status === 'Home' ? 'vs' : '@'} {game.opponent}</span>
              {game.location && <span className="game-location-display"> ({game.location})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default UpcomingGames;
```

Notes on what changed:

- Removed the local `useState`/`useEffect`/`fetch` block — replaced by `useSchedule()`
- Hand-rolled `fetch('/api/schedule')` is gone; the dedup with `Home.jsx` happens because both call `useSchedule()` with the same `queryKey`
- Filtering/sorting moved into a `useMemo` so it doesn't run on every render

**Step 2: Run unit suite**

```bash
npm test -- --watchAll=false
```

Expected: green.

**Step 3: Commit**

```bash
git add src/components/UpcomingGames.jsx
git commit -m "refactor(upcoming-games): use useSchedule hook (kills duplicate fetch)"
```

---

### Task 12: Refactor `Home.jsx` schedule fetch to use `useSchedule`

**Files:**

- Modify: `src/pages/Home.jsx`

`getNews` and `getStandings` stay on the old pattern in this PR — only the schedule fetch moves. PR 2 finishes the job.

**Step 1: Replace the imports + state + effect block**

In `src/pages/Home.jsx`, change the import line currently at line 6:

```js
import { getSchedule, getNews, getStandings } from '../services/api';
```

To:

```js
import { getNews, getStandings } from '../services/api';
import { useSchedule } from '../hooks/queries/useSchedule';
```

**Step 2: Replace the state declarations and effect**

Find this block (currently lines 9-58):

```js
function Home() {
  const [nextGame, setNextGame] = useState(null);
  const [today, setToday] = useState('');
  const [record, setRecord] = useState({ wins: 0, losses: 0, ties: 0 });
  const [npi, setNpi] = useState(null);
  const [news, setNews] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [scheduleResponse, newsResponse, standingsResponse] = await Promise.all([
          getSchedule(),
          getNews(),
          getStandings()
        ]);

        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setToday(todayStr);

        const games = scheduleResponse.data || [];
        const next = games
          .filter(g => g.date >= todayStr)
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
        setNextGame(next);

        let wins = 0, losses = 0, ties = 0;
        games.forEach(game => {
          if (game.result) {
            const r = game.result.toLowerCase();
            if (r.includes('w') || r.match(/\d+-\d+.*w/i)) wins++;
            else if (r.includes('l') || r.match(/\d+-\d+.*l/i)) losses++;
            else if (r.includes('t') || r.includes('otl') || r.includes('sol')) ties++;
          }
        });
        setRecord({ wins, losses, ties });
        setNpi(scheduleResponse.team_record?.npi ?? null);

        setNews(newsResponse.data || []);
        setStandings(standingsResponse.data || []);
      } catch (err) {
        console.error('Home data fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);
```

Replace with:

```js
function Home() {
  const { data: scheduleResponse, isLoading: scheduleLoading } = useSchedule();
  const [news, setNews] = useState([]);
  const [standings, setStandings] = useState([]);
  const [restLoading, setRestLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [newsResponse, standingsResponse] = await Promise.all([
          getNews(),
          getStandings(),
        ]);
        setNews(newsResponse.data || []);
        setStandings(standingsResponse.data || []);
      } catch (err) {
        console.error('Home data fetch error:', err);
      } finally {
        setRestLoading(false);
      }
    }
    fetchData();
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const games = scheduleResponse?.data || [];

  const nextGame = useMemo(() => {
    return games
      .filter(g => g.date >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  }, [games, today]);

  const record = useMemo(() => {
    let wins = 0, losses = 0, ties = 0;
    games.forEach(game => {
      if (game.result) {
        const r = game.result.toLowerCase();
        if (r.includes('w') || r.match(/\d+-\d+.*w/i)) wins++;
        else if (r.includes('l') || r.match(/\d+-\d+.*l/i)) losses++;
        else if (r.includes('t') || r.includes('otl') || r.includes('sol')) ties++;
      }
    });
    return { wins, losses, ties };
  }, [games]);

  const npi = scheduleResponse?.team_record?.npi ?? null;
  const loading = scheduleLoading || restLoading;
```

**Step 3: Add `useMemo` to the React import**

Currently line 2:

```js
import React, { useState, useEffect } from 'react';
```

Change to:

```js
import React, { useState, useEffect, useMemo } from 'react';
```

**Step 4: Smoke run**

```bash
npm test -- --watchAll=false
```

Expected: green.

**Step 5: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "refactor(home): use useSchedule hook for schedule fetch"
```

---

### Task 13: Browser smoke + open PR 1

**Files:** none

**Step 1: Start dev server**

```bash
npm start
```

(Run `node server.js` in a second terminal.)

**Step 2: Manual verification**

- Navigate to `http://localhost:3000/`
- Open DevTools → Network → filter `schedule`
- Reload the page
- **Confirm exactly ONE request to `/api/schedule`** (this is the F2 fix verification)
- Confirm the homepage renders: hero matchup or tagline, record, standings, news, schedule widget
- Open the React Query Devtools panel (floating logo, bottom-right) — confirm `['schedule']` query appears with status `success`

**Step 3: Run E2E**

```bash
npm run test:e2e:chromium
```

Expected: green.

**Step 4: Open PR 1**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(data): adopt TanStack Query (foundation + schedule dedup)" --body "..."
```

PR body should mention:

- Closes audit F2 (duplicate `/api/schedule` fetch on Home)
- Sets up the data layer foundation; remaining 6 hooks ship in follow-up PR
- Verification: 1 schedule request on `/` (was 2)

**STOP HERE.** Wait for PR 1 to merge before starting Task 14.

---

## PR 2 — Remaining Hooks + Page Migrations

After PR 1 merges, branch from main and start Task 14.

### Task 14: Migrate `news` (api + hook + News.jsx + NewsFeed + Home + tests)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useNews.js`
- Modify: `src/pages/News.jsx`
- Modify: `src/components/NewsFeed.jsx`
- Modify: `src/pages/Home.jsx`
- Modify: `src/pages/__tests__/News.test.jsx`
- Modify: `src/components/__tests__/NewsFeed.test.jsx`

**Step 1: Rewrite the `getNews` block in `src/services/__tests__/api.test.js` (TDD red)**

Find the existing `describe('getNews', ...)` (currently lines 22-66) and replace with:

```js
  describe('getNews', () => {
    it('returns news data when API call succeeds', async () => {
      const mockData = {
        data: {
          data: [{ title: 'Test', link: 'http://t.com', source: 'X', date: '2024-01-01' }],
          source: 'api',
          timestamp: '2024-01-01T00:00:00Z'
        }
      };
      axios.get.mockResolvedValue(mockData);

      const result = await getNews();

      expect(result).toEqual(mockData.data);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/news'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getNews()).rejects.toThrow('Network error');
    });

    it('throws when the response shape is invalid', async () => {
      axios.get.mockResolvedValue({ data: { invalid: 'format' } });
      await expect(getNews()).rejects.toThrow(/Invalid data format/i);
    });
  });
```

Run — these "should throw" cases MUST fail:

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

**Step 2: Refactor `getNews` in `src/services/api.js` (TDD green)**

Replace the existing `getNews` (currently lines 12-26) with:

```js
export const getNews = async () => {
  const response = await axios.get(`${API_BASE_URL}/news`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/news');
  }
  return response.data;
};
```

Run — MUST pass:

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

**Step 3: Create the hook**

`src/hooks/queries/useNews.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getNews } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useNews = () =>
  useQuery({
    queryKey: queryKeys.news,
    queryFn: getNews,
  });
```

**Step 4: Refactor `src/pages/News.jsx`**

Replace the imports + the `News` function up to where `filter`/transforms start (currently lines 1-36). Replace this:

```jsx
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { getNews } from '../services/api';
import './News.css';

function News() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        setLoading(true);
        setError(null);
        const responseData = await getNews();

        if (responseData.source === 'error') {
          setError(responseData.error || 'Failed to load news articles.');
          setArticles([]);
        } else if (responseData.data && Array.isArray(responseData.data)) {
          setArticles(responseData.data);
        } else {
          setError('Could not load news articles in the expected format.');
          setArticles([]);
        }
      } catch (err) {
        setError('Failed to load news articles. Please try again later.');
        setArticles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);
```

With:

```jsx
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNews } from '../hooks/queries/useNews';
import './News.css';

function News() {
  const { data, isLoading: loading, isError, error: queryError } = useNews();
  const articles = data?.data && Array.isArray(data.data) ? data.data : [];
  const error = isError ? (queryError?.message || 'Failed to load news articles. Please try again later.') : null;
```

**Step 5: Refactor `src/components/NewsFeed.jsx`**

Read it first to see its existing fetch pattern, then replace the data-loading hooks with `useNews()` following the same pattern as Step 4. The component currently imports `getNews` from `'../services/api'`; replace with `import { useNews } from '../hooks/queries/useNews';` and rewrite `useState`/`useEffect` block to consume `useNews()`. The downstream rendering (mapping over `articles`) is unchanged.

**Step 6: Refactor `Home.jsx` news fetch**

In `src/pages/Home.jsx`, the `Promise.all([getNews(), getStandings()])` block from PR 1 still fetches both. Move news to the hook:

Change imports:

```js
import { getStandings } from '../services/api';
import { useSchedule } from '../hooks/queries/useSchedule';
import { useNews } from '../hooks/queries/useNews';
```

Replace state + effect block:

```js
const { data: scheduleResponse, isLoading: scheduleLoading } = useSchedule();
const { data: newsResponse, isLoading: newsLoading } = useNews();
const [standings, setStandings] = useState([]);
const [standingsLoading, setStandingsLoading] = useState(true);

useEffect(() => {
  getStandings()
    .then(r => setStandings(r.data || []))
    .catch(err => console.error('Home standings fetch error:', err))
    .finally(() => setStandingsLoading(false));
}, []);
```

Replace `const news = newsResponse.data || [];` block already returned from PR 1 — derive `news`:

```js
const news = newsResponse?.data || [];
const loading = scheduleLoading || newsLoading || standingsLoading;
```

(Standings moves to its own hook in Task 15; this two-step migration keeps each task focused.)

**Step 7: Update `News.test.jsx` and `NewsFeed.test.jsx`**

Both files currently use `render(...)` directly with mocked `getNews`. After this task, the components consume `useNews()`, which requires a `QueryClientProvider`. Update both to use the helper.

For `src/pages/__tests__/News.test.jsx`: replace `render(...)` calls with `renderWithQueryClient(...)`. Add the import at the top:

```js
import { renderWithQueryClient } from '../../test-utils/renderWithQueryClient';
```

For `src/components/__tests__/NewsFeed.test.jsx`: same pattern. Wrap the existing `NotificationProvider` wrapper inside `renderWithQueryClient`:

```js
const renderWithProvider = (component) => {
  return renderWithQueryClient(
    <NotificationProvider>{component}</NotificationProvider>
  );
};
```

Also: any test that currently uses `getNews.mockResolvedValue({ source: 'error', ... })` to simulate failure should switch to `getNews.mockRejectedValue(new Error('...'))` to match the new throwing contract. Hunt for these by searching the file for `source: 'error'`.

**Step 8: Run the full unit suite**

```bash
npm test -- --watchAll=false
```

Expected: green.

**Step 9: Commit**

```bash
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useNews.js \
        src/pages/News.jsx src/components/NewsFeed.jsx src/pages/Home.jsx \
        src/pages/__tests__/News.test.jsx src/components/__tests__/NewsFeed.test.jsx
git commit -m "refactor(news): migrate to useNews hook; getNews throws on error"
```

---

### Task 15: Migrate `standings` (api + hook + Home wire-up)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useStandings.js`
- Create: `src/hooks/queries/__tests__/useStandings.test.js`
- Modify: `src/pages/Home.jsx`

**Step 1: Add `getStandings` test cases to `api.test.js` (TDD red)**

The existing file has no `getStandings` tests. Append a new `describe` block:

```js
  describe('getStandings', () => {
    it('returns standings data on success', async () => {
      const mock = { data: [{ team: 'ASU', rank: 1 }] };
      axios.get.mockResolvedValue({ data: mock });

      const result = await getStandings();

      expect(result).toEqual(mock);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/standings'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getStandings()).rejects.toThrow('Network error');
    });
  });
```

Add `getStandings` to the imports at the top of `api.test.js`:

```js
import { getNews, getRoster, getRecruits, getSchedule, getStandings } from '../api';
```

Run — the throwing test MUST fail:

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

**Step 2: Refactor `getStandings` in `api.js` (TDD green)**

Replace lines 94-102 (the current `getStandings`) with:

```js
export const getStandings = async () => {
  const response = await axios.get(`${API_BASE_URL}/standings`);
  return response.data;
};
```

Run — MUST pass:

```bash
npm test -- --watchAll=false --testPathPattern="services/__tests__/api"
```

**Step 3: Create the hook**

`src/hooks/queries/useStandings.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getStandings } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useStandings = () =>
  useQuery({
    queryKey: queryKeys.standings,
    queryFn: getStandings,
  });
```

**Step 4: Add a hook test**

`src/hooks/queries/__tests__/useStandings.test.js`:

```js
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getStandings } from '../../../services/api';
import { useStandings } from '../useStandings';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useStandings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns standings on success', async () => {
    getStandings.mockResolvedValue({ data: [{ team: 'ASU' }] });
    const { result } = renderHook(() => useStandings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.data[0].team).toBe('ASU');
  });

  it('surfaces isError on throw', async () => {
    getStandings.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useStandings(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

Run — MUST pass:

```bash
npm test -- --watchAll=false --testPathPattern="hooks/queries/__tests__/useStandings"
```

**Step 5: Refactor `Home.jsx` standings**

In `src/pages/Home.jsx`, drop the `getStandings` import and the standings effect from Task 14. Final imports:

```js
import { useSchedule } from '../hooks/queries/useSchedule';
import { useNews } from '../hooks/queries/useNews';
import { useStandings } from '../hooks/queries/useStandings';
```

Replace the standings `useState`/`useEffect` block with:

```js
const { data: standingsResponse, isLoading: standingsLoading } = useStandings();
const standings = standingsResponse?.data || [];
```

The remaining `useEffect` is now empty (no side-effects left in Home). Delete it. Delete `useState` import too if no other state remains; leave `useMemo` import.

**Step 6: Smoke**

```bash
npm test -- --watchAll=false
```

**Step 7: Commit**

```bash
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useStandings.js src/hooks/queries/__tests__/useStandings.test.js \
        src/pages/Home.jsx
git commit -m "refactor(standings): migrate to useStandings hook; finish Home migration"
```

---

### Task 16: Migrate `roster` (api + hook + Roster.jsx)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useRoster.js`
- Create: `src/hooks/queries/__tests__/useRoster.test.js`
- Modify: `src/pages/Roster.jsx`

**Step 1: Rewrite `getRoster` test (TDD red)**

Replace the existing `describe('getRoster', ...)` (lines 68-90) with:

```js
  describe('getRoster', () => {
    it('returns roster data on success', async () => {
      const mockRoster = [
        { name: 'Player 1', position: 'F', number: '1' },
      ];
      axios.get.mockResolvedValue({ data: mockRoster });

      const result = await getRoster();

      expect(result).toEqual(mockRoster);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/roster'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getRoster()).rejects.toThrow('Network error');
    });
  });
```

**Step 2: Refactor `getRoster` (TDD green)**

Replace lines 33-41 of `api.js` with:

```js
export const getRoster = async () => {
  const response = await axios.get(`${API_BASE_URL}/roster`);
  return response.data;
};
```

Run tests — MUST pass.

**Step 3: Create hook**

`src/hooks/queries/useRoster.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getRoster } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useRoster = () =>
  useQuery({
    queryKey: queryKeys.roster,
    queryFn: getRoster,
  });
```

**Step 4: Create hook test**

`src/hooks/queries/__tests__/useRoster.test.js`:

```js
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getRoster } from '../../../services/api';
import { useRoster } from '../useRoster';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRoster', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns roster on success', async () => {
    getRoster.mockResolvedValue([{ name: 'X' }]);
    const { result } = renderHook(() => useRoster(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ name: 'X' }]);
  });

  it('surfaces isError on throw', async () => {
    getRoster.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRoster(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

**Step 5: Refactor `Roster.jsx`**

Replace lines 1-41 of `src/pages/Roster.jsx`:

```jsx
import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useRoster } from '../hooks/queries/useRoster';
import './Roster.css';

function Roster() {
  const { data, isLoading: loading, isError } = useRoster();
  const [selectedPosition, setSelectedPosition] = useState('all');

  const players = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(
      player => player &&
        player.name &&
        (player.number && /^#?[0-9]+$/.test(String(player.number).trim()))
    );
  }, [data]);

  const error = isError ? 'Failed to load roster data. Please try again later.' : null;
```

The rest of the file (`isGoalie`, `playersByPosition`, JSX) is unchanged.

**Step 6: Smoke + commit**

```bash
npm test -- --watchAll=false
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useRoster.js src/hooks/queries/__tests__/useRoster.test.js \
        src/pages/Roster.jsx
git commit -m "refactor(roster): migrate to useRoster hook"
```

---

### Task 17: Migrate `recruits` and `transfers` (Recruiting.jsx uses both)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useRecruits.js`
- Create: `src/hooks/queries/useTransfers.js`
- Create: `src/hooks/queries/__tests__/useRecruits.test.js`
- Create: `src/hooks/queries/__tests__/useTransfers.test.js`
- Modify: `src/pages/Recruiting.jsx`

**Step 1: Rewrite `getRecruits` test (TDD red)**

Replace existing `describe('getRecruits', ...)` (lines 92-115) with:

```js
  describe('getRecruits', () => {
    it('returns recruits data on success', async () => {
      const mock = { '2024-2025': [{ name: 'R1', position: 'F' }] };
      axios.get.mockResolvedValue({ data: mock });
      const result = await getRecruits();
      expect(result).toEqual(mock);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/recruits'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getRecruits()).rejects.toThrow('Network error');
    });
  });
```

Append a new `getTransfers` describe (it doesn't exist yet):

```js
  describe('getTransfers', () => {
    it('returns transfer data on success', async () => {
      const mock = { incoming: [], outgoing: [], lastUpdated: '2024-01-01' };
      axios.get.mockResolvedValue({ data: mock });
      const result = await getTransfers();
      expect(result).toEqual(mock);
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getTransfers()).rejects.toThrow('Network error');
    });
  });
```

Add `getTransfers` to the imports at the top of `api.test.js`.

**Step 2: Refactor `api.js` (TDD green)**

Replace `getRecruits` (lines 49-57) and `getTransfers` (lines 64-72) with:

```js
export const getRecruits = async () => {
  const response = await axios.get(`${API_BASE_URL}/recruits`);
  return response.data;
};

export const getTransfers = async () => {
  const response = await axios.get(`${API_BASE_URL}/transfers`);
  return response.data;
};
```

Run tests — MUST pass.

**Step 3: Create both hooks**

`src/hooks/queries/useRecruits.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getRecruits } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useRecruits = () =>
  useQuery({
    queryKey: queryKeys.recruits,
    queryFn: getRecruits,
  });
```

`src/hooks/queries/useTransfers.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getTransfers } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useTransfers = () =>
  useQuery({
    queryKey: queryKeys.transfers,
    queryFn: getTransfers,
  });
```

**Step 4: Create hook tests**

`src/hooks/queries/__tests__/useRecruits.test.js`:

```js
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getRecruits } from '../../../services/api';
import { useRecruits } from '../useRecruits';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRecruits', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns recruits on success', async () => {
    getRecruits.mockResolvedValue({ '2026-2027': [] });
    const { result } = renderHook(() => useRecruits(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('surfaces isError on throw', async () => {
    getRecruits.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRecruits(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

`src/hooks/queries/__tests__/useTransfers.test.js`: same pattern with `useTransfers`/`getTransfers`. Mock value `{ incoming: [], outgoing: [], lastUpdated: null }`.

**Step 5: Refactor `Recruiting.jsx`**

Read the existing file first to find the data-loading block. It currently imports `getRecruits` and `getTransfers` and likely calls both inside one `useEffect`. Replace those with `useRecruits()` and `useTransfers()` hook calls. Combine loading/error states:

```jsx
const { data: recruits, isLoading: recruitsLoading, isError: recruitsError } = useRecruits();
const { data: transfers, isLoading: transfersLoading, isError: transfersError } = useTransfers();
const loading = recruitsLoading || transfersLoading;
const error = (recruitsError || transfersError) ? 'Failed to load recruiting data.' : null;
```

The downstream rendering (grouping, sorting, etc.) is unchanged — it consumes `recruits` and `transfers` shapes that match what the hooks return.

**Step 6: Smoke + commit**

```bash
npm test -- --watchAll=false
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useRecruits.js src/hooks/queries/useTransfers.js \
        src/hooks/queries/__tests__/useRecruits.test.js src/hooks/queries/__tests__/useTransfers.test.js \
        src/pages/Recruiting.jsx
git commit -m "refactor(recruiting): migrate to useRecruits + useTransfers hooks"
```

---

### Task 18: Migrate `alumni` (api + hook + Alumni.jsx)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useAlumni.js`
- Create: `src/hooks/queries/__tests__/useAlumni.test.js`
- Modify: `src/pages/Alumni.jsx`

**Step 1: Add `getAlumni` test (TDD red)**

`api.test.js` doesn't currently test `getAlumni`. Append a new describe and add `getAlumni` to the import statement.

```js
  describe('getAlumni', () => {
    it('returns alumni data on success', async () => {
      const mock = { skaters: [], goalies: [], lastUpdated: '2024-01-01' };
      axios.get.mockResolvedValue({ data: mock });
      const result = await getAlumni();
      expect(result).toEqual(mock);
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getAlumni()).rejects.toThrow('Network error');
    });
  });
```

Run — the throwing test MUST fail.

**Step 2: Refactor `getAlumni` (TDD green)**

Replace `getAlumni` (lines 79-87) in `api.js` with:

```js
export const getAlumni = async () => {
  const response = await axios.get(`${API_BASE_URL}/alumni`);
  return response.data;
};
```

Run — MUST pass.

**Step 3: Create hook**

`src/hooks/queries/useAlumni.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getAlumni } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useAlumni = () =>
  useQuery({
    queryKey: queryKeys.alumni,
    queryFn: getAlumni,
  });
```

**Step 4: Create hook test**

`src/hooks/queries/__tests__/useAlumni.test.js`: same pattern as `useStandings.test.js` with `useAlumni`/`getAlumni`. Mock value `{ skaters: [], goalies: [] }`.

**Step 5: Refactor `Alumni.jsx`**

Read the existing file. It imports `getAlumni` and uses the standard `useState`/`useEffect`/`setLoading` pattern. Replace with:

```jsx
const { data, isLoading: loading, isError } = useAlumni();
const skaters = data?.skaters || [];
const goalies = data?.goalies || [];
const lastUpdated = data?.lastUpdated || null;
const error = isError ? 'Failed to load alumni data.' : null;
```

Drop the `useEffect` and the related state hooks. Replace the import:

```jsx
import { useAlumni } from '../hooks/queries/useAlumni';
```

**Step 6: Smoke + commit**

```bash
npm test -- --watchAll=false
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useAlumni.js src/hooks/queries/__tests__/useAlumni.test.js \
        src/pages/Alumni.jsx
git commit -m "refactor(alumni): migrate to useAlumni hook"
```

---

### Task 19: Add `stats` (new api function + hook + Stats.jsx)

**Files:**

- Modify: `src/services/api.js`
- Modify: `src/services/__tests__/api.test.js`
- Create: `src/hooks/queries/useStats.js`
- Create: `src/hooks/queries/__tests__/useStats.test.js`
- Modify: `src/pages/Stats.jsx`

`Stats.jsx` currently uses raw `fetch('/api/stats')` — there's no `getStats` in `api.js`. This task adds it.

**Step 1: Add `getStats` test to `api.test.js` (TDD red)**

```js
  describe('getStats', () => {
    it('returns stats data on success', async () => {
      const mock = { skaters: [], goalies: [] };
      axios.get.mockResolvedValue({ data: mock });
      const result = await getStats();
      expect(result).toEqual(mock);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/stats'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getStats()).rejects.toThrow('Network error');
    });
  });
```

Add `getStats` to the import line in `api.test.js`.

Run — MUST fail (function doesn't exist).

**Step 2: Add `getStats` to `api.js` (TDD green)**

Append after `getStandings`:

```js
export const getStats = async () => {
  const response = await axios.get(`${API_BASE_URL}/stats`);
  return response.data;
};
```

Run — MUST pass.

**Step 3: Create hook + test**

`src/hooks/queries/useStats.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { getStats } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useStats = () =>
  useQuery({
    queryKey: queryKeys.stats,
    queryFn: getStats,
  });
```

`src/hooks/queries/__tests__/useStats.test.js`: same pattern as `useStandings.test.js`. Mock value `{ skaters: [], goalies: [] }`.

**Step 4: Refactor `Stats.jsx`**

Replace the imports + state + effect block (lines 1-34) with:

```jsx
// src/pages/Stats.jsx
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import SortableTable from '../components/SortableTable';
import { useStats } from '../hooks/queries/useStats';
import './Stats.css';

function Stats() {
  const { data, isLoading: loading, isError } = useStats();
  const stats = {
    skaters: data?.skaters || [],
    goalies: data?.goalies || [],
  };
  const error = isError ? 'Failed to load stats data.' : '';
  const [activeTab, setActiveTab] = useState('skaters');
```

The rest of the file is unchanged.

**Step 5: Smoke + commit**

```bash
npm test -- --watchAll=false
git add src/services/api.js src/services/__tests__/api.test.js \
        src/hooks/queries/useStats.js src/hooks/queries/__tests__/useStats.test.js \
        src/pages/Stats.jsx
git commit -m "feat(stats): add getStats + useStats hook; migrate Stats page"
```

---

### Task 20: Migrate `schedule` page consumer (Schedule.jsx)

**Files:**

- Modify: `src/pages/Schedule.jsx`
- Modify: `src/pages/__tests__/Schedule.test.jsx`

`Schedule.jsx` still uses the old `getSchedule + useState + useEffect` pattern. Now that PR 1 has the `useSchedule` hook, fold this consumer in too.

**Step 1: Refactor `Schedule.jsx`**

Replace lines 1-44:

```jsx
import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSchedule } from '../hooks/queries/useSchedule';
import './Schedule.css';

function Schedule() {
  const { data, isLoading: loading, isError } = useSchedule();

  const games = useMemo(() => {
    if (!data?.data || !Array.isArray(data.data)) return [];
    return [...data.data].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const teamRecord = data?.team_record || null;
  const error = isError ? 'Failed to load schedule data. Please try again later.' : null;
```

The rest of the file (`formatDate`, `formatRecord`, `calculateRecord`, JSX) is unchanged.

**Step 2: Update `Schedule.test.jsx` — wrap renders in `renderWithQueryClient`**

Replace the existing `renderSchedule` helper with:

```jsx
import { renderWithQueryClient } from '../../test-utils/renderWithQueryClient';

const renderSchedule = () => renderWithQueryClient(
  <HelmetProvider>
    <Schedule />
  </HelmetProvider>
);
```

The error-case test from Task 7 already uses `mockRejectedValue`, so it stays correct under the hook. The other tests (`mockResolvedValue` of well-formed data) work unchanged because the hook resolves with that data into `result.current.data`.

**Step 3: Smoke + commit**

```bash
npm test -- --watchAll=false
git add src/pages/Schedule.jsx src/pages/__tests__/Schedule.test.jsx
git commit -m "refactor(schedule): migrate Schedule page to useSchedule hook"
```

---

### Task 21: Final verification + open PR 2

**Files:** none

**Step 1: Confirm zero `useEffect → axios` left in pages**

```bash
grep -rn "from '../services/api'" src/pages src/components
```

Expected: only hook files import from `../../services/api`. No page or non-hook component imports `getX` directly.

```bash
grep -rn "useEffect.*setLoading\|setLoading.*useEffect" src/pages
```

Expected: empty output.

**Step 2: Run the full unit suite**

```bash
npm test -- --watchAll=false
```

Expected: green.

**Step 3: Run E2E**

```bash
npm run test:e2e:chromium
```

Expected: green.

**Step 4: Browser smoke**

Start dev server (`npm start` + `node server.js`). Walk through:

- `/` — hero, record, standings, news, schedule widget all render. Network: 1 schedule, 1 news, 1 standings request.
- `/news` — full news feed renders.
- `/schedule` — game list + team record widget render.
- `/roster` — players grouped by position.
- `/stats` — sortable table with skaters/goalies tabs.
- `/recruiting` — recruits + transfers grouped by year.
- `/alumni` — pro/college tracking lists.

Then navigate `/` → `/schedule` → back to `/`. The schedule data should appear instantly the second time on `/` (cache hit) — no loading spinner. Open Devtools panel: confirm all 8 query keys present (`news`, `schedule`, `roster`, `recruits`, `standings`, `alumni`, `transfers`, `stats`).

**Step 5: Build check**

```bash
npm run build
```

Expected: clean build. Check the build output (`build/static/js/*.js`) — `react-query-devtools` strings should NOT appear in production bundle.

```bash
grep -l "ReactQueryDevtools" build/static/js/*.js || echo "OK: devtools stripped"
```

Expected: `OK: devtools stripped`.

**Step 6: Open PR 2**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(data): TanStack Query — remaining 6 hooks + page migrations" --body "..."
```

PR body should mention:

- Closes audit F1 (no client cache, silent error fallbacks) and F7 (boilerplate across all 7 pages)
- 7 new hooks (news, roster, recruits, standings, alumni, transfers, stats) wired into all consumer pages
- All `useEffect → axios → setLoading` boilerplate removed from `src/pages/`
- Verification: build artifact verified to strip devtools; cache hits visible on route navigation

---

## Done Criteria

- All seven page imports of `getX` from `services/api` are gone; only the hooks import them.
- `npm test` green; `npm run test:e2e:chromium` green; `npm run build` clean.
- Network tab on `/` shows exactly one `/api/schedule` request.
- React Query Devtools visible in dev, absent from production bundle.
