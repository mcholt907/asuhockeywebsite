# Preserve NCHC Standings Through the Offseason

## Goal

The Home page must continue showing the most recent played-season NCHC standings after the configured season rolls forward. It must switch to the new season only after at least one NCHC member has completed a game. A blank or unavailable USCHO table must not remove the standings widget.

## Source Selection

USCHO remains the live standings source. The server will pair it with a committed snapshot containing the latest valid played-season table and its season label.

A live table is eligible to replace the snapshot only when all of the following are true:

- the NCHC dataset exists and contains the expected team fields;
- every returned overall record has a parseable wins-losses-ties shape; and
- at least one team's overall wins, losses, and ties sum to more than zero.

This makes the first completed game by any NCHC member the season boundary. A published preseason table in which every team is `0-0-0` still resolves to the prior-season snapshot. An eligible live table is tagged with `config.CURRENT_SEASON`; the bundled snapshot retains its own explicit season.

## Data Model and API

Add `data/nchc_standings_fallback.json` with this shape:

```json
{
  "season": "2025-2026",
  "lastUpdated": "2026-04-12T03:00:00.000Z",
  "teams": [
    {
      "rank": "1",
      "team": "Team name",
      "pts": "62",
      "confRecord": "20-4-0",
      "overallRecord": "30-6-0",
      "isASU": false
    }
  ]
}
```

Standings cache entries will carry the same season and teams metadata. The cache key will be scoped to `CURRENT_SEASON` so a cache created before a season roll cannot be mistaken for current-season data.

`GET /api/standings` will preserve the existing `data` array for frontend compatibility and add top-level metadata:

```json
{
  "data": [],
  "season": "2025-2026",
  "isPriorSeason": true,
  "timestamp": "2026-08-12T18:00:00.000Z"
}
```

`isPriorSeason` is derived by comparing the selected snapshot's season with `CURRENT_SEASON`; it is not trusted from the file.

## Runtime Data Flow

1. Read a fresh cache entry for the configured season when available.
2. Otherwise request and parse the current USCHO NCHC table.
3. If the live table is valid and at least one game has been completed, tag it with `CURRENT_SEASON`, cache it, and return it.
4. If the live table is absent, malformed, all zeroes, or the request fails, recover first from a valid stale cache for the configured season and then from the bundled snapshot.
5. If no valid cache or bundled snapshot exists, propagate the failure so `/api/standings` returns its controlled 500 response and the missing dataset remains visible in `/api/status`.

The Home page will continue rendering the table from `response.data`. Its heading will include the returned season in compact form, for example `2025-26 NCHC Standings`, so offseason data cannot be mistaken for the new season.

## Snapshot Refresh

Add a standings refresh command to the existing weekly local refresh workflow. It will bypass the cache, fetch USCHO, and overwrite `data/nchc_standings_fallback.json` only when the live result passes the played-season predicate. The write will use a same-directory temporary file and atomic rename, matching the repository's protected fallback refresh pattern. The command will reject production and prerender execution before performing network or filesystem work.

An empty, all-zero, malformed, or failed scrape will exit nonzero without changing the prior snapshot. The scheduled refresh script will stage the standings fallback alongside the other tracked fallback files and use wording that covers all refreshed datasets.

`/api/status` will list the standings fallback file. When the runtime cache is unavailable, the status endpoint can therefore report `source: "fallback"` instead of `source: "none"`.

## Error Handling

- A blank preseason table is expected offseason state and selects the bundled snapshot without caching the blank result.
- A malformed live table is treated as source drift and must not overwrite either cache or bundled data.
- A failed refresh preserves the existing snapshot byte-for-byte and removes any temporary file.
- A malformed or missing bundled snapshot is not silently converted to an empty table; with no usable cache, the request fails visibly and retains the existing alert behavior.

## Testing

- Parser and scraper tests will cover a missing NCHC dataset, malformed records, an all-`0-0-0` preseason table, and a table after the first completed game.
- Cache tests will verify current-season key scoping, stale-current recovery, fallback recovery after a cold deploy, and rejection of malformed fallback data.
- Route tests will verify the compatible `data` array plus `season` and `isPriorSeason` metadata.
- Refresh tests will use a red-green cycle to verify atomic writes, refusal to replace the snapshot with all-zero or malformed data, cleanup after write failures, and rejection of production or prerender execution before network and filesystem work.
- Home page tests will verify that prior-season standings remain rendered with the prior-season label and that current-season data replaces them after the first game.
- Final verification will include the full server and React suites, type-checking, production build, API verification from an isolated server, and Chromium verification of the Home page standings widget.

## Non-goals

- Do not change the schedule season boundary or `CURRENT_SEASON`.
- Do not introduce a calendar cutoff; actual played-game data is the switch.
- Do not redesign the standings table or Home page layout.
- Do not scrape an additional standings provider.
