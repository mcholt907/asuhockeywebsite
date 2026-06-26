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
    if (pos === 'G' || pos.includes('GOAL')) groups.goalies.push(recruit);
    else if (pos === 'D' || pos.includes('DEF') || pos.includes('BACK')) groups.defense.push(recruit);
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
  const [positionFilter, setPositionFilter] = useState('all');

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

  const activeRecruits = recruitsBySeason[activeSeason] || [];

  // Apply position filtering
  const filteredRecruits = useMemo(() => {
    return activeRecruits.filter(recruit => {
      // Position filter
      if (positionFilter === 'all') return true;
      const pos = (recruit.position || '').toUpperCase();
      const isGoalie = pos === 'G' || pos.includes('GOAL');
      const isDefense = pos === 'D' || pos.includes('DEF') || pos.includes('BACK');
      const isForward = !isGoalie && !isDefense;

      if (positionFilter === 'forwards') return isForward;
      if (positionFilter === 'defense') return isDefense;
      if (positionFilter === 'goalies') return isGoalie;

      return true;
    });
  }, [activeRecruits, positionFilter]);

  const groups = useMemo(() => {
    return filteredRecruits.length > 0 ? groupRecruits(filteredRecruits) : null;
  }, [filteredRecruits]);

  if (loading) return <div className="recruiting-page recruiting-status"><p className="loading-message">Scouting the future...</p></div>;
  if (error) return <div className="recruiting-page recruiting-status"><p className="error-message">{error}</p></div>;

  const hasTransfers = (transfers.incoming?.length > 0 || transfers.outgoing?.length > 0);
  const isFiltered = positionFilter !== 'all';
  const visibleSections = POSITION_SECTIONS.filter(s => {
    if (positionFilter !== 'all' && s.key !== positionFilter) return false;
    return groups && groups[s.key] && groups[s.key].length > 0;
  });

  return (
    <div className="recruiting-page">
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

      {/* Simplified Clean Header Section */}
      <div className="recruiting-header">
        <p className="subtitle">The Next Generation of Sun Devil Hockey</p>
        <h1>ASU Hockey Recruiting & Future Commits</h1>
      </div>

      {hasTransfers && (
        <>
          <section className="transfers-section">
            <div className="section-header">
              <h2>Transfer Portal Activity</h2>
            </div>

            {transfers.incoming?.length > 0 && (
              <div className="transfer-sub-section">
                <h3 className="transfer-sub-title incoming-title">Incoming Commits</h3>
                <div className="transfers-grid">
                  {transfers.incoming.map((transfer, idx) => (
                    <TransferCard key={`in-${idx}`} transfer={transfer} direction="incoming" />
                  ))}
                </div>
              </div>
            )}

            {transfers.outgoing?.length > 0 && (
              <div className="transfer-sub-section">
                <h3 className="transfer-sub-title outgoing-title">Outgoing Departures</h3>
                <div className="transfers-grid">
                  {transfers.outgoing.map((transfer, idx) => (
                    <TransferCard key={`out-${idx}`} transfer={transfer} direction="outgoing" />
                  ))}
                </div>
              </div>
            )}
          </section>
          <div className="section-divider" />
        </>
      )}

      <section className="recruits-section">
        <h2>Future Commits</h2>

        {/* Controls Bar: Class Tabs and Position Filters */}
        <div className="controls-bar">
          {/* Class selector tabs */}
          <div className="class-tabs">
            {sortedSeasons.map(season => (
              <button
                key={season}
                className={`tab-btn ${activeSeason === season ? 'active' : ''}`}
                onClick={() => {
                  setActiveSeason(season);
                  setPositionFilter('all'); // Reset filter when switching classes
                }}
              >
                {season} Class
              </button>
            ))}
          </div>

          {/* Position Filter Pills */}
          <div className="pos-filter-group">
            <button
              className={`filter-btn ${positionFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPositionFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${positionFilter === 'forwards' ? 'active' : ''}`}
              onClick={() => setPositionFilter('forwards')}
            >
              Forwards
            </button>
            <button
              className={`filter-btn ${positionFilter === 'defense' ? 'active' : ''}`}
              onClick={() => setPositionFilter('defense')}
            >
              Defense
            </button>
            <button
              className={`filter-btn ${positionFilter === 'goalies' ? 'active' : ''}`}
              onClick={() => setPositionFilter('goalies')}
            >
              Goalies
            </button>
          </div>
        </div>

        {/* Recruits Grid grouped by Position */}
        {!groups || visibleSections.length === 0 ? (
          <div className="no-recruits-panel">
            <p>
              {isFiltered
                ? 'No commitments match the selected position filter.'
                : `No commitments announced for the ${activeSeason} class yet.`}
            </p>
          </div>
        ) : (
          <div className="recruits-groups">
            {visibleSections.map(s => (
              <div key={s.key} className="recruit-position-group">
                <div className="position-group-title">
                  <h3>{s.label}</h3>
                  <div className="position-group-line" />
                </div>
                <div className="recruits-grid">
                  {groups[s.key].map((recruit, idx) => (
                    <RecruitCard key={`${s.key}-${idx}`} recruit={recruit} />
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
