# Async hot-path audit

Goal: remove waits between independent I/O while preserving response shapes,
cache coalescing, fallback handling, and upstream rate limits.

Scope: all production async call sites in `server/`, `src/`, root scripts and
`scripts/`. Runtime request paths take priority over maintenance/build tools.

## Findings and implementation

- News: fetch Sun Devils and CHN concurrently; they use different hosts. Remove
  the cross-host delay. Keep per-source recovery, deduplication and sorting.
- Schedule: fetch the Sun Devils schedule, CHN links/rankings and USCHO record
  concurrently, then enrich the games. Resolving a schedule ID before fetching
  its events remains sequential. Optional sources retain their local recovery.
  Empty schedules keep the same response, though optional fetches now start
  speculatively alongside the schedule.
  Wait for every source to settle before propagating a required-source failure,
  keeping the cache's in-flight guard active while optional requests finish.
- Alumni API: start alumni and recruiting reads together. Handle recruiting
  rejection immediately so it remains an optional filter; alumni failure still
  produces a 500 without waiting for a pending filter.

## Verification

- [x] Add deterministic deferred-I/O tests proving independent work starts while
      the other source is pending; run against old code to confirm failure.
- [x] Apply the three changes and verify success, empty/partial results, cache
      hits, and failure behavior with the targeted tests.
- [x] Run server/frontend suites, typecheck and production build (288 server
  tests, 57 frontend tests; all eight routes prerendered).
- [ ] Review scraper reliability and full diff, commit only task files, push,
      open PR and enable auto-merge after CI.

## Deliberately preserved ordering

- Recruiting season/profile requests share a rate-limited EliteProspects host.
- Alumni pagination discovers each next URL from the preceding response.
- Stats fallback is conditional on an empty current-season result.
- Retry backoff, browser navigation/content/cleanup and cache validation/write
  depend on preceding operations.
- Prerender writes the home route last because it overwrites the shared SPA
  fallback template. Maintenance refresh scripts can share the upstream host.
- Scheduler datasets and alumni skater/goalie streams already use Promise.all.
- React Query hooks start requests independently, without dependent enable gates.

## Review and tradeoffs

Independent review reproduced a cold-cache failure where a fail-fast schedule
aggregate released coalescing before its optional requests finished. A new test
failed against that implementation and passes with all-settled aggregation.
This intentionally waits for optional requests on schedule failure/empty results
to retain one refresh per scraper. Alumni can fail fast because its two inputs
have their own independent scraper-level coalescing.

News no longer incurs the configured 1-second cross-host delay. Successful
uncached aggregates now wait for the slowest source rather than the sum of their
durations. Actual wall-clock gains depend on upstream/cache behavior.

Pre-existing, outside async-order scope: schedule links depend on global `tr`
selection, exact Box/Metrics labels and date-bearing URLs. A future reliability
change can validate the schedule table and warn about missing completed-game
links; this change does not alter selectors.
