# Design: Schedule Page Box & Metrics Links

**Date:** 2026-02-24

## Overview

Add CHN "Box" and "Metrics" links to completed games on the Schedule page. The scraper fetches the CHN schedule page, copies the Box and Metrics hrefs for each completed game, and the frontend renders them as small links opening in a new tab.

## Backend

### New function: `scrapeCHNScheduleLinks()` in `scraper.js`
- Fetches `https://www.collegehockeynews.com/schedules/team/Arizona-State/61`
- Parses each game row for Box and Metrics `href` attributes
- Box links follow the pattern `/box/final/YYYYMMDD/away/home/` — date is extracted from the URL to use as the match key
- Metrics links follow `/box/metrics.php?gd=[game-id]`
- Both relative URLs are prefixed with `https://www.collegehockeynews.com`
- Returns a map keyed by date string (`YYYY-MM-DD`): `{ [date]: { box_link, metrics_link } }`

### Merge in `fetchScheduleData()`
- After scraping TheSunDevils schedule, call `scrapeCHNScheduleLinks()`
- For each game, if the date matches an entry in the CHN map, attach `box_link` and `metrics_link` to the game object
- If CHN scrape fails, log the error and continue — schedule data is unaffected

## Frontend

### `Schedule.jsx`
- When `game.box_link` or `game.metrics_link` is present, render them as small anchor tags with `target="_blank" rel="noopener noreferrer"`
- Only render for games with a `result` (completed games)

### `Schedule.css`
- Style as small pill/badge links in the ASU gold color to match the page aesthetic

## Data Flow

```
GET /api/schedule
  → scrapeSunDevilsSchedule()       [TheSunDevils.com]
  → scrapeCHNScheduleLinks()        [CollegeHockeyNews.com]
  → merge by date
  → cache result
  → return to frontend

Frontend renders:
  game.box_link     → <a href="..." target="_blank">Box</a>
  game.metrics_link → <a href="..." target="_blank">Metrics</a>
```

## Error Handling

- CHN scrape failure is non-fatal: games simply won't have Box/Metrics links
- Logged with `[CHN Schedule Links]` prefix

## Out of Scope

- "Compare" links for upcoming games
- Any changes to cache duration or schedule refresh logic
