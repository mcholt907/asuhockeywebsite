// src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
import UpcomingGames from '../components/UpcomingGames';
import { getSchedule, getNews, getStandings } from '../services/api';
import heroArenaImage from '../assets/ASU-Hockey-at-Mullett-Arena.jpg';
import './Home.css';

function Home() {
  const [nextGame, setNextGame] = useState(null);
  const [today, setToday] = useState('');
  const [record, setRecord] = useState({ wins: 0, losses: 0, ties: 0 });
  const [npi, setNpi] = useState(null);
  const [news, setNews] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [scheduleResponse, newsResponse, standingsResponse] = await Promise.all([
          getSchedule(),
          getNews(),
          getStandings()
        ]);

        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setToday(todayStr);

        const games = scheduleResponse.data || [];
        const next = games
          .filter(g => g.date >= todayStr)
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
        setNextGame(next);

        let wins = 0, losses = 0, ties = 0;
        games.forEach(game => {
          if (game.result) {
            const r = game.result.toLowerCase();
            if (r.includes('w') || r.match(/\d+-\d+.*w/i)) wins++;
            else if (r.includes('l') || r.match(/\d+-\d+.*l/i)) losses++;
            else if (r.includes('t') || r.includes('otl') || r.includes('sol')) ties++;
          }
        });
        setRecord({ wins, losses, ties });
        setNpi(scheduleResponse.team_record?.npi ?? null);

        setNews(newsResponse.data || []);
        setStandings(standingsResponse.data || []);
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
      <title>Forks Up Pucks | ASU Sun Devils Hockey</title>
      <meta name="description" content="The ultimate fan site for ASU Sun Devils Men's Hockey. Live scores, schedule, roster, stats, recruiting news and more." />
      <meta property="og:title" content="Forks Up Pucks | ASU Sun Devils Hockey" />
      <meta property="og:description" content="The ultimate fan site for ASU Sun Devils Men's Hockey. Live scores, schedule, roster, stats, recruiting news and more." />
      <meta property="og:url" content="https://forksuppucks.com" />
      <meta name="twitter:title" content="Forks Up Pucks | ASU Sun Devils Hockey" />
      <meta name="twitter:description" content="The ultimate fan site for ASU Sun Devils Men's Hockey. Live scores, schedule, roster, stats, recruiting news and more." />
      <link rel="canonical" href="https://forksuppucks.com" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "SportsOrganization",
                "name": "Arizona State Sun Devils Men's Hockey",
                "alternateName": ["ASU Hockey", "ASU Sun Devils Hockey"],
                "url": "https://forksuppucks.com",
                "logo": "https://forksuppucks.com/assets/asu-hockey-logo.png",
                "sport": "Ice Hockey",
                "memberOf": {
                  "@type": "SportsOrganization",
                  "name": "National Collegiate Hockey Conference",
                  "alternateName": "NCHC"
                },
                "location": {
                  "@type": "Place",
                  "name": "Mullett Arena",
                  "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "Tempe",
                    "addressRegion": "AZ",
                    "addressCountry": "US"
                  }
                }
              },
              {
                "@type": "BreadcrumbList",
                "itemListElement": [
                  { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" }
                ]
              }
            ]
          })
        }}
      />

      {/* Single dark floating card — hero + news combined */}
      <div className="home-card">

        {/* Zone 1: Hero Grid */}
        <div className="home-hero-grid">

          {/* Left Panel — action photo + matchup text */}
          <div className="hero-left">
            <img
              src={heroArenaImage}
              alt=""
              aria-hidden="true"
              fetchpriority="high"
              className="hero-left-bg"
            />
            <div className="hero-overlay" />
            <div className="hero-left-content">
              {nextGame && nextGame.date === today ? (
                <>
                  <div className="hero-matchup">
                    <span className="hero-team">Arizona State</span>
                    <span className="hero-vs">vs.</span>
                    <span className="hero-opponent">{nextGame.opponent}</span>
                  </div>
                  <div className="hero-game-meta">
                    <span className="hero-time">{nextGame.time}</span>
                    <span className="hero-separator">·</span>
                    <span className="hero-venue">{nextGame.location}</span>
                  </div>
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
                </>
              ) : (
                <div className="hero-tagline">
                  <span className="hero-tagline-line1">Forks Up</span>
                  <span className="hero-tagline-line2">Pucks</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — dark sidebar */}
          <div className="hero-right">

            {/* Overall Record */}
            <div className="right-section">
              <h3 className="right-section-title">Overall Record</h3>
              <div className="right-record-card">
                <div className="right-record-stats">
                  <div className="right-record-stat">
                    <span className="right-record-value">{record.wins}</span>
                    <span className="right-record-label">Wins</span>
                  </div>
                  <span className="right-record-sep">—</span>
                  <div className="right-record-stat">
                    <span className="right-record-value">{record.losses}</span>
                    <span className="right-record-label">Losses</span>
                  </div>
                  <span className="right-record-sep">—</span>
                  <div className="right-record-stat">
                    <span className="right-record-value">{record.ties}</span>
                    <span className="right-record-label">Ties</span>
                  </div>
                </div>
                {npi !== null && (
                  <div className="right-record-npi">
                    <span className="right-record-npi-label">NPI</span>
                    <span className="right-record-npi-value">#{npi}</span>
                  </div>
                )}
              </div>
            </div>

            {/* NCHC Conference Standings */}
            {standings.length > 0 && (
              <div className="right-section">
                <h3 className="right-section-title">NCHC Standings</h3>
                <div className="right-standings">
                  <table className="standings-widget-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>PTS</th>
                        <th>NCHC</th>
                        <th>OVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team, i) => (
                        <tr key={i} className={team.isASU ? 'standings-asu-row' : ''}>
                          <td>{team.rank}</td>
                          <td className="standings-team-name">{team.team}</td>
                          <td>{team.pts}</td>
                          <td>{team.confRecord}</td>
                          <td>{team.overallRecord}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Trending News — 3 cards in a horizontal row */}
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

            {/* Upcoming Schedule */}
            <div className="right-section">
              <h3 className="right-section-title">Schedule</h3>
              <div className="right-upcoming-games">
                {/* TODO: UpcomingGames independently fetches /api/schedule; could be optimized
                    by passing scheduleData as a prop to avoid the double fetch */}
                <UpcomingGames limit={3} />
              </div>
            </div>

          </div>
        </div>


      </div>
    </div>
  );
}

export default Home;
