import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useRoster } from '../hooks/queries/useRoster';
import PositionFilter from '../components/roster/PositionFilter';
import RosterPositionGroup from '../components/roster/RosterPositionGroup';
import {
  getPlayerName,
  getNationality,
  isGoalie,
  isDefenseman,
} from '../utils/playerHelpers';
import './Roster.css';

const EMPTY_GROUPS = { goaltenders: [], defensemen: [], forwards: [] };

function Roster() {
  const { data, isLoading: loading, isError } = useRoster();
  const [selectedPosition, setSelectedPosition] = useState('all');

  const players = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(
      p => p &&
        p.name &&
        (p.number && /^#?[0-9]+$/.test(String(p.number).trim()))
    );
  }, [data]);

  const playersByPosition = useMemo(() => ({
    goaltenders: players.filter(isGoalie),
    defensemen:  players.filter(p => !isGoalie(p) && isDefenseman(p)),
    forwards:    players.filter(p => !isGoalie(p) && !isDefenseman(p) && p.name),
  }), [players]);

  const filteredPlayers = useMemo(() => {
    if (selectedPosition === 'all') return playersByPosition;
    if (selectedPosition === 'g') return { ...EMPTY_GROUPS, goaltenders: playersByPosition.goaltenders };
    if (selectedPosition === 'd') return { ...EMPTY_GROUPS, defensemen:  playersByPosition.defensemen };
    if (selectedPosition === 'f') return { ...EMPTY_GROUPS, forwards:    playersByPosition.forwards };
    return playersByPosition;
  }, [selectedPosition, playersByPosition]);

  if (loading) {
    return <div className="page-container"><p>Loading roster...</p></div>;
  }

  if (isError) {
    return (
      <div className="page-container">
        <p className="error-message">Failed to load roster data. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="page-container roster-page">
      <Helmet>
        <title>ASU Hockey Team Roster 2025-2026 | Forks Up Pucks</title>
        <meta name="description" content="2025-26 ASU Sun Devils Men's Hockey team roster. Find players, positions, jersey numbers, and hometowns." />
        <meta property="og:title" content="ASU Hockey Team Roster 2025-2026 | Forks Up Pucks" />
        <meta property="og:description" content="2025-26 ASU Sun Devils Men's Hockey team roster. Find players, positions, jersey numbers, and hometowns." />
        <meta property="og:url" content="https://forksuppucks.com/roster" />
        <meta name="twitter:title" content="ASU Hockey Team Roster 2025-2026 | Forks Up Pucks" />
        <meta name="twitter:description" content="2025-26 ASU Sun Devils Men's Hockey team roster. Find players, positions, jersey numbers, and hometowns." />
        <link rel="canonical" href="https://forksuppucks.com/roster" />
        {players.length > 0 && (
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                ...players.map(player => ({
                  "@type": "Person",
                  "name": getPlayerName(player),
                  "sport": "Ice Hockey",
                  "memberOf": {
                    "@type": "SportsTeam",
                    "name": "Arizona State Sun Devils Men's Hockey"
                  },
                  ...(getNationality(player) ? { "nationality": getNationality(player) } : {})
                })),
                {
                  "@type": "BreadcrumbList",
                  "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
                    { "@type": "ListItem", "position": 2, "name": "Roster", "item": "https://forksuppucks.com/roster" }
                  ]
                }
              ]
            })}
          </script>
        )}
      </Helmet>

      <div className="page-header">
        <h1>ASU Hockey Roster (2025-2026 Season)</h1>
        <PositionFilter value={selectedPosition} onChange={setSelectedPosition} />
      </div>

      <div className="roster-content">
        <RosterPositionGroup title="Goaltenders" players={filteredPlayers.goaltenders} keyPrefix="g" />
        <RosterPositionGroup title="Defensemen"  players={filteredPlayers.defensemen}  keyPrefix="d" />
        <RosterPositionGroup title="Forwards"    players={filteredPlayers.forwards}    keyPrefix="f" />

        {players.length === 0 && (
          <p>No player data found for the current roster.</p>
        )}
      </div>
    </div>
  );
}

export default Roster;
