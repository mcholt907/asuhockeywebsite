# Elite Prospects Team Rosters Design

## Goal

Make the Recruiting page's future-season tabs match Elite Prospects' projected Arizona State rosters exactly. A season tab represents the team roster that Elite Prospects publishes for that season, not the recruits whose arrival class is that season.

## Product Semantics

- Elite Prospects is authoritative for membership in every displayed future-season roster.
- The same player may appear in multiple season rosters.
- A player removed from a future Elite Prospects roster must disappear from the corresponding site roster after the next successful refresh.
- No cumulative roll-forward or local inference may add a player whom Elite Prospects does not list for that season.
- Tabs use the label `<season> Team`, replacing `<season> Class`.
- The earliest configured future season is selected initially, matching the page's current focus on the nearest upcoming team.
- The section remains part of the Recruiting page and retains the existing position filters and position-grouped card layout.

## Source and Deployment Architecture

Elite Prospects blocks cloud-hosted traffic, including Render, so production must not scrape it during a request. The existing local-data pattern used for alumni and transfers will be extended to recruiting:

1. `server/scrapers/recruiting.js` scrapes each season in `config.FUTURE_SEASONS` from the Elite Prospects Arizona State season-roster page.
2. A local `scripts/refresh-recruiting.js` command enables the Puppeteer request fallback, performs a live scrape from a residential IP, validates the complete result, and writes `data/asu_recruiting_fallback.json` only after all configured seasons pass validation.
3. In production and during prerendering, the recruiting data service returns the bundled fallback without attempting a live request.
4. In local development, the scraper can refresh its cache normally; an explicit live-refresh flag bypasses fallback-only behavior for the refresh command.
5. `/api/recruits` returns this season-roster dataset instead of `asu_hockey_data.json.recruiting`.
6. The weekly Windows refresh workflow runs recruiting with alumni and transfers, stages the recruiting fallback when changed, and includes it in the automated pull request.

This keeps the public API response shape as `Record<string, Recruit[]>`, so the frontend query and TypeScript contract do not require a transport change.

## Scraper and Fallback Behavior

The existing structural Elite Prospects table parser remains responsible for player extraction. It must preserve season boundaries and must only deduplicate a player within one season, never across seasons.

The fallback loader will:

- Read `data/asu_recruiting_fallback.json` with mtime-based memoization.
- Accept only an object containing every configured future-season key.
- Require each season value to be an array; an individual far-future season may legitimately be empty when Elite Prospects lists no players yet.
- Require every player to have a non-empty `name` and `player_link`.
- Require at least one player across the complete snapshot so a selector failure that empties every season cannot replace valid data.
- Return the last valid bundled snapshot when live scraping fails.
- Return an empty object only when neither live, cached, nor bundled data is available.

The refresh command validates the entire candidate in memory before writing. If any configured season is missing or malformed, every season is empty, or a player lacks required identity fields, the command exits nonzero and leaves the prior fallback untouched. This all-or-nothing rule prevents a selector change or partial request failure from deleting future rosters while still representing a legitimately empty far-future Elite Prospects season exactly.

The bundled object includes `lastUpdated` metadata only if the API type is deliberately expanded. To preserve the current response shape and minimize scope, this change will not add metadata to the top-level response.

## Static Curated Data

`asu_hockey_data.json.recruiting` will no longer drive `/api/recruits`. It remains temporarily available because `server/services/roster-service.js` uses recruiting entries as curated player-profile fallbacks for current roster enrichment.

This change will not delete or rewrite the curated recruiting entries. Separating that cleanup avoids coupling the projected-roster migration to current-roster photo and bio behavior.

## API and Frontend Changes

`server/routes/api.js` will call the recruiting data function asynchronously and return its result. A scrape or fallback failure will produce a server error instead of silently presenting hand-maintained class data as an Elite Prospects roster.

`src/pages/Recruiting.jsx` will continue to:

- Build tabs from the season keys returned by `/api/recruits`.
- Select the earliest season initially.
- Filter and group the selected season by position.
- Sort players within position groups by last name.

Only the visible tab wording and comments/documentation that describe the data as recruiting classes will change. Existing card details and Elite Prospects profile links remain unchanged.

## Refresh Workflow

The following command surface will be added or updated:

- `npm run refresh-recruiting` runs the validated recruiting refresh.
- `npm run refresh-data` runs alumni, transfers, and recruiting sequentially and fails if any refresh fails.
- `scripts/refresh-and-push.cmd` detects, stages, commits, and describes changes to all three fallback files.

The existing scheduled task, Sentry dead-man's-switch, protected-main workflow, and auto-merge behavior remain unchanged.

## Testing Strategy

Server tests will prove:

- Season rosters are kept separate.
- A player can appear in two seasons without cross-season deduplication.
- The fallback loader accepts a complete valid snapshot.
- Missing seasons, an all-empty snapshot, and malformed players are rejected; an empty individual far-future season is accepted.
- Production/prerender mode serves the bundled fallback without network access.
- The explicit refresh flag permits a live scrape.
- `/api/recruits` returns the scraper/service result rather than curated class data.
- Refresh validation refuses to replace a valid fallback with partial data.

Frontend tests will prove:

- Tabs say `Team`, not `Class`.
- The earliest future season remains the default.
- Selecting another season displays exactly that season's roster.
- A player present in multiple seasons appears in both tabs.

The focused server and frontend suites will run first, followed by the complete server test suite, React test suite, and production build.

## Error Handling and Observability

- Live scrape failures use the last-known-good cache or fallback through the shared cached-scraper pipeline.
- Invalid live results do not replace cached or bundled data.
- Refresh failures exit nonzero so the scheduled task reports an error to the existing Sentry Cron Monitor.
- Recruiting remains represented in `/api/status`; its source semantics will change from hand-maintained static JSON to the bundled Elite Prospects fallback. Status reporting should identify it as fallback-backed and use the fallback file timestamp for freshness.

## Out of Scope

- Predicting roster membership independently of Elite Prospects.
- Combining recruiting classes to infer future teams.
- Adding current NCAA roster players that Elite Prospects omits.
- Redesigning recruit cards or page layout.
- Removing `asu_hockey_data.json.recruiting` or changing current-roster enrichment.
- Live production scraping from Render.

## Acceptance Criteria

- The 2027-2028 tab contains the same players as the Elite Prospects 2027-2028 Arizona State roster snapshot used by the latest successful refresh.
- Players can appear in multiple season tabs when Elite Prospects lists them in multiple seasons.
- Tabs are labeled as teams rather than classes.
- Production makes no Elite Prospects network request for recruiting data.
- A partial or empty scrape cannot overwrite the last valid bundled snapshot.
- The weekly automated refresh includes recruiting data and opens the existing auto-merging data-refresh pull request when the roster snapshot changes.
