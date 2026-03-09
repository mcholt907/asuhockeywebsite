# News Page Hybrid Layout Design

**Date:** 2026-03-03
**Status:** Approved

---

## Problem

The current news page shows all articles in a single long list after the hero card. While clean, the list is visually monotonous and underutilizes the horizontal space on desktop. The home page demonstrates a more engaging card-based pattern that creates visual hierarchy and rhythm.

## Goal

Redesign the article section below the hero card using a **magazine-style hybrid layout**: cards for recent articles (visual, engaging) transitioning to a compact list for older content (efficient, scannable).

---

## Layout Structure

```
[Hero card — article 0, full width, existing]

[Magazine row]
  [Wide card — article 1, ~60% width]  [Two stacked cards — articles 2 & 3, ~40% width]

[Compact 3-column card grid]
  [Card — article 4]  [Card — article 5]  [Card — article 6]

[Older Stories list — articles 7+]
  [date | divider | title | source]  (existing list format)
```

**Total articles in card format:** 6 (articles 1–6, hero is separate)
**List starts at:** article 7

---

## Card Design

Matches home page's `right-news-card` / `news-row-card` pattern:

| Property | Value |
|----------|-------|
| Background | `linear-gradient(to bottom, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)` |
| Border | `border-top: 2px solid rgba(232, 168, 51, 0.5)` |
| Hover border | `border-top-color: var(--asu-gold)` |
| Hover background | `rgba(255, 255, 255, 0.08)` |
| Border radius | `var(--border-radius-sm)` (6px) |
| Source label | Gold uppercase, 0.65rem, `letter-spacing: 0.08em` (matches `.right-news-source`) |
| Title | `rgba(255,255,255,0.88)`, sentence case, no all-caps |
| Date | `rgba(255,255,255,0.45)`, 0.72rem |

### Card Sizing Tiers

- **Wide card** (magazine row left): larger headline `1.1rem`, more padding, taller
- **Stacked cards** (magazine row right): compact, `0.88rem` headline, matches home's compact cards
- **Grid cards** (3-column row): same as stacked cards

---

## Section Transitions

### Magazine Row → Compact Grid
No label needed — the visual shift from asymmetric → symmetric is the cue.

### Compact Grid → List
Label: `OLDER STORIES` — same style as `LATEST HEADLINES` (0.7rem, uppercase, gold, `letter-spacing: 0.14em`). Sits above the list inside the existing `articles-section` dark container.

---

## Responsive Behavior

| Breakpoint | Magazine row | Grid | List |
|------------|-------------|------|------|
| Desktop (>768px) | Wide + 2 stacked | 3 columns | date/divider/title/source |
| Mobile (≤768px) | Single column (stacked vertically) | Single column | title/source only (date hidden) |

---

## Data Flow

No data changes needed. Article array from `/api/news` is sliced in JSX:
- `articles[0]` → hero (existing)
- `articles[1]` → wide card
- `articles[2–3]` → stacked cards
- `articles[4–6]` → grid cards
- `articles[7+]` → list

If fewer than 7 articles exist after filtering, sections gracefully collapse (conditional rendering on each section).

---

## Files to Modify

- `src/pages/News.jsx` — restructure JSX below hero
- `src/pages/News.css` — add magazine row, stacked card, grid card, and section label styles

No backend changes needed.
