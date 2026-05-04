import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSchedule } from '../hooks/queries/useSchedule';
import './Schedule.css';

function Schedule() {
  const { data, isLoading: loading, isError } = useSchedule();

  const games = useMemo(() => {
    if (!data?.data || !Array.isArray(data.data)) return [];
    return [...data.data].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const teamRecord = data?.team_record || null;
  const error = isError ? 'Failed to load schedule data. Please try again later.' : null;

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'TBD') return 'Date TBD';
    const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const dateParts = dateString.split('-');
    const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    return date.toLocaleDateString('en-US', options);
  };

  const formatRecord = (r) =>
    r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;

  // Calculate overall record from game results
  const calculateRecord = () => {
    let wins = 0;
    let losses = 0;
    let ties = 0;

    games.forEach(game => {
      if (game.result) {
        const result = game.result.toLowerCase();
        // Check for win patterns: "W", "5-3 W", etc.
        if (result.includes('w') || result.match(/\d+-\d+.*w/i)) {
          wins++;
        }
        // Check for loss patterns: "L", "2-4 L", etc.
        else if (result.includes('l') || result.match(/\d+-\d+.*l/i)) {
          losses++;
        }
        // Check for tie/OT loss patterns: "T", "OTL", "SOL", etc.
        else if (result.includes('t') || result.includes('otl') || result.includes('sol')) {
          ties++;
        }
      }
    });

    return { wins, losses, ties };
  };

  if (loading) {
    return <div className="page-container"><p>Loading schedule...</p></div>;
  }

  if (error) {
    return <div className="page-container"><p className="error-message">{error}</p></div>;
  }

  return (
    <div className="page-container schedule-page">
      <Helmet>
        <title>ASU Hockey Schedule & Scores (2025-2026) | Forks Up Pucks</title>
        <meta name="description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, live scores, broadcast details, and game results." />
        <meta property="og:title" content="ASU Hockey Schedule & Scores (2025-2026) | Forks Up Pucks" />
        <meta property="og:description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, live scores, broadcast details, and game results." />
        <meta property="og:url" content="https://forksuppucks.com/schedule" />
        <meta name="twitter:title" content="ASU Hockey Schedule & Scores (2025-2026) | Forks Up Pucks" />
        <meta name="twitter:description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, live scores, broadcast details, and game results." />
        <link rel="canonical" href="https://forksuppucks.com/schedule" />
        {games.length > 0 && (
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                ...games.map(game => ({
                  "@type": "SportsEvent",
                  "name": `Arizona State ${game.status === 'Home' ? 'vs.' : 'at'} ${game.opponent}`,
                  "description": `Arizona State Sun Devils Men's Hockey game ${game.status === 'Home' ? 'vs.' : 'at'} ${game.opponent}.`,
                  "image": "https://forksuppucks.com/logo512.png",
                  "startDate": game.date,
                  "endDate": game.date,
                  "location": {
                    "@type": "Place",
                    "name": game.location || (game.status === 'Home' ? 'Mullett Arena' : `${game.opponent} Arena`),
                    "address": game.location || (game.status === 'Home' ? 'Mullett Arena, Tempe, AZ' : 'TBD')
                  },
                  "homeTeam": game.status === 'Home'
                    ? { "@type": "SportsTeam", "name": "Arizona State Sun Devils" }
                    : { "@type": "SportsTeam", "name": game.opponent },
                  "awayTeam": game.status === 'Home'
                    ? { "@type": "SportsTeam", "name": game.opponent }
                    : { "@type": "SportsTeam", "name": "Arizona State Sun Devils" },
                  "performer": [
                    { "@type": "SportsTeam", "name": "Arizona State Sun Devils" },
                    { "@type": "SportsTeam", "name": game.opponent }
                  ],
                  "organizer": {
                    "@type": "Organization",
                    "name": "Arizona State University Hockey",
                    "url": "https://forksuppucks.com"
                  },
                  "offers": {
                    "@type": "Offer",
                    "url": "https://thesundevils.com/sports/mens-ice-hockey/schedule",
                    "price": "0.00",
                    "priceCurrency": "USD",
                    "availability": game.result ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"
                  },
                  "eventStatus": game.result
                    ? "https://schema.org/EventCompleted"
                    : "https://schema.org/EventScheduled",
                  "sport": "Ice Hockey"
                })),
                {
                  "@type": "BreadcrumbList",
                  "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
                    { "@type": "ListItem", "position": 2, "name": "Schedule", "item": "https://forksuppucks.com/schedule" }
                  ]
                }
              ]
            })}
          </script>
        )}
      </Helmet>
      <h1>ASU Hockey Schedule & Results</h1>

      {/* Team Record Display */}
      <div className="team-record">
        <div className="record-card">
          <div className="record-label">Team Record</div>
          {teamRecord ? (
            <div className="record-grid">
              <div className="record-stat featured">
                <span className="record-stat-value">{formatRecord(teamRecord.overall)}</span>
                <span className="record-stat-label">Overall</span>
              </div>
              <div className="record-stat sub">
                <span className="record-stat-value">{formatRecord(teamRecord.conf)}</span>
                <span className="record-stat-label">NCHC</span>
              </div>
              <div className="record-stat sub">
                <span className="record-stat-value">{formatRecord(teamRecord.home)}</span>
                <span className="record-stat-label">Home</span>
              </div>
              <div className="record-stat sub">
                <span className="record-stat-value">{formatRecord(teamRecord.away)}</span>
                <span className="record-stat-label">Away</span>
              </div>
            </div>
          ) : (
            <div className="record-grid">
              <div className="record-stat featured">
                <span className="record-stat-value">{formatRecord(calculateRecord())}</span>
                <span className="record-stat-label">Overall</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {games.length === 0 ? (
        <p>No schedule data found at the moment.</p>
      ) : (
        <ul className="schedule-list">
          {games.map((game, index) => {
            return (
              <li key={`${game.date}-${game.opponent}-${index}`} className={`schedule-item ${game.status ? game.status.toLowerCase() : ''}`}>
                <div className="game-date-time">
                  <span className="game-date">{formatDate(game.date)}</span>
                  {game.time && game.time !== 'TBD' && !game.result && (
                    <span className="game-time">{game.time}</span>
                  )}
                  {game.status && (
                    <span className={`game-venue-tag ${game.status.toLowerCase()}`}>{game.status}</span>
                  )}
                </div>
                <div className="game-details">
                  <span className="game-opponent">
                    <span className="game-venue-vs">{game.status === 'Home' ? 'vs' : '@'}</span> {game.opponent}
                  </span>
                  {game.notes && <span className="game-notes">({game.notes})</span>}
                </div>
                <div className="game-location">{game.location}</div>
                {game.result && (
                  <div className="game-result-col">
                    <div className={`result-badge result-badge-${game.result.charAt(0).toLowerCase()}`}>
                      <span className="result-badge-letter">{game.result.charAt(0)}</span>
                      <span className="result-badge-score">{game.result.slice(2)}</span>
                    </div>
                    {(game.box_link || game.metrics_link) && (
                      <div className="game-links">
                        {game.box_link && (
                          <a href={game.box_link} target="_blank" rel="noopener noreferrer" className="game-link-pill">
                            Box
                          </a>
                        )}
                        {game.metrics_link && (
                          <a href={game.metrics_link} target="_blank" rel="noopener noreferrer" className="game-link-pill">
                            Metrics
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Schedule;

