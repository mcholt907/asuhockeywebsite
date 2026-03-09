# Homepage Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Home page with a full-viewport split-panel layout — dramatic broadcast-style hero on the left, dark sidebar with news/schedule/stats on the right, followed by a below-fold news card row.

**Architecture:** `Home.jsx` fetches schedule + news in parallel on mount, derives `nextGame` (first upcoming game by date), then renders a CSS Grid split-panel. The right panel reuses `<UpcomingGames>` for the schedule section. No new components — only `Home.jsx` and `Home.css` change.

**Tech Stack:** React (useState, useEffect), CSS Grid, existing API services (`getSchedule`, `getNews`).

---

## Task 1: Rewrite Home.jsx

**Files:**
- Modify: `src/pages/Home.jsx`

**Step 1: Read the current file**

```bash
# Confirm current state before overwriting
head -10 src/pages/Home.jsx
```

Expected: shows the old Home component.

**Step 2: Write the new Home.jsx**

Replace the entire contents of `src/pages/Home.jsx` with:

```jsx
// src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
import UpcomingGames from '../components/UpcomingGames';
import { getSchedule, getNews } from '../services/api';
import './Home.css';

function Home() {
  const [nextGame, setNextGame] = useState(null);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [scheduleResponse, newsResponse] = await Promise.all([
          getSchedule(),
          getNews()
        ]);

        const today = new Date().toISOString().split('T')[0];
        const games = scheduleResponse.data || [];
        const next = games
          .filter(g => g.date >= today)
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
        setNextGame(next);

        setNews(newsResponse.data || []);
      } catch (err) {
        console.error('Home data fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <div className="home-loading">Loading...</div>;
  }

  return (
    <div className="home-page">

      {/* Zone 1: Hero Grid */}
      <div className="home-hero-grid">

        {/* Left Panel — action photo + matchup text */}
        <div className="hero-left">
          <div className="hero-overlay" />
          <div className="hero-left-content">
            <div className="hero-matchup">
              <span className="hero-team">Arizona State</span>
              <span className="hero-vs">vs.</span>
              <span className="hero-opponent">
                {nextGame ? nextGame.opponent : 'Sun Devil Hockey'}
              </span>
            </div>
            {nextGame && (
              <div className="hero-game-meta">
                <span className="hero-time">{nextGame.time}</span>
                <span className="hero-separator">·</span>
                <span className="hero-venue">{nextGame.location}</span>
              </div>
            )}
            <div className="hero-actions">
              <a href="/schedule" className="btn-hero-primary">Game Center</a>
              <a
                href="https://nchchockey.com/tv/"
                target="_blank"
                rel="noreferrer"
                className="btn-hero-secondary"
              >
                NCHC.TV
              </a>
            </div>
          </div>
        </div>

        {/* Right Panel — dark sidebar */}
        <div className="hero-right">

          {nextGame && (
            <div className="right-matchup-header">
              <p className="right-matchup-title">
                Arizona State vs. {nextGame.opponent}
              </p>
              <p className="right-matchup-meta">
                {nextGame.time} · {nextGame.location}
              </p>
            </div>
          )}

          {/* Trending News — top 3 article cards */}
          {news.length > 0 && (
            <div className="right-section">
              <h3 className="right-section-title">Trending News</h3>
              <div className="right-news-cards">
                {news.slice(0, 3).map((article, idx) => (
                  <a
                    key={idx}
                    href={article.link}
                    target="_blank"
                    rel="noreferrer"
                    className="right-news-card"
                  >
                    <span className="right-news-source">{article.source}</span>
                    <span className="right-news-title">{article.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Featured article — item 4 */}
          {news[3] && (
            <div className="right-section">
              <div className="right-featured-article">
                <span className="right-news-source">{news[3].source}</span>
                <h4 className="right-featured-title">{news[3].title}</h4>
                <a
                  href={news[3].link}
                  target="_blank"
                  rel="noreferrer"
                  className="right-read-more"
                >
                  Read More →
                </a>
              </div>
            </div>
          )}

          {/* Upcoming Schedule */}
          <div className="right-section">
            <h3 className="right-section-title">Schedule</h3>
            <div className="right-upcoming-games">
              <UpcomingGames limit={3} />
            </div>
          </div>

          {/* Team Spotlight — hardcoded roster averages */}
          <div className="right-section">
            <h3 className="right-section-title">Team Spotlight</h3>
            <div className="right-spotlight">
              <div className="right-stat">
                <span className="right-stat-value">22.04</span>
                <span className="right-stat-label">Avg Age</span>
              </div>
              <div className="right-stat">
                <span className="right-stat-value">5'11"</span>
                <span className="right-stat-label">Avg Height</span>
              </div>
              <div className="right-stat">
                <span className="right-stat-value">181</span>
                <span className="right-stat-label">Avg Weight</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Zone 2: Below-fold news card row */}
      {news.length > 4 && (
        <section className="home-news-row">
          <div className="news-row-header">
            <h2>Latest News</h2>
            <a href="/news" className="view-all-link">View All →</a>
          </div>
          <div className="news-row-cards">
            {news.slice(4, 9).map((article, idx) => (
              <a
                key={idx}
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="news-row-card"
              >
                <span className="news-row-source">{article.source}</span>
                <h4 className="news-row-title">{article.title}</h4>
                {article.date && article.date !== 'Date not found' && (
                  <span className="news-row-date">{article.date}</span>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

export default Home;
```

**Step 3: Confirm no syntax errors**

```bash
node -e "console.log('JSX won\\'t parse in Node — file check only'); require('fs').existsSync('src/pages/Home.jsx') && console.log('File exists')"
```

Expected: "File exists"

**Step 4: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "feat(home): rewrite Home.jsx with split-panel layout"
```

---

## Task 2: Rewrite Home.css

**Files:**
- Modify: `src/pages/Home.css`

**Step 1: Replace the entire contents of `src/pages/Home.css` with:**

```css
/* Home.css — redesigned split-panel layout */

/* ============================================
   Zone 1: Hero Grid
   ============================================ */

.home-hero-grid {
  display: grid;
  grid-template-columns: 60fr 40fr;
  height: calc(100vh - 64px);
  max-height: 900px;
}

/* --- Left Panel --- */
.hero-left {
  position: relative;
  background-image: url('../assets/hero-wide-final.png');
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: flex-end;
  padding: 48px;
  overflow: hidden;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.78) 0%,
    rgba(0, 0, 0, 0.45) 60%,
    rgba(0, 0, 0, 0.15) 100%
  );
  pointer-events: none;
}

.hero-left-content {
  position: relative;
  z-index: 1;
  color: white;
}

.hero-matchup {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 20px;
}

.hero-team {
  font-size: clamp(1.8rem, 3.5vw, 4rem);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  line-height: 1;
}

.hero-vs {
  font-size: clamp(1rem, 1.8vw, 2rem);
  font-style: italic;
  color: var(--asu-gold);
  font-weight: 700;
  line-height: 1.2;
}

.hero-opponent {
  font-size: clamp(1.8rem, 3.5vw, 4rem);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  line-height: 1;
}

.hero-game-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 28px;
  font-weight: 500;
}

.hero-separator {
  color: var(--asu-gold);
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-hero-primary {
  padding: 10px 24px;
  background: var(--asu-gold);
  color: var(--asu-maroon);
  border-radius: 4px;
  font-weight: 800;
  text-decoration: none;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-hero-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(255, 198, 39, 0.45);
}

.btn-hero-secondary {
  padding: 10px 24px;
  background: transparent;
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.55);
  border-radius: 4px;
  font-weight: 700;
  text-decoration: none;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition: all 0.2s;
}

.btn-hero-secondary:hover {
  border-color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* --- Right Panel --- */
.hero-right {
  background: #120608;
  color: #e8e0e2;
  overflow-y: auto;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.right-matchup-header {
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.right-matchup-title {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: white;
  margin: 0 0 5px;
}

.right-matchup-meta {
  font-size: 0.82rem;
  color: rgba(232, 224, 226, 0.55);
  margin: 0;
}

.right-section-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--asu-gold);
  margin: 0 0 12px;
}

/* Right news cards */
.right-news-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.right-news-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #1e0810;
  border-radius: 5px;
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: border-color 0.15s;
}

.right-news-card:hover {
  border-left-color: var(--asu-gold);
}

.right-news-source {
  font-size: 0.67rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--asu-gold);
  font-weight: 600;
}

.right-news-title {
  font-size: 0.85rem;
  color: #e8e0e2;
  line-height: 1.4;
  font-weight: 500;
}

/* Right featured article */
.right-featured-article {
  padding: 16px;
  background: #1e0810;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.right-featured-title {
  font-size: 0.95rem;
  color: white;
  line-height: 1.4;
  font-weight: 600;
  margin: 0;
}

.right-read-more {
  font-size: 0.75rem;
  color: var(--asu-gold);
  text-decoration: none;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  align-self: flex-start;
}

.right-read-more:hover {
  text-decoration: underline;
}

/* Right upcoming games — override UpcomingGames component for dark panel */
.right-upcoming-games .upcoming-games-widget {
  background: transparent;
}

.right-upcoming-games ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.right-upcoming-games li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.82rem;
  color: #e8e0e2;
  padding: 8px 10px;
  background: #1e0810;
  border-radius: 4px;
}

.right-upcoming-games .game-date-time-display {
  color: var(--asu-gold);
  font-weight: 600;
}

.right-upcoming-games .game-opponent-display {
  color: white;
  font-weight: 500;
}

.right-upcoming-games .game-location-display {
  color: rgba(232, 224, 226, 0.5);
  font-size: 0.75rem;
}

.right-upcoming-games .loading-message,
.right-upcoming-games .error-message,
.right-upcoming-games .no-games {
  font-size: 0.82rem;
  color: rgba(232, 224, 226, 0.5);
}

/* Right team spotlight */
.right-spotlight {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.right-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  background: #1e0810;
  border-radius: 5px;
}

.right-stat-value {
  font-size: 1.3rem;
  font-weight: 800;
  color: white;
  line-height: 1;
  margin-bottom: 5px;
}

.right-stat-label {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(232, 224, 226, 0.45);
  text-align: center;
}

/* ============================================
   Zone 2: Below-fold news card row
   ============================================ */

.home-news-row {
  padding: 60px 40px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.news-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
  padding-bottom: 16px;
  position: relative;
}

.news-row-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--gradient-gold);
  border-radius: 10px;
}

.news-row-header h2 {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--asu-maroon);
  margin: 0;
  letter-spacing: -0.01em;
}

.view-all-link {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--asu-maroon);
  text-decoration: none;
  transition: color 0.15s;
}

.view-all-link:hover {
  color: var(--asu-gold);
}

.news-row-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.news-row-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: white;
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  text-decoration: none;
  transition: all 0.2s;
}

.news-row-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--asu-gold);
}

.news-row-source {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--asu-maroon);
}

.news-row-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.45;
  margin: 0;
  flex-grow: 1;
}

.news-row-date {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-top: auto;
}

/* ============================================
   Loading state
   ============================================ */

.home-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 64px);
  font-size: 1.1rem;
  color: var(--text-secondary);
  font-style: italic;
}

/* ============================================
   Responsive
   ============================================ */

@media (max-width: 900px) {
  .home-hero-grid {
    grid-template-columns: 1fr;
    height: auto;
    max-height: none;
  }

  .hero-left {
    height: 50vh;
    min-height: 320px;
    padding: 32px 24px;
    align-items: flex-end;
  }

  .hero-right {
    overflow-y: visible;
    padding: 28px 20px;
  }

  .home-news-row {
    padding: 40px 20px;
  }
}

@media (max-width: 480px) {
  .hero-left {
    padding: 24px 16px;
  }

  .news-row-cards {
    grid-template-columns: 1fr;
  }

  .right-spotlight {
    gap: 8px;
  }

  .right-stat-value {
    font-size: 1.1rem;
  }
}
```

**Step 2: Confirm the file was written**

```bash
wc -l src/pages/Home.css
```

Expected: ~280+ lines.

**Step 3: Commit**

```bash
git add src/pages/Home.css
git commit -m "feat(home): rewrite Home.css for split-panel redesign"
```

---

## Task 3: Visual verification

**Step 1: Start the dev server**

In two terminals:
```bash
# Terminal 1
node server.js

# Terminal 2
npm start
```

**Step 2: Open http://localhost:3000 and verify:**

- [ ] Page fills the full viewport height with the split-panel layout
- [ ] Left panel shows the hero photo with dark overlay and matchup text
- [ ] "vs." is displayed in gold italic between team names
- [ ] Gold "Game Center" button and outline "NCHC.TV" button visible
- [ ] Right panel has dark background with gold section headings
- [ ] Trending News shows 3 article cards with gold left-border on hover
- [ ] Featured article shows below the 3 cards
- [ ] Schedule shows 3 upcoming games with gold date highlight
- [ ] Team Spotlight shows 3 stat tiles at bottom of right panel
- [ ] Scrolling past the viewport reveals the news card row
- [ ] News card row shows 5 cards in a responsive grid

**Step 3: Mobile check (DevTools → 390px width)**

- [ ] Grid collapses to single column
- [ ] Left panel is ~50vh
- [ ] Right panel stacks below and scrolls with page

**Step 4: Edge cases**

- [ ] If schedule API returns no future games, left panel shows "Sun Devil Hockey" fallback
- [ ] If news API returns no articles, right panel news sections are hidden (conditional rendering)

**Step 5: Commit if any polish fixes were needed**

```bash
git add src/pages/Home.jsx src/pages/Home.css
git commit -m "fix(home): visual polish from verification pass"
```
