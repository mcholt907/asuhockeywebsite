import React from 'react';
import {
  getPlayerName,
  getPlayerNumber,
  getNationality,
  getShoots,
} from '../../utils/playerHelpers';

function PlayerRow({ player, keyPrefix, index }) {
  const number = getPlayerNumber(player);
  const nationality = getNationality(player);
  const link = player['Player Link'] || player.player_link;

  return (
    <tr key={`${keyPrefix}-${number}-${index}`}>
      <td>{number}</td>
      <td>
        <img
          src={`/assets/flags/${nationality.toLowerCase()}.svg`}
          alt={nationality}
          className="flag-icon"
          loading="lazy"
          width="24"
          height="16"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </td>
      <td>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer">
            {getPlayerName(player)}
          </a>
        ) : (
          getPlayerName(player)
        )}
      </td>
      <td>{getShoots(player)}</td>
      <td>{player.Ht || player.height || '-'}</td>
      <td>{player.Wt || player.weight || '-'}</td>
      <td>{player.Born || player.born || player.birth_year || '-'}</td>
      <td>{player.Birthplace || player.birthplace || '-'}</td>
    </tr>
  );
}

function RosterPositionGroup({ title, players, keyPrefix }) {
  if (!players || players.length === 0) return null;

  return (
    <div className="position-group">
      <h2>{title}</h2>
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
            {players.map((player, index) => (
              <PlayerRow
                key={`${keyPrefix}-${getPlayerNumber(player)}-${index}`}
                player={player}
                keyPrefix={keyPrefix}
                index={index}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RosterPositionGroup;
