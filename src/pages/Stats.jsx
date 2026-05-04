// src/pages/Stats.jsx
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import SortableTable from '../components/SortableTable';
import { useStats } from '../hooks/queries/useStats';
import './Stats.css';

function Stats() {
  const { data, isLoading: loading, isError } = useStats();
  const stats = {
    skaters: data?.skaters || [],
    goalies: data?.goalies || [],
  };
  const error = isError ? 'Failed to load stats data.' : '';
  const [activeTab, setActiveTab] = useState('skaters');

  // Helper to find leaders safely
  const getLeaders = (data, key, count = 3) => {
    if (!data || !Array.isArray(data)) return [];

    // Normalize key lookup (handle 'Pts' vs 'Pts.')
    const findKey = (row, k) => {
      if (row[k] !== undefined) return k;
      if (k === 'Pts' && row['Pts.'] !== undefined) return 'Pts.';
      if (k === 'Name' && row['Name, Yr'] !== undefined) return 'Name, Yr';
      return k; // Fallback
    };

    return data
      .filter(p => {
        const actualKey = findKey(p, key);
        return p && p[actualKey] !== undefined && !isNaN(parseFloat(p[actualKey]));
      })
      .sort((a, b) => {
        const kA = findKey(a, key);
        const kB = findKey(b, key);
        return parseFloat(b[kB]) - parseFloat(a[kA]);
      })
      .slice(0, count);
  };

  const TopPerformerCard = ({ title, metric, data }) => (
    <div className="leader-card">
      <h3>{title}</h3>
      <div className="leader-list">
        {data.map((player, idx) => {
          // Name extraction logic
          let name = player.Player || player['Name, Yr'] || player.Name || 'Unknown';
          if (name.includes(',')) {
            name = name.split(',')[0].trim();
          }

          // Value extraction logic
          let value = player[metric];
          if (value === undefined && metric === 'Pts') value = player['Pts.'];

          return (
            <div key={idx} className="leader-item">
              <span className="rank">{idx + 1}</span>
              <div className="player-info">
                <span className="player-name">{name}</span>
              </div>
              <span className="metric-value">{value}</span>
            </div>
          );
        })}
        {data.length === 0 && <span className="no-data">No data available</span>}
      </div>
    </div>
  );

  if (loading) return <div className="page-container"><p className="loading-message">Loading Player Stats...</p></div>;
  if (error) return <div className="page-container"><p className="error-message">{error}</p></div>;

  // Derive leaders (assuming standard headers exist, adjust if needed)
  const goalLeaders = getLeaders(stats.skaters, 'G');
  const assistLeaders = getLeaders(stats.skaters, 'A');
  const pointLeaders = getLeaders(stats.skaters, 'Pts');

  // Dynamic headers extraction
  const skaterHeaders = stats.skaters.length > 0 ? Object.keys(stats.skaters[0]) : [];
  const goalieHeaders = stats.goalies.length > 0 ? Object.keys(stats.goalies[0]) : [];

  return (
    <div className="page-container stats-page">
      <Helmet>
        <title>ASU Hockey Player Stats & Leaders | Forks Up Pucks</title>
        <meta name="description" content="ASU Sun Devils Men's Hockey player statistics, goal leaders, and analytics for the 2025-26 season." />
        <meta property="og:title" content="ASU Hockey Player Stats & Leaders | Forks Up Pucks" />
        <meta property="og:description" content="ASU Sun Devils Men's Hockey player statistics, goal leaders, and analytics for the 2025-26 season." />
        <meta property="og:url" content="https://forksuppucks.com/stats" />
        <meta name="twitter:title" content="ASU Hockey Player Stats & Leaders | Forks Up Pucks" />
        <meta name="twitter:description" content="ASU Sun Devils Men's Hockey player statistics, goal leaders, and analytics for the 2025-26 season." />
        <link rel="canonical" href="https://forksuppucks.com/stats" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
              { "@type": "ListItem", "position": 2, "name": "Stats", "item": "https://forksuppucks.com/stats" }
            ]
          })}
        </script>
      </Helmet>
      <div className="stat-lab-header">
        <h1>ASU Hockey Player Stats</h1>
        <p className="subtitle">Advanced Analytics & Team Leaders</p>
      </div>

      {/* Top Performers Section */}
      {stats.skaters.length > 0 && (
        <section className="leaders-section">
          <TopPerformerCard title="Goal Leaders" metric="G" data={goalLeaders} />
          <TopPerformerCard title="Assist Leaders" metric="A" data={assistLeaders} />
          <TopPerformerCard title="Point Leaders" metric="Pts" data={pointLeaders} />
        </section>
      )}

      {/* Data Tables */}
      <div className="stats-control-panel">
        <button
          className={`control-btn ${activeTab === 'skaters' ? 'active' : ''}`}
          onClick={() => setActiveTab('skaters')}
        >
          <span>Skaters</span>
        </button>
        <button
          className={`control-btn ${activeTab === 'goalies' ? 'active' : ''}`}
          onClick={() => setActiveTab('goalies')}
        >
          <span>Goalies</span>
        </button>
      </div>

      <div className="stats-data-view fade-in">
        {activeTab === 'skaters' && (
          <SortableTable
            data={stats.skaters}
            headers={skaterHeaders}
            defaultSortKey="Pts."
            defaultSortDir="desc"
          />
        )}
        {activeTab === 'goalies' && (
          <SortableTable
            data={stats.goalies}
            headers={goalieHeaders}
            defaultSortKey="GP"
            defaultSortDir="desc"
          />
        )}
      </div>
    </div>
  );
}

export default Stats; 