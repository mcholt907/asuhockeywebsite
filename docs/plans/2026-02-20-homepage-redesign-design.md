# Homepage Redesign — Design Doc

**Date:** 2026-02-20
**Scope:** Home page (first phase of full site redesign — other pages follow)

## Problem

The current Home page is a stacked section layout with a static hero image and game-day content only visible when there's a game today. It feels like a standard website rather than a sports property. The goal is a dramatic, broadcast-style redesign that always feels alive regardless of the date.

## Design Decisions

| Question | Decision |
|---|---|
| Scope | Home page first; rest of site follows in subsequent phases |
| Layout | Full viewport split-panel (60/40 CSS Grid) |
| Hero behavior | Always show next upcoming game (not game-day only) |
| Hero photo | Existing `hero-wide-final.png` (swap later without code change) |
| Rollout | Home page ships first; nav/global design system in later phase |

## Layout Architecture

### Zone 1 — Hero Grid (`calc(100vh - 64px)`)

CSS Grid: `grid-template-columns: 60fr 40fr`

**Left Panel:**
- Background: `hero-wide-final.png` + dark overlay gradient
- Content (centered, bottom-anchored):
  - ASU trident logo (small, top-left)
  - Matchup text: "ARIZONA STATE vs." + opponent on second line (large, bold, uppercase, broadcast style)
  - Broadcast buttons: "GAME CENTER" (gold pill) + "NCHC.TV" (outline pill)
  - Venue + time: `5:00 p.m. (MST) · Mullett Arena`
- Data: `nextGame` — first game in schedule where `date >= today`

**Right Panel:**
- Background: `#120608` (near-black maroon)
- Layout: single column, padded, same-page scroll (not independently scrollable)
- Sections top-to-bottom:
  1. Condensed matchup header (opponent, venue, time)
  2. "Trending News" heading + 3 article cards (dark card style)
  3. Featured article with thumbnail + "Read More" link
  4. "Schedule" heading + next 3 games (reuses `UpcomingGames`)
  5. "Team Spotlight" (3 stat cards: Age 22.04, Height 5'11", Weight 181 — hardcoded)

### Zone 2 — Below the Fold

Standard-width content area:
- Horizontal scrolling row of additional news cards (news items 4–8)
- White background, existing card styling

### Mobile (≤768px)

Grid collapses to single column:
- Left panel: `50vh` min-height, photo + matchup text
- Right panel: full-width, auto height, same-page scroll continues

## Data Flow

```
Home.jsx useEffect:
  - getSchedule() → derive nextGame (first game with date >= today)
  - getNews()     → derive featuredArticles (first 5–8 items)

Props/usage:
  - Left panel: nextGame.opponent, nextGame.time, nextGame.location
  - Right panel news cards: featuredArticles[0..2]
  - Right panel featured: featuredArticles[3]
  - Right panel schedule: <UpcomingGames limit={3} />
  - Zone 2 news row: featuredArticles[4..7]
```

## Visual Language

| Element | Style |
|---|---|
| Matchup text | Bold, condensed, uppercase, white. "vs." in gold italic. Very large (clamp 3rem–6rem) |
| Left panel overlay | `linear-gradient(to right, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 100%)` |
| Right panel bg | `#120608` |
| Right panel text | `#e8e0e2` (off-white), section headers in gold |
| News cards (right) | Dark card `#1e0810`, subtle border, gold left-accent on hover |
| Buttons | Gold pill for primary, dark outline for secondary |

## Files Changed

| File | Change |
|---|---|
| `src/pages/Home.jsx` | Full rewrite |
| `src/pages/Home.css` | Full rewrite |
| No new components | `NewsFeed` and `UpcomingGames` reused |

## Out of Scope (This Phase)

- Global nav/header redesign
- Other page redesigns (News, Roster, Stats, Recruiting, Alumni)
- Dynamic Team Spotlight stats from roster API
- Custom hero photo
