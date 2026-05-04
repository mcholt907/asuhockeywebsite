// src/components/UpcomingGames.jsx
import React, { useMemo } from 'react';
import { useSchedule } from '../hooks/queries/useSchedule';
import './UpcomingGames.css';

const formatGameDisplay = (dateStr, timeStr) => {
  if (!dateStr || dateStr === 'TBD') return 'Date TBD';
  const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const dateParts = dateStr.split('-');
  const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
  const displayDate = date.toLocaleDateString('en-US', options);
  return `${displayDate} - ${timeStr && timeStr !== 'TBD' ? timeStr : 'TBD'}`;
};

function UpcomingGames({ limit = 3 }) {
  const { data, isLoading, isError } = useSchedule();

  const upcomingGames = useMemo(() => {
    const games = data?.data;
    if (!Array.isArray(games)) return [];
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return games
      .filter(game => game.date >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const displayGames = upcomingGames.slice(0, limit);

  return (
    <div className="upcoming-games-widget">
      {isLoading && <p className="loading-message">Loading upcoming games...</p>}
      {!isLoading && isError && <p className="error-message">An unexpected error occurred while fetching schedule.</p>}
      {!isLoading && !isError && displayGames.length === 0 && (
        <p className="no-games">No upcoming games to display currently.</p>
      )}
      {!isLoading && !isError && displayGames.length > 0 && (
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
