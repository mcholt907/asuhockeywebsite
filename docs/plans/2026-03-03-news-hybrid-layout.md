# News Page Hybrid Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single article list below the hero with a magazine-style hybrid: asymmetric card row → 3-column compact grid → list for older articles.

**Architecture:** All changes are pure CSS/JSX. Article array from `/api/news` is re-sliced in the component. No new components, no data changes, no backend changes.

**Tech Stack:** React (JSX), CSS (no preprocessor), existing CSS variables from App.css

---

### Task 1: Re-slice articles in News.jsx

**Files:**
- Modify: `src/pages/News.jsx:50-51`

Current (lines 50–51):
```jsx
const heroArticle = filteredArticles[0];
const remainingArticles = filteredArticles.slice(1);
```

**Step 1: Replace the slice variables**

Replace lines 50–51 with:
```jsx
const heroArticle    = filteredArticles[0];
const wideCard       = filteredArticles[1];
const stackedCards   = filteredArticles.slice(2, 4);
const gridCards      = filteredArticles.slice(4, 7);
const listArticles   = filteredArticles.slice(7);
```

**Step 2: Verify no syntax errors**

Run: `npm run build 2>&1 | head -30`
Expected: no compilation errors (warnings OK)

---

### Task 2: Replace articles-section JSX with hybrid layout

**Files:**
- Modify: `src/pages/News.jsx:131-150`

Current block (lines 131–150) — replace entirely:
```jsx
{/* Latest Headlines */}
{remainingArticles.length > 0 && (
  <section className="articles-section fade-in-delay-1">
    <div className="headlines-header">
      <h2 className="headlines-title">Latest Headlines</h2>
    </div>
    <div className="articles-feed">
      {remainingArticles.map((article, idx) => (
        <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="feed-item">
          <span className="feed-date">{article.date}</span>
          <span className="feed-divider" aria-hidden="true" />
          <span className="feed-title">{article.title}</span>
          {getSourceType(article.source) !== 'Other' && (
            <span className="feed-source">{getSourceType(article.source)}</span>
          )}
        </a>
      ))}
    </div>
  </section>
)}
```

Replace with:
```jsx
{/* Magazine Row — wide card + 2 stacked cards */}
{wideCard && (
  <section className="articles-section fade-in-delay-1">

    {/* Asymmetric magazine row */}
    <div className="magazine-row">
      <a href={wideCard.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-wide">
        {getSourceType(wideCard.source) !== 'Other' && (
          <span className="news-card-source">{getSourceType(wideCard.source)}</span>
        )}
        <h3 className="news-card-title news-card-title-wide">{wideCard.title}</h3>
        <span className="news-card-date">{wideCard.date}</span>
      </a>
      {stackedCards.length > 0 && (
        <div className="stacked-cards">
          {stackedCards.map((article, idx) => (
            <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-compact">
              {getSourceType(article.source) !== 'Other' && (
                <span className="news-card-source">{getSourceType(article.source)}</span>
              )}
              <h3 className="news-card-title">{article.title}</h3>
              <span className="news-card-date">{article.date}</span>
            </a>
          ))}
        </div>
      )}
    </div>

    {/* 3-column compact grid */}
    {gridCards.length > 0 && (
      <div className="compact-grid">
        {gridCards.map((article, idx) => (
          <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-compact">
            {getSourceType(article.source) !== 'Other' && (
              <span className="news-card-source">{getSourceType(article.source)}</span>
            )}
            <h3 className="news-card-title">{article.title}</h3>
            <span className="news-card-date">{article.date}</span>
          </a>
        ))}
      </div>
    )}

    {/* Older stories list */}
    {listArticles.length > 0 && (
      <>
        <div className="headlines-header">
          <h2 className="headlines-title">Older Stories</h2>
        </div>
        <div className="articles-feed">
          {listArticles.map((article, idx) => (
            <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="feed-item">
              <span className="feed-date">{article.date}</span>
              <span className="feed-divider" aria-hidden="true" />
              <span className="feed-title">{article.title}</span>
              {getSourceType(article.source) !== 'Other' && (
                <span className="feed-source">{getSourceType(article.source)}</span>
              )}
            </a>
          ))}
        </div>
      </>
    )}

  </section>
)}
```

**Step 2: Verify no syntax errors**

Run: `npm run build 2>&1 | head -30`
Expected: clean compile

---

### Task 3: Add card and layout CSS to News.css

**Files:**
- Modify: `src/pages/News.css` — append before the `@media` block (before line 312)

Insert the following block before `/* --- Responsive --- */`:

```css
/* --- Magazine Row Layout --- */
.magazine-row {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  align-items: stretch;
}

.stacked-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* --- Compact Grid (3 columns) --- */
.compact-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* --- News Card Base (matches home's right-news-card / news-row-card) --- */
.news-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.03) 100%);
  border-radius: var(--border-radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-top: 2px solid rgba(232, 168, 51, 0.5);
  text-decoration: none;
  color: white;
  transition: border-top-color 0.15s, background 0.15s;
}

.news-card:hover {
  border-top-color: var(--asu-gold);
  background: rgba(255, 255, 255, 0.08);
}

/* Wide card gets more padding and larger title treatment */
.news-card-wide {
  padding: 24px;
  gap: 12px;
  justify-content: space-between;
}

/* Source label — matches home's .right-news-source */
.news-card-source {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--asu-gold);
}

/* Title */
.news-card-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.4;
  margin: 0;
  flex-grow: 1;
}

.news-card-title-wide {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
}

/* Date */
.news-card-date {
  font-size: 0.68rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.38);
  margin-top: auto;
}

.news-card:hover .news-card-title {
  color: white;
}
```

**Step 2: Check in browser**

Run both dev servers:
```bash
# Terminal 1
node server.js

# Terminal 2
npm start
```

Navigate to `http://localhost:3000/news` and verify:
- Magazine row shows: 1 wide card (left, ~60%) + 2 stacked cards (right, ~40%)
- 3-column compact grid shows below magazine row
- "Older Stories" gold label + list appears below grid
- Cards have gold top border that brightens on hover
- Source labels are gold, titles in sentence case

---

### Task 4: Mobile responsive styles

**Files:**
- Modify: `src/pages/News.css` — inside the existing `@media (max-width: 768px)` block

Add inside the `@media (max-width: 768px)` block (after the existing `.feed-source` rule at line 360):

```css
  .magazine-row {
    grid-template-columns: 1fr;
  }

  .compact-grid {
    grid-template-columns: 1fr;
  }

  .news-card-wide {
    padding: 16px;
  }

  .news-card-title-wide {
    font-size: 1rem;
  }
```

**Step 2: Check mobile**

In browser devtools, toggle to 375px width. Verify:
- Magazine row stacks vertically (single column)
- Compact grid stacks vertically
- Cards remain readable at mobile width

---

### Task 5: Edge case — filter produces fewer than 8 articles

The JSX already handles this gracefully via conditional rendering:
- `{wideCard && (...)` — entire section hidden if < 2 articles
- `{stackedCards.length > 0 && (...)` — stacked section hidden if < 3 articles
- `{gridCards.length > 0 && (...)` — grid hidden if < 5 articles
- `{listArticles.length > 0 && (...)` — list hidden if < 8 articles

**Step 1: Test by switching to "CHN" filter**

In browser, click "CHN" filter. Verify no layout breaks when only a few articles match.
Expected: hero shows, magazine row shows if ≥2 CHN articles, graceful degradation otherwise.

---

### Task 6: Commit

```bash
git add src/pages/News.jsx src/pages/News.css
git commit -m "feat(news): hybrid magazine layout — card grid + list"
```
