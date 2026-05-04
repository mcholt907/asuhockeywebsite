# TanStack Query Adoption — Design

**Date:** 2026-04-30
**Roadmap item:** Phase 2 #8 (audit `2026-04-30-technical-audit.md`)
**Addresses findings:** F1 (no client cache, silent error fallbacks), F2 (duplicate `/api/schedule` on Home), F7 (duplicated `useEffect → axios → setLoading` boilerplate across all 7 pages)

## Context

Every page on the site currently uses the same hand-rolled pattern: a `useState` triple (`data`, `loading`, `error`), a `useEffect` that fires an axios request, and a `try/catch` that quietly returns a fallback (`[]`, `{}`, or `{data: [], source: 'error'}`). Two pages even refetch the same endpoint on the same render (`Home.jsx` and `UpcomingGames.jsx` both hit `/api/schedule`), and navigating between routes always refetches because there's no client-side cache.

The server already implements stale-while-revalidate with cron-warmed caches, so the client can afford generous defaults. The goal is to introduce a real data layer, kill the duplicate fetch, and remove the boilerplate — without changing the user-visible UX or the server contract.

## Decisions

- **Library:** `@tanstack/react-query` + `@tanstack/react-query-devtools`. Same vendor as the existing `@tanstack/react-table`, better devtools than SWR, ready for future mutations.
- **Error handling:** `src/services/api.js` is refactored to **throw** on network/HTTP/format failure instead of returning sentinel fallbacks. TanStack Query routes thrown errors to `isError`/`error`. The `{ source, timestamp }` envelope from `/api/news` and `/api/schedule` stays on **successful** responses — that's a server-side fact about the data, distinct from a client-side fetch error.
- **Defaults (conservative):** `staleTime: 5min`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 1`, `retryDelay: 1000`. Server cron warmups handle freshness.
- **Hook organization:** One file per resource under `src/hooks/queries/`. Each hook is a thin `useQuery` wrapper; transforms stay in pages via `useMemo`.
- **Rollout:** Two PRs. PR 1 lands the foundation + `useSchedule` (kills the F2 duplicate fetch). PR 2 sweeps the remaining six resources.

## Architecture

```text
App.js
└── <QueryClientProvider client={queryClient}>          ← new
    └── <BrowserRouter>
        └── <AppInner />
            └── pages/* → use{Resource}() hooks

src/hooks/queries/
├── queryClient.js     ← singleton QueryClient with project defaults
├── queryKeys.js       ← centralized key factory
├── useNews.js
├── useRoster.js
├── useRecruits.js
├── useSchedule.js
├── useStandings.js
├── useAlumni.js
├── useTransfers.js
└── useStats.js

src/services/api.js    ← refactored to throw on error
src/test-utils/renderWithQueryClient.jsx  ← per-test isolated QueryClient
```

`QueryClientProvider` sits above `BrowserRouter` so the cache survives route changes and tests can wrap individual components without spinning up the router.

## Components

### `src/hooks/queries/queryClient.js`

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

### `src/hooks/queries/queryKeys.js`

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

Flat array keys — no current endpoint takes parameters. If client-side filtering is ever added (e.g., `useRoster({ position: 'F' })`), keys grow to `['roster', { position: 'F' }]`; the centralized file makes that change easy to find.

### Hook pattern (identical for all seven)

```js
// src/hooks/queries/useSchedule.js
import { useQuery } from '@tanstack/react-query';
import { getSchedule } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useSchedule = () =>
  useQuery({
    queryKey: queryKeys.schedule,
    queryFn: getSchedule,
  });
```

No per-hook `select`, no `enabled`, no transforms. Page-specific shaping (e.g., "filter to upcoming, pick first") stays in pages via `useMemo` so hooks remain pure data accessors.

### `src/services/api.js` refactor

Strip the `try/catch` fallback from every function. Bare-array endpoints (roster, recruits, transfers, alumni, standings) just return `response.data`. Envelope endpoints (news, schedule) validate shape and throw on bad shape:

```js
// Before
export const getRoster = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/roster`);
    return response.data;
  } catch (error) {
    console.error('Error fetching roster:', error);
    return [];
  }
};

// After
export const getRoster = async () => {
  const response = await axios.get(`${API_BASE_URL}/roster`);
  return response.data;
};

// Envelope endpoint, after
export const getNews = async () => {
  const response = await axios.get(`${API_BASE_URL}/news`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/news');
  }
  return response.data; // { data, source, timestamp }
};
```

### Page refactor pattern

Standard pattern, applied identically to all seven pages. `Home.jsx` (composes three queries):

```js
const { data: scheduleResponse, isLoading: scheduleLoading } = useSchedule();
const { data: newsResponse,     isLoading: newsLoading }     = useNews();
const { data: standingsResponse, isLoading: standingsLoading } = useStandings();

const loading = scheduleLoading || newsLoading || standingsLoading;

const games = scheduleResponse?.data ?? [];
const news = newsResponse?.data ?? [];
const standings = standingsResponse?.data ?? [];

const today = useMemo(() => { /* ... */ }, []);
const nextGame = useMemo(() => games.filter(g => g.date >= today).sort(...)[0] ?? null, [games, today]);
const record = useMemo(() => computeRecord(games), [games]);
const npi = scheduleResponse?.team_record?.npi ?? null;

if (loading) return <div className="home-loading">Loading...</div>;
```

`UpcomingGames.jsx` swaps its hand-rolled `fetch('/api/schedule')` for `useSchedule()`. Both calls collapse into one network request — TanStack Query dedupes by `queryKey`.

### `DataStatusBanner` integration

The banner is unchanged. Pages feed it from the query state:

```jsx
<DataStatusBanner
  dataSource={isError ? 'error' : data?.source}
  timestamp={data?.timestamp}
  errorMsg={error?.message}
/>
```

A successful response with `source: 'cache'` still surfaces the cache banner — that's a real signal from the server. Network/format failure surfaces the error banner.

## Data Flow

1. Page mounts and calls `useSchedule()`.
2. TanStack checks the cache for key `['schedule']`. If a fresh entry exists, returns it synchronously and renders.
3. If stale or missing, calls `getSchedule()` → axios → `/api/schedule`. Multiple components requesting the same key during the same fetch cycle share one in-flight request.
4. On success, response is cached under `['schedule']` for `gcTime`. Components re-render with `data`, `isLoading: false`.
5. On error, throws from `getSchedule` → TanStack retries once (`retry: 1`, 1s delay) → if it fails again, surfaces `isError: true`, `error`. Component shows error UI via `DataStatusBanner`.
6. After `staleTime` expires, the next consumer mount triggers a background refetch; previous data is served while it runs.

## Error Handling

- **Network / HTTP error:** axios rejects → `getX` throws → TanStack retries once → `isError: true`.
- **Bad envelope shape** (only news + schedule): `getX` throws explicit `Error('Invalid data format from /api/X')` → `isError: true`.
- **Server returns `{source: 'cache'}` successfully:** treated as success; banner shows cache notice via existing `DataStatusBanner` logic.
- **Stale data while refetching:** previous data shown, no flicker. `isFetching` is `true` during background refetch but `isLoading` stays `false`.

## Testing

### New helper

`src/test-utils/renderWithQueryClient.jsx`:

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export const renderWithQueryClient = (ui) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
```

Per-test client prevents cross-test cache pollution. Disabling retry keeps error tests fast and deterministic.

### Updates to existing tests

- `src/services/__tests__/api.test.js` — replace fallback-object assertions with `await expect(...).rejects.toThrow(...)`.
- `src/components/__tests__/NewsFeed.test.jsx`, `src/pages/__tests__/News.test.jsx`, `src/pages/__tests__/Schedule.test.jsx` — wrap in `renderWithQueryClient`, replace synchronous `getByText` with `findByText` to await query resolution.

### New tests (PR 1)

- `src/hooks/queries/__tests__/useSchedule.test.js` — happy path returns data; rejected `getSchedule` surfaces `isError`.
- `src/hooks/queries/__tests__/dedup.test.js` — render two components calling `useSchedule()` under the same provider; assert `axios.get` called exactly once.

### E2E

`tests/api.spec.ts` and the homepage Playwright smoke continue to pass unchanged. The server contract is untouched.

## PR Plan

### PR 1 — "TanStack Query foundation + schedule dedup"

1. `npm install @tanstack/react-query @tanstack/react-query-devtools`
2. Create `src/hooks/queries/queryClient.js`, `queryKeys.js`, `useSchedule.js`
3. Wrap app in `<QueryClientProvider>` in `App.js` (above `BrowserRouter`); mount `<ReactQueryDevtools />` inside a `process.env.NODE_ENV !== 'production'` guard so it tree-shakes out of the prod build
4. Refactor `getSchedule` in `api.js` to throw on error / bad shape
5. Refactor `Home.jsx` to use `useSchedule()` for the schedule query; leave `getNews`/`getStandings` calls on the old pattern temporarily
6. Refactor `UpcomingGames.jsx` to use `useSchedule()` (replaces the inline `fetch`)
7. Add `src/test-utils/renderWithQueryClient.jsx`
8. Update `Schedule.test.jsx`; add `useSchedule.test.js` and `dedup.test.js`

**Verification:**

- Open `/` in dev — Network tab shows exactly **one** `/api/schedule` request (was two)
- `npm test` green
- `npm run test:e2e:chromium` green
- React Query Devtools panel visible in dev only

### PR 2 — "TanStack Query: remaining pages"

1. Refactor remaining six functions in `api.js` to throw; **add new `getStats` to `api.js`** (currently `Stats.jsx` uses raw `fetch('/api/stats')` — folding it into the same data layer is required to fully eliminate F7's boilerplate)
2. Add `useNews.js`, `useRoster.js`, `useRecruits.js`, `useStandings.js`, `useAlumni.js`, `useTransfers.js`, `useStats.js`
3. Convert `Home.jsx` remaining queries
4. Convert `News.jsx`, `Roster.jsx`, `Recruiting.jsx`, `Stats.jsx`, `Alumni.jsx`, `NewsFeed.jsx`
5. Update `api.test.js`, `NewsFeed.test.jsx`, `News.test.jsx`

**Verification:**

- No `useEffect → axios → setLoading` boilerplate remains in any page
- `npm test` green; E2E green
- Navigate `/` → `/schedule` and back: schedule data renders instantly on second visit (cache hit), no loading spinner

## Out of Scope

- Mutations (no admin UI exists yet to write data)
- Optimistic updates
- Cache persistence to `localStorage`
- Item #19 (decompose largest pages) — benefits from this work but is a separate roadmap item
- Server-side response shape changes — the contract stays exactly as it is

## Critical Files

- `src/App.js` — provider wrap
- `src/services/api.js` — error handling refactor
- `src/components/UpcomingGames.jsx` + `src/pages/Home.jsx` — F2 duplicate-fetch fix site
- `src/components/DataStatusBanner.jsx` — consumer of `source`/`timestamp`/`errorMsg` (no changes, but its contract is reaffirmed)
- `src/services/__tests__/api.test.js` — test rewrite for thrown errors

## Verification Plan (Aligned With Audit)

The audit's Phase 2 verification line: *"Network tab on `/` shows one (not two) `/api/schedule` request."* PR 1 satisfies this. PR 2 completes the F7 boilerplate-removal goal.
