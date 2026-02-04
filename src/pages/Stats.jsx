// src/pages/Stats.jsx
import React, { useEffect, useState } from 'react';
import './Stats.css';

function Stats() {
  const [stats, setStats] = useState({ skaters: [], goalies: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('skaters');

  useEffect(() => {
    async function fetchStatsData() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        const result = await response.json();
        setStats({
          skaters: result.skaters || [],
          goalies: result.goalies || [],
        });
      } catch (err) {
        setError('Failed to load stats data.');
      } finally {
        setLoading(false);
      }
    }
    fetchStatsData();
  }, []);

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
                <span className="player-team">{player.Team || 'ASU'}</span>
              </div>
              <span className="metric-value">{value}</span>
            </div>
          );
        })}
        {data.length === 0 && <span className="no-data">No data available</span>}
      </div>
    </div>
  );

  const renderTable = (data, headers) => (
    <div className="stat-lab-table-container custom-scrollbar">
      <table className="stat-lab-table">
        <thead>
          <tr>
            {headers.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              {headers.map(h => <td key={`${h}-${idx}`}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) return <div className="page-container"><p className="loading-message">Initializing Stat Lab...</p></div>;
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
      <div className="stat-lab-header">
        <h1>Stat Lab</h1>
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
        {activeTab === 'skaters' && renderTable(stats.skaters, skaterHeaders)}
        {activeTab === 'goalies' && renderTable(stats.goalies, goalieHeaders)}
      </div>
    </div>
  );
}

export default Stats; 