# Manual News Stories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow ad hoc news stories from any source to be added to the News page by editing a JSON array.

**Architecture:** Add a `manual_news` array to `asu_hockey_data.json`. The `/api/news` endpoint reads this array at request time using `fs.readFileSync` (same pattern as `/api/recruits`) and prepends those entries to the scraped articles. No frontend changes required — manual entries share the same shape as scraped articles.

**Tech Stack:** Node.js, Express, `fs` (already imported in server.js)

---

### Task 1: Add `manual_news` array to `asu_hockey_data.json`

**Files:**
- Modify: `asu_hockey_data.json`

**Step 1: Add the empty array**

Open `asu_hockey_data.json`. After the `"recruiting"` key, add:

```json
"manual_news": []
```

The top-level structure should now be:
```json
{
  "last_updated": "...",
  "roster": [...],
  "recruiting": {...},
  "manual_news": []
}
```

**Step 2: Verify JSON is valid**

```bash
node -e "require('./asu_hockey_data.json'); console.log('valid')"
```
Expected output: `valid`

**Step 3: Commit**

```bash
git add asu_hockey_data.json
git commit -m "feat(news): add manual_news array to asu_hockey_data.json"
```

---

### Task 2: Update `/api/news` to prepend manual entries

**Files:**
- Modify: `server.js` lines 98–120

**Step 1: Update the `/api/news` handler**

Replace the existing handler:

```js
// API endpoint for news
app.get('/api/news', async (req, res) => {
  try {
    const articlesArray = await fetchNewsData();

    // Read manual news entries from static JSON (same pattern as /api/recruits)
    let manualNews = [];
    try {
      const raw = fs.readFileSync(path.join(__dirname, 'asu_hockey_data.json'), 'utf8');
      manualNews = JSON.parse(raw).manual_news || [];
    } catch (e) {
      console.error('[API /news] Failed to read manual_news:', e.message);
    }

    const combined = [...manualNews, ...articlesArray];

    if (combined.length > 0) {
      res.json({
        data: combined,
        source: 'api',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('/api/news: No news data returned from fetchNewsData or an error occurred internally in scraper.');
      res.status(500).json({ error: 'Failed to fetch news data or no news available.' });
    }
  } catch (error) {
    console.error('Error in /api/news endpoint:', error);
    res.status(500).json({ error: 'Internal server error while fetching news.' });
  }
});
```

Note: `fs` and `path` are already imported in `server.js` — no new imports needed.

**Step 2: Verify the server starts cleanly**

```bash
node server.js
```
Expected: Server starts, no errors. Hit Ctrl+C after confirming.

**Step 3: Test with an empty manual_news array**

With the server running, in a second terminal:
```bash
curl http://localhost:5000/api/news | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const p=JSON.parse(d); console.log('count:', p.data.length, 'source:', p.source)"
```
Expected: count matches however many scraped articles come back, source: api

**Step 4: Test with a manual entry**

Add a test entry to `asu_hockey_data.json`:
```json
"manual_news": [
  {
    "title": "TEST ENTRY — DELETE ME",
    "link": "https://example.com",
    "date": "February 27, 2026",
    "source": "test"
  }
]
```

Hit the endpoint again (no restart needed):
```bash
curl http://localhost:5000/api/news | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const p=JSON.parse(d); console.log('first title:', p.data[0].title)"
```
Expected: `first title: TEST ENTRY — DELETE ME`

**Step 5: Remove the test entry**

Set `manual_news` back to `[]` in `asu_hockey_data.json`.

**Step 6: Commit**

```bash
git add server.js asu_hockey_data.json
git commit -m "feat(news): prepend manual_news entries in /api/news endpoint"
```

---

## Usage After Implementation

To add a story, provide these four fields:
- **title** — headline text
- **link** — full URL
- **date** — e.g. `"February 27, 2026"`
- **source** — e.g. `"ESPN"`, `"thesundevils.com"`, `"Arizona Republic"`

Claude adds the entry to `manual_news` in `asu_hockey_data.json`. It appears at the top of the News page immediately, no restart needed.

To remove a story, ask Claude to delete the entry from `manual_news`.
