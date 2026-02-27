# Manual News Stories — Design

**Date:** 2026-02-27

## Problem

The News page only shows articles scraped from thesundevils.com and collegehockeynews.com. There is no way to surface stories from other sources without adding a new scraper.

## Solution

Add a `manual_news` array to `asu_hockey_data.json` (the existing hand-maintained source of truth). The `/api/news` endpoint reads this array and prepends those entries to the scraped articles before returning.

## Data Shape

Each manual entry in `asu_hockey_data.json`:

```json
"manual_news": [
  {
    "title": "Story headline here",
    "link": "https://example.com/story",
    "date": "February 27, 2026",
    "source": "thesundevils.com"
  }
]
```

Fields match the shape already produced by the scraper, so no frontend changes are needed.

## Architecture

- **`asu_hockey_data.json`** — gains a `manual_news` array (hand-maintained)
- **`server.js` `/api/news`** — reads `manual_news` from the JSON file at request time, prepends to scraped articles
- **Frontend** — no changes; manual stories render identically to scraped ones

## Workflow

To add a story, provide four fields to Claude:
1. Title
2. Link (URL)
3. Date (e.g. "February 27, 2026")
4. Source (e.g. "thesundevils.com", "ESPN", etc.)

Claude adds the entry to `asu_hockey_data.json`. Changes are live immediately — no restart or redeploy required, since the server reads the file at request time.

## Ordering

Manual entries are prepended to scraped articles, so they always appear first (most prominent). Within `manual_news`, entries are displayed in array order — newest first by convention.
