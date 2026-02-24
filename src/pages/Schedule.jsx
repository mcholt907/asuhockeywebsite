import React, { useState, useEffect } from 'react';
import { getSchedule } from '../services/api';
import './Schedule.css';

function Schedule() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const record = calculateRecord();

  if (loading) {
    return <div className="page-container"><p>Loading schedule...</p></div>;
  }

  if (error) {
    return <div className="page-container"><p className="error-message">{error}</p></div>;
  }

  return (
    <div className="page-container schedule-page">
      <h1>Team Schedule (2025-2026)</h1>

      {/* Team Record Display */}
      <div className="team-record">
        <div className="record-card">
          <div className="record-label">Overall Record</div>
          <div className="record-stats">
            <div className="stat-item">
              <span className="stat-value">{record.wins}</span>
              <span className="stat-label">Wins</span>
            </div>
            <div className="stat-separator">-</div>
            <div className="stat-item">
              <span className="stat-value">{record.losses}</span>
              <span className="stat-label">Losses</span>
            </div>
            {record.ties > 0 && (
              <>
                <div className="stat-separator">-</div>
                <div className="stat-item">
                  <span className="stat-value">{record.ties}</span>
                  <span className="stat-label">Ties</span>
                </div>
              </>
            )}
          </div>
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
                  {game.time && game.time !== 'TBD' && (
                    <span className="game-time">{game.time}</span>
                  )}
                </div>
                <div className="game-details">
                  <span className="game-opponent">
                    <span className="status-indicator">{game.status === 'Home' ? 'vs' : '@'}</span> {game.opponent}
                  </span>
                  {game.notes && <span className="game-notes">({game.notes})</span>}
                </div>
                <div className="game-location">{game.location}</div>
                {game.result && (
                  <div className="game-result">
                    Result: {game.result}
                  </div>
                )}
                {game.result && (game.box_link || game.metrics_link) && (
                  <div className="game-links">
                    {game.box_link && (
                      <a href={game.box_link} target="_blank" rel="noopener noreferrer" className="game-link-btn">
                        Box
                      </a>
                    )}
                    {game.metrics_link && (
                      <a href={game.metrics_link} target="_blank" rel="noopener noreferrer" className="game-link-btn">
                        Metrics
                      </a>
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

