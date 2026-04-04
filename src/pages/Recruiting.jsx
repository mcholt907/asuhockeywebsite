// src/pages/Recruiting.jsx
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { getRecruits, getTransfers } from '../services/api';
import './Recruiting.css';

function Recruiting() {
  const [recruitsBySeason, setRecruitsBySeason] = useState({});
  const [transfers, setTransfers] = useState({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortedSeasons, setSortedSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both recruits and transfers in parallel
        const [recruitData, transferData] = await Promise.all([
          getRecruits(),
          getTransfers()
        ]);

        // Process recruit data
        if (typeof recruitData === 'object' && recruitData !== null) {
          const filteredData = {};
          let seasons = Object.keys(recruitData);

          for (const season of seasons) {
            if (Array.isArray(recruitData[season])) {
              filteredData[season] = recruitData[season];
            } else {
              filteredData[season] = [];
            }
          }
          setRecruitsBySeason(filteredData);
          const seasonsSorted = Object.keys(filteredData).sort().reverse();
          setSortedSeasons(seasonsSorted);
          setActiveSeason(seasonsSorted[seasonsSorted.length - 1]);
        } else {
          setRecruitsBySeason({});
          setSortedSeasons([]);
          setError('Could not load recruiting data.');
        }

        // Process transfer data
        if (transferData && (transferData.incoming || transferData.outgoing)) {
          setTransfers(transferData);
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load recruiting data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Group recruits by position category and sort alphabetically
  const groupRecruits = (recruits) => {
    const groups = { forwards: [], defense: [], goalies: [] };
    (recruits || []).forEach(recruit => {
      const pos = (recruit.position || '').toUpperCase();
      if (pos === 'G') groups.goalies.push(recruit);
      else if (pos === 'D') groups.defense.push(recruit);
      else groups.forwards.push(recruit);
    });
    const lastName = (name) => (name || '').trim().split(' ').slice(-1)[0];
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
    });
    return groups;
  };

  // Calculate days ago from date
  const getDaysAgo = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  // Transfer Card Component
  const TransferCard = ({ transfer, direction }) => (
    <div className={`transfer-card ${direction}`}>
      <div className="transfer-player-info">
        <div className="transfer-badge">
          {direction === 'incoming' ? 'JOINING' : 'LEAVING'}
        </div>
        <h3 className="transfer-player-name">
          <a
            href={transfer.playerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {transfer.playerName}
          </a>
        </h3>
        {transfer.position && (
          <span className="transfer-position">{transfer.position}</span>
        )}
      </div>
      <div className="transfer-team-info">
        {direction === 'incoming' ? (
          <>
            <span className="team-from">{transfer.team || 'Unknown Team'}</span>
            <span className="transfer-arrow">→</span>
            <span className="team-to">Arizona State</span>
          </>
        ) : (
          <>
            <span className="team-from">Arizona State</span>
            <span className="transfer-arrow">→</span>
            <span className="team-to">{transfer.team || 'Unknown Team'}</span>
          </>
        )}
      </div>
      {transfer.transferDate && (
        <div className="transfer-date">{getDaysAgo(transfer.transferDate)}</div>
      )}
    </div>
  );

  const RecruitCard = ({ recruit }) => (
    <div className="recruit-card-wrapper">
      <a
        className="recruit-card"
        href={recruit.player_link}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="card-front">
          <div className="card-bg-gfx"></div>
          {recruit.player_photo && (
            <div className="recruit-photo-container">
              <img
                src={recruit.player_photo}
                alt={recruit.name}
                className="recruit-photo"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="recruit-info">
            <h3>{recruit.name}</h3>
            <div className="stats-row">
              <span className="stat-badge">{recruit.position || 'F'}</span>
              <span className="stat-text">{recruit.height} / {recruit.weight}</span>
              {recruit.birth_year && <span className="stat-text">{recruit.birth_year}</span>}
            </div>
            <div className="origin-row">
              <span className="label">From</span>
              <span className="value">{recruit.birthplace}</span>
            </div>
            <div className="team-row">
              <span className="label">Current Team</span>
              <span className="value">{recruit.current_team || recruit.last_team || 'N/A'}</span>
            </div>
          </div>
          <div className="card-shine"></div>
        </div>
      </a>
      <a
        href={recruit.player_link}
        target="_blank"
        rel="noopener noreferrer"
        className="profile-link"
      >
        View Elite Prospects Profile
      </a>
    </div>
  );

  if (loading) return <div className="page-container"><p className="loading-message">Scouting the future...</p></div>;
  if (error) return <div className="page-container"><p className="error-message">{error}</p></div>;

  const hasTransfers = (transfers.incoming?.length > 0 || transfers.outgoing?.length > 0);

  return (
    <div className="page-container recruiting-page">
      <Helmet>
        <title>ASU Hockey Recruiting & Commits | Forks Up Pucks</title>
        <meta name="description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <meta property="og:title" content="ASU Hockey Recruiting & Commits | Forks Up Pucks" />
        <meta property="og:description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <meta property="og:url" content="https://forksuppucks.com/recruiting" />
        <meta name="twitter:title" content="ASU Hockey Recruiting & Commits | Forks Up Pucks" />
        <meta name="twitter:description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <link rel="canonical" href="https://forksuppucks.com/recruiting" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
              { "@type": "ListItem", "position": 2, "name": "Recruiting", "item": "https://forksuppucks.com/recruiting" }
            ]
          })}
        </script>
      </Helmet>
      <div className="recruiting-header">
        <h1>ASU Hockey Recruiting & Future Commits</h1>
        <p className="subtitle">The Next Generation of Sun Devil Hockey</p>
      </div>

      {/* Recent Transfers Section */}
      {hasTransfers && (
        <section className="transfers-section">
          <h2 className="section-title">Latest Player Movements</h2>

          <div className="transfers-grid">
            {transfers.incoming?.map((transfer, idx) => (
              <TransferCard key={`in-${idx}`} transfer={transfer} direction="incoming" />
            ))}
            {transfers.outgoing?.map((transfer, idx) => (
              <TransferCard key={`out-${idx}`} transfer={transfer} direction="outgoing" />
            ))}
          </div>
        </section>
      )}

      {/* Recruiting Classes Section */}
      <section className="recruits-section">
        <div className="season-selector">
          {sortedSeasons.map(season => (
            <button
              key={season}
              className={`season-btn ${activeSeason === season ? 'active' : ''}`}
              onClick={() => setActiveSeason(season)}
            >
              {season} Class
            </button>
          ))}
        </div>

        {(() => {
          const season = recruitsBySeason[activeSeason];
          if (!season || season.length === 0) {
            return (
              <div className="recruits-grid fade-in">
                <div className="no-recruits">
                  <p>No commitments announced for the {activeSeason} class yet.</p>
                </div>
              </div>
            );
          }
          const groups = groupRecruits(season);
          const sections = [
            { key: 'forwards', label: 'Forwards' },
            { key: 'defense', label: 'Defensemen' },
            { key: 'goalies', label: 'Goalies' },
          ];
          return (
            <div className="recruits-groups fade-in">
              {sections.filter(s => groups[s.key].length > 0).map(s => (
                <div key={s.key} className="recruit-position-group">
                  <h3 className="recruit-group-title">{s.label}</h3>
                  <div className="recruits-grid">
                    {groups[s.key].map((recruit, idx) => (
                      <RecruitCard key={idx} recruit={recruit} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}

export default Recruiting;
