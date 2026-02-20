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

        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
                    key={article.link || article.title || idx}
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
              {/* TODO: UpcomingGames independently fetches /api/schedule; could be optimized
                  by passing scheduleData as a prop to avoid the double fetch */}
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
                key={article.link || article.title || idx}
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
