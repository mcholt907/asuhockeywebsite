// src/pages/Recruiting.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useRecruits } from '../hooks/queries/useRecruits';
import { useTransfers } from '../hooks/queries/useTransfers';
import TransferCard from '../components/recruiting/TransferCard';
import RecruitCard from '../components/recruiting/RecruitCard';
import './Recruiting.css';

const POSITION_SECTIONS = [
  { key: 'forwards', label: 'Forwards' },
  { key: 'defense',  label: 'Defensemen' },
  { key: 'goalies',  label: 'Goalies' },
];

// Group recruits by position; sort each group alphabetically by last name.
function groupRecruits(recruits) {
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
}

function Recruiting() {
  const { data: recruitsData, isLoading: recruitsLoading, isError: recruitsError } = useRecruits();
  const { data: transfersData, isLoading: transfersLoading, isError: transfersError } = useTransfers();
  const [activeSeason, setActiveSeason] = useState(null);

  const loading = recruitsLoading || transfersLoading;
  const error = (recruitsError || transfersError) ? 'Failed to load recruiting data.' : null;

  const recruitsBySeason = useMemo(() => {
    if (!recruitsData || typeof recruitsData !== 'object') return {};
    const filtered = {};
    for (const season of Object.keys(recruitsData)) {
      filtered[season] = Array.isArray(recruitsData[season]) ? recruitsData[season] : [];
    }
    return filtered;
  }, [recruitsData]);

  const sortedSeasons = useMemo(
    () => Object.keys(recruitsBySeason).sort().reverse(),
    [recruitsBySeason]
  );

  const transfers = transfersData && (transfersData.incoming || transfersData.outgoing)
    ? transfersData
    : { incoming: [], outgoing: [] };

  useEffect(() => {
    if (!activeSeason && sortedSeasons.length > 0) {
      setActiveSeason(sortedSeasons[sortedSeasons.length - 1]);
    }
  }, [activeSeason, sortedSeasons]);

  if (loading) return <div className="page-container"><p className="loading-message">Scouting the future...</p></div>;
  if (error) return <div className="page-container"><p className="error-message">{error}</p></div>;

  const hasTransfers = (transfers.incoming?.length > 0 || transfers.outgoing?.length > 0);
  const activeRecruits = recruitsBySeason[activeSeason];
  const groups = activeRecruits && activeRecruits.length > 0 ? groupRecruits(activeRecruits) : null;

  return (
    <div className="page-container recruiting-page">
      <Helmet>
        <title>ASU Hockey Recruiting & Commits | Forks Up Pucks</title>
        <meta name="description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <meta property="og:title" content="ASU Hockey Recruiting & Commits | Forks Up Pucks" />
        <meta property="og:description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <meta property="og:url" content="https://forksuppucks.com/recruiting/" />
        <meta name="twitter:title" content="ASU Hockey Recruiting & Commits | Forks Up Pucks" />
        <meta name="twitter:description" content="ASU Sun Devils Hockey recruiting commitments, future players, and transfer portal updates for upcoming seasons." />
        <link rel="canonical" href="https://forksuppucks.com/recruiting/" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com/" },
              { "@type": "ListItem", "position": 2, "name": "Recruiting", "item": "https://forksuppucks.com/recruiting/" }
            ]
          })}
        </script>
      </Helmet>

      <div className="recruiting-header">
        <h1>ASU Hockey Recruiting & Future Commits</h1>
        <p className="subtitle">The Next Generation of Sun Devil Hockey</p>
      </div>

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

        {!groups ? (
          <div className="recruits-grid fade-in">
            <div className="no-recruits">
              <p>No commitments announced for the {activeSeason} class yet.</p>
            </div>
          </div>
        ) : (
          <div className="recruits-groups fade-in">
            {POSITION_SECTIONS.filter(s => groups[s.key].length > 0).map(s => (
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
        )}
      </section>
    </div>
  );
}

export default Recruiting;
