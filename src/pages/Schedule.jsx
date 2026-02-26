import React, { useState, useEffect } from 'react';
import { getSchedule } from '../services/api';
import './Schedule.css';

function Schedule() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);

  useEffect(() => {
    const fetchSchedulePageData = async () => {
      try {
        setLoading(true);
        setError(null);
        const responseData = await getSchedule();

        if (responseData.source === 'error') {
          setError(responseData.error || 'Failed to load schedule data.');
          setGames([]);
        } else if (responseData.data && Array.isArray(responseData.data)) {
          // Sort games by date
          const sortedSchedule = [...responseData.data].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
          );
          setGames(sortedSchedule);
          setTeamRecord(responseData.team_record || null);
        } else {
          console.error("Schedule page data is not in the expected format:", responseData);
          setGames([]);
          setError('Could not load schedule data in the expected format.');
        }
      } catch (err) {
        console.error('Error in Schedule component useEffect:', err);
        setError('Failed to load schedule data. Please try again later.');
        setGames([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedulePageData();
  }, []);

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
      <title>2025-26 Schedule &amp; Results | Forks Up Pucks – ASU Hockey</title>
      <meta name="description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, scores, and results." />
      <meta property="og:title" content="2025-26 Schedule & Results | Forks Up Pucks – ASU Hockey" />
      <meta property="og:description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, scores, and results." />
      <meta property="og:url" content="https://forksuppucks.com/schedule" />
      <meta name="twitter:title" content="2025-26 Schedule & Results | Forks Up Pucks – ASU Hockey" />
      <meta name="twitter:description" content="Full 2025-26 ASU Sun Devils Men's Hockey schedule, scores, and results." />
      <h1>Team Schedule (2025-2026)</h1>

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

