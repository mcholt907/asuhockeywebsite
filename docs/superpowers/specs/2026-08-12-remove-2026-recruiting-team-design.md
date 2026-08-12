# Remove the 2026-27 Projected Recruiting Team

## Goal

The Recruiting page's **Projected Future Teams** section must contain only team years that are still being projected. Because Arizona State's 2026-27 roster is set, the section must not expose a 2026-27 tab or any 2026-27 players.

## Design

Treat 2026-27 as outside the recruiting snapshot contract instead of filtering it only in React. Change the configured future seasons to `2027-2028` and `2028-2029`. The scraper, refresh command, bundled fallback, API validation, and UI will therefore share the same two-season definition.

The Recruiting page will continue deriving its tabs from the API keys. With 2026-27 removed at the source, 2027-28 becomes the earliest configured season and remains the default selected tab under the existing selection behavior. The transfer portal section is unchanged.

## Data and Refresh Behavior

- Remove the `2026-2027` key and its players from `data/asu_recruiting_fallback.json`.
- Future refreshes request and write only `2027-2028` and `2028-2029`.
- Snapshot and API validation continue requiring an exact match to configured season keys, preventing an obsolete 2026-27 key from being served accidentally.
- Production remains fallback-only; no production scraping behavior changes.

## Testing

- Update refresh, snapshot, route, status, and API end-to-end fixtures to the two-season contract.
- Add or update the Recruiting page regression to assert that `2026-2027 Team` and its players are absent while `2027-2028 Team` is selected and displayed by default.
- Run focused tests first with a red-green cycle, then the full server and React suites, type-checking, build, and Chromium API/UI verification.

## Non-goals

- Do not change the current roster page or `CURRENT_SEASON`.
- Do not change recruiting card styling or layout.
- Do not change transfer portal data.
