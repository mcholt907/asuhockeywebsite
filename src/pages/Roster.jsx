import React, { useState, useEffect } from 'react';
import { getRoster } from '../services/api';
import './Roster.css';

function Roster() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState('all');

  useEffect(() => {
    const fetchRosterData = async () => {
      try {
        setLoading(true);
        setError(null);
        const rosterData = await getRoster();
        if (Array.isArray(rosterData)) {
          // Filter out invalid players (non-numeric jersey numbers, missing names)
          const filteredPlayers = rosterData.filter(
            player => player &&
              player.name &&
              (player.number && /^[0-9]+$/.test(String(player.number)))
          );
          setPlayers(filteredPlayers);
        } else {
          setPlayers([]);
          setError('Could not load roster data in the expected format.');
        }
      } catch (err) {
        console.error('Error fetching roster:', err);
        setError('Failed to load roster data. Please try again later.');
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRosterData();
  }, []);

  // Group players by position
  const playersByPosition = {
    goaltenders: players.filter(p => p.name && p.name.includes('(G)')),
    defensemen: players.filter(p => p.name && p.name.includes('(D)')),
    forwards: players.filter(p => p.name && !p.name.includes('(G)') && !p.name.includes('(D)'))
  };

  // Filter based on selected position
  const getFilteredPlayers = () => {
    if (selectedPosition === 'all') {
      return playersByPosition;
    } else if (selectedPosition === 'g') {
      return { goaltenders: playersByPosition.goaltenders, defensemen: [], forwards: [] };
    } else if (selectedPosition === 'd') {
      return { goaltenders: [], defensemen: playersByPosition.defensemen, forwards: [] };
    } else if (selectedPosition === 'f') {
      return { goaltenders: [], defensemen: [], forwards: playersByPosition.forwards };
    }
    return playersByPosition;
  };

  const filteredPlayers = getFilteredPlayers();

  // Helper to get player display name
  const getPlayerName = (player) => {
    return player.name || player.Player || 'Unknown';
  };

  // Helper to get player number
  const getPlayerNumber = (player) => {
    return player.number || player['#'] || '-';
  };

  // Helper to get nationality
  const getNationality = (player) => {
    return player.nationality || player.Nationality || 'USA';
  };

  if (loading) {
    return <div className="page-container"><p>Loading roster...</p></div>;
  }

  if (error) {
    return <div className="page-container"><p className="error-message">{error}</p></div>;
  }

  return (
    <div className="page-container roster-page">
      <div className="page-header">
        <h1>Team Roster (2025-2026 Season)</h1>

        <div className="roster-controls">
          <div className="position-filter">
            <button
              className={selectedPosition === 'all' ? 'active' : ''}
              onClick={() => setSelectedPosition('all')}
            >
              All
            </button>
            <button
              className={selectedPosition === 'g' ? 'active' : ''}
              onClick={() => setSelectedPosition('g')}
            >
              Goaltenders
            </button>
            <button
              className={selectedPosition === 'd' ? 'active' : ''}
              onClick={() => setSelectedPosition('d')}
            >
              Defensemen
            </button>
            <button
              className={selectedPosition === 'f' ? 'active' : ''}
              onClick={() => setSelectedPosition('f')}
            >
              Forwards
            </button>
          </div>
        </div>
      </div>

      <div className="roster-content">
        {filteredPlayers.goaltenders.length > 0 && (
          <div className="position-group">
            <h2>Goaltenders</h2>
            <div className="roster-table-container">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>N</th>
                    <th>Player</th>
                    <th>Shoots</th>
                    <th>Ht</th>
                    <th>Wt</th>
                    <th>Born</th>
                    <th>Birthplace</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.goaltenders.map((player, index) => (
                    <tr key={`g-${getPlayerNumber(player)}-${index}`}>
                      <td>{getPlayerNumber(player)}</td>
                      <td>
                        <img
                          src={`/assets/flags/${getNationality(player).toLowerCase()}.png`}
                          alt={getNationality(player)}
                          className="flag-icon"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </td>
                      <td>
                        {player['Player Link'] || player.player_link ? (
                          <a
                            href={player['Player Link'] || player.player_link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {getPlayerName(player)}
                          </a>
                        ) : (
                          getPlayerName(player)
                        )}
                      </td>
                      <td>{player.S || player.shoots || '-'}</td>
                      <td>{player.Ht || player.height || '-'}</td>
                      <td>{player.Wt || player.weight || '-'}</td>
                      <td>{player.Born || player.born || player.birth_year || '-'}</td>
                      <td>{player.Birthplace || player.birthplace || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredPlayers.defensemen.length > 0 && (
          <div className="position-group">
            <h2>Defensemen</h2>
            <div className="roster-table-container">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>N</th>
                    <th>Player</th>
                    <th>Shoots</th>
                    <th>Ht</th>
                    <th>Wt</th>
                    <th>Born</th>
                    <th>Birthplace</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.defensemen.map((player, index) => (
                    <tr key={`d-${getPlayerNumber(player)}-${index}`}>
                      <td>{getPlayerNumber(player)}</td>
                      <td>
                        <img
                          src={`/assets/flags/${getNationality(player).toLowerCase()}.png`}
                          alt={getNationality(player)}
                          className="flag-icon"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </td>
                      <td>
                        {player['Player Link'] || player.player_link ? (
                          <a
                            href={player['Player Link'] || player.player_link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {getPlayerName(player)}
                          </a>
                        ) : (
                          getPlayerName(player)
                        )}
                      </td>
                      <td>{player.S || player.shoots || '-'}</td>
                      <td>{player.Ht || player.height || '-'}</td>
                      <td>{player.Wt || player.weight || '-'}</td>
                      <td>{player.Born || player.born || player.birth_year || '-'}</td>
                      <td>{player.Birthplace || player.birthplace || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredPlayers.forwards.length > 0 && (
          <div className="position-group">
            <h2>Forwards</h2>
            <div className="roster-table-container">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>N</th>
                    <th>Player</th>
                    <th>Shoots</th>
                    <th>Ht</th>
                    <th>Wt</th>
                    <th>Born</th>
                    <th>Birthplace</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.forwards.map((player, index) => (
                    <tr key={`f-${getPlayerNumber(player)}-${index}`}>
                      <td>{getPlayerNumber(player)}</td>
                      <td>
                        <img
                          src={`/assets/flags/${getNationality(player).toLowerCase()}.png`}
                          alt={getNationality(player)}
                          className="flag-icon"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </td>
                      <td>
                        {player['Player Link'] || player.player_link ? (
                          <a
                            href={player['Player Link'] || player.player_link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {getPlayerName(player)}
                          </a>
                        ) : (
                          getPlayerName(player)
                        )}
                      </td>
                      <td>{player.S || player.shoots || '-'}</td>
                      <td>{player.Ht || player.height || '-'}</td>
                      <td>{player.Wt || player.weight || '-'}</td>
                      <td>{player.Born || player.born || player.birth_year || '-'}</td>
                      <td>{player.Birthplace || player.birthplace || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {players.length === 0 && !loading && (
          <p>No player data found for the current roster.</p>
        )}
      </div>
    </div>
  );
}

export default Roster;
