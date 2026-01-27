// src/components/UpcomingGames.jsx
import React, { useState, useEffect } from 'react';
import './UpcomingGames.css'; // Import the new CSS file

// Simplified helper for this component's needs
const formatGameDisplay = (dateStr, timeStr) => {
  if (!dateStr || dateStr === 'TBD') {
    return 'Date TBD';
  }

  const options = { month: 'short', day: 'numeric' };
  const dateParts = dateStr.split('-');
  const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
  const displayDate = date.toLocaleDateString('en-US', options);

  return `${displayDate} - ${timeStr && timeStr !== 'TBD' ? timeStr : 'TBD'}`;
};

function UpcomingGames({ limit = 3 }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUpcomingGames = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/schedule');
        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status}`);
        }
        const responseData = await response.json();

        if (responseData.data && Array.isArray(responseData.data)) {
          // Get today's date in YYYY-MM-DD format for comparison
          const today = new Date().toISOString().split('T')[0];

          const upcomingGames = responseData.data
            .filter(game => game.date >= today) // Filter for today or future
            .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort ascending

          setGames(upcomingGames);
        } else {
          setError('Schedule data received in an unexpected format.');
          setGames([]);
        }
      } catch (err) {
        console.error('Error in UpcomingGames fetchUpcomingGames:', err);
        setError('An unexpected error occurred while fetching schedule.');
        setGames([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingGames();
  }, []);

  const displayGames = games.slice(0, limit);

  return (
    <div className="upcoming-games-widget">
      {/* Header removed as it is handled by the parent component */}
      {loading && <p className="loading-message">Loading upcoming games...</p>}
      {!loading && error && <p className="error-message">{error}</p>}
      {!loading && !error && displayGames.length === 0 && (
        <p className="no-games">No upcoming games to display currently.</p>
      )}
      {!loading && !error && displayGames.length > 0 && (
        <ul>
          {displayGames.map((game, idx) => (
            <li key={`${game.date}-${game.opponent}-${idx}`}>
              <span className="game-date-time-display">{formatGameDisplay(game.date, game.time)}</span>
              <span className="game-opponent-display"> {game.status === 'Home' ? 'vs' : '@'} {game.opponent}</span>
              {game.location && <span className="game-location-display"> ({game.location})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default UpcomingGames;
