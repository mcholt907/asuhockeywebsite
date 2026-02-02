// pages/Home.jsx
import React, { useState, useEffect } from 'react';
import NewsFeed from '../components/NewsFeed';
import UpcomingGames from '../components/UpcomingGames';
import { getSchedule } from '../services/api';
import './Home.css';

function Home() {
  const [gameDay, setGameDay] = useState(null);

  useEffect(() => {
    const checkGameDay = async () => {
      try {
        const scheduleResponse = await getSchedule();
        const games = scheduleResponse.data || [];

        // Get today's date in YYYY-MM-DD format (local time)
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Find matching game
        const todaysGame = games.find(g => {
          // Handle potential date format variations if needed, assume ISO or YYYY-MM-DD
          return g.date.includes(todayStr) || g.date === todayStr;
        });

        if (todaysGame) {
          setGameDay(todaysGame);
        }
      } catch (err) {
        console.error("Failed to check game day status:", err);
      }
    };

    checkGameDay();
  }, []);

  return (
    <div className={`home-page ${gameDay ? 'game-day-mode' : ''}`}>

      {/* Game Day Ticker */}
      {gameDay && (
        <div className="game-day-ticker">
          <div className="ticker-content">
            🚨 GAME DAY ALERT: Sun Devils vs {gameDay.opponent} @ {gameDay.time} • {gameDay.location} 🚨
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className={`hero ${gameDay ? 'hero-game-day' : ''}`}>
        <div className="hero-content">
          {gameDay ? (
            <div className="game-day-hero-content fade-in">
              <span className="game-day-badge">TODAY'S MATCHUP</span>
              <h1>Arizona State <span className="vs">VS</span> {gameDay.opponent}</h1>
              <div className="game-info-hero">
                <div className="info-block">
                  <span className="label">Time</span>
                  <span className="value">{gameDay.time}</span>
                </div>
                <div className="info-block">
                  <span className="label">Venue</span>
                  <span className="value">{gameDay.location}</span>
                </div>
              </div>
              <div className="hero-actions">
                <a href="/schedule" className="btn-primary">Game Center</a>
                <a href="https://thesundevils.com" target="_blank" rel="noreferrer" className="btn-secondary">Listen Live</a>
              </div>
            </div>
          ) : (
            <div className="logo-hero-content">
              {/* Logo is now part of the hero-jersey.jpg background */}
              <p className="site-subtitle">Your ultimate source for Sun Devil Hockey</p>
            </div>
          )}
        </div>
      </section>

      <section className="latest-news">
        <div className="section-header">
          <h2>Latest News</h2>
        </div>
        <NewsFeed limit={5} />
        <div className="view-more">
          <a href="/news">View All News →</a>
        </div>
      </section>

      <div className="two-column">
        <section className="upcoming-games">
          <div className="section-header">
            <h2>Upcoming Games</h2>
          </div>
          <UpcomingGames limit={3} />
          <div className="view-more">
            <a href="/schedule">View Full Schedule →</a>
          </div>
        </section>

        <section className="team-stats">
          <h2>Team Spotlight</h2>
          <div className="spotlight-content">
            <div className="stat-card">
              <div className="stat-value">22.04</div>
              <div className="stat-label">Average Age</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">5'11"</div>
              <div className="stat-label">Average Height</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">181</div>
              <div className="stat-label">Average Weight</div>
            </div>
            <div className="hometown-map">
              <h3>Player Hometowns</h3>
              <img src="/assets/player-map.png" alt="Player hometown map" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Home;
