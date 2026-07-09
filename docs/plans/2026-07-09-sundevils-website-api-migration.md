# Migrate thesundevils.com scraping from HTML selectors to the website-api JSON endpoints

**Date:** 2026-07-09
**Status:** Implemented

## Problem

News and schedule data from thesundevils.com are scraped with brittle HTML
selectors (`tr.news-table-item`, `div.schedule-event-item` + a desktop/mobile
fallback dance) that break whenever the site's template changes. Worse, the
schedule scraper hits a static URL and **guesses the year** from config — in
the offseason the page flips to next season, so the cache currently holds the
2026-27 schedule with every date shifted back a year and no results.

The legacy Sidearm RSS feed (`rss.aspx?path=mhockey`) is dead (404) — the
site moved to the WMT Digital / Nuxt platform.

## Discovery (2026-07-09)

The Nuxt frontend fetches everything from a public JSON API under
`/website-api/` (no auth, works server-to-server with a browser UA):

- **Articles:** `GET /website-api/articles?filter[sports.id]=7&sort=-published_at&per_page=25`
  → `{ data: [{ title, permalink, published_at, ... }] }` (1000+ articles)
- **Schedules (season mapping):** `GET /website-api/schedules?filter[sport.id]=7&include=season&per_page=50`
  → hockey schedules with `season.slug` (`"2025-26"` → schedule id 223)
- **Schedule events:** `GET /website-api/schedule-events?filter[schedule_id]=<id>&include=opponent,scheduleEventResult,scheduleEventLinks,tournament&per_page=100&sort=datetime`
  → per game: `datetime` (UTC ISO), `opponent_name`, `venue`, `location`,
  `venue_type` (home/away), `is_exhibition`, `is_conference`, `tba`,
  `schedule_event_result` (`result: win|loss|tie`, `winning_score`,
  `losing_score`), `schedule_event_links` (`{title, link}`), `box_score_url`

Sport id 7 = ice hockey. Ice hockey sport view also server-renders a team
record (`schedule-event-<id>-statistics` in `__NUXT_DATA__`) — possible
future replacement for the USCHO record scrape, not in scope here.

## Design

Same external shape — `/api/news` and `/api/schedule` consumers see no change:

- `scrapeSunDevilsNewsList()` maps articles to
  `{ title, link: permalink, date: "June 01, 2026", source: "TheSunDevils.com" }`
  (display-date format matches the old scrape; News.jsx renders `date` raw,
  and the news sort does `new Date(date)`, which parses this format).
- `scrapeSunDevilsSchedule(year)` resolves `year` → season slug
  (`2025` → `"2025-26"`) → schedule id via the schedules endpoint, then maps
  events to the existing game shape. All dates/times are converted from UTC
  to America/Phoenix. `result` keeps the exact `"W 4-1"` format
  (Schedule.jsx does `charAt(0)` / `slice(2)`); ASU score first on losses.
  `location` becomes `"<venue>, <city>"`. If no schedule exists for the
  requested season the function throws (SWR then serves stale cache) instead
  of silently scraping the wrong season.
- CHN box-link enrichment and USCHO team record are unchanged.
- Config: `sunDevilsNews`/`sunDevilsRSS`/`sunDevilsSchedule` URLs replaced by
  `sunDevilsArticles`/`sunDevilsSchedules`/`sunDevilsScheduleEvents`.

## Testing

`__tests__/sundevils-api.test.js` with trimmed real API responses in
`__tests__/fixtures/` (win/loss/tie/upcoming events incl. `"time_tba"` and
cross-midnight UTC→Phoenix dates). Follows the `requestWithRetry` mock
pattern from `scraper-caching.test.js` — selector drift now fails in CI
against fixtures instead of surfacing as silent empty scrapes.
