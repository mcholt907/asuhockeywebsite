---
name: add-article
description: Add a news article to the news feed (manual_news in asu_hockey_data.json). Usage: /add-article <url> "Title" [Source] [Mon DD, YYYY]
---

You are helping add a hand-written news entry to the ASU Hockey website's news feed.

Manual news entries live in the `manual_news` array in `asu_hockey_data.json`. The
server merges them with scraped articles and re-sorts everything by `date` at request
time (`server.js`), so the position of the entry in the array does NOT matter — add it
at the top for readability, but don't worry about ordering relative to existing dates.

Each entry has this exact schema (all four fields are required strings):

```json
{
  "title": "Article headline",
  "link": "https://full-url-to-article",
  "date": "Mon DD, YYYY",
  "source": "Publication Name"
}
```

Field notes:
- `date` format is a full month name, day, year — e.g. `"June 22, 2026"`. Match this exactly.
- `link` is the field name (NOT `url`).
- `source` is the publication, e.g. `"The Hockey News"`, `"State Press"`, `"Devils in Detail"`.

---

## Steps

1. **Parse the input.** The user provides at minimum a URL and a title. They may also
   pass the source and/or date. Treat anything in `YYYY` / `Mon DD, YYYY` shape as the date
   and the remaining quoted string as the source.

2. **Fill in missing `source` or `date`:**
   - Try `WebFetch` on the URL to read the byline/publish date and publication name.
   - If the fetch is blocked (many sports sites — e.g. thehockeynews.com — return HTTP 403
     to automated requests), fall back to `WebSearch` for the title to find the publish date
     and source.
   - If you still can't determine the `date` confidently, ask the user for it rather than
     guessing. Derive `source` from the URL's domain if needed (e.g. thehockeynews.com →
     "The Hockey News") and note the assumption.

3. **Read `asu_hockey_data.json`**, then insert the new entry as the **first** item in the
   `manual_news` array. The entry that was previously first gets a comma added after its `}`;
   the new entry's `}` is followed by a comma (since it's no longer last).

4. **Validate** the JSON is still parseable:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('asu_hockey_data.json','utf8')); console.log('JSON valid');"
   ```
   If validation fails, show the error and fix it before continuing.

5. **Report** the added entry (title, source, date, link). If you had to infer the date or
   source, say so and ask the user to sanity-check it against the byline.

---

## Optional: commit / PR

Only do this if the user asked you to commit, push, or open a PR (the bare
`/add-article` invocation just edits the file). When they do:

- Commit on the session's feature branch with a clear message, then push with
  `git push -u origin <branch>`.
- If they want a PR, open it against `main`. If they want it merged automatically,
  enable auto-merge (squash) — it merges once CI passes. Do NOT open a PR unless asked.
