// src/pages/Recruiting.jsx
import React, { useState, useEffect } from 'react';
import { getRecruits } from '../services/api';
import './Recruiting.css';

function Recruiting() {
  const [recruitsBySeason, setRecruitsBySeason] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortedSeasons, setSortedSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);

  useEffect(() => {
    const fetchRecruitingData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRecruits();
        if (typeof data === 'object' && data !== null) {
          const filteredData = {};
          let seasons = Object.keys(data);

          for (const season of seasons) {
            if (Array.isArray(data[season])) {
              filteredData[season] = data[season].filter(
                recruit => recruit &&
                  recruit.name &&
                  (recruit.number === '' || recruit.number === undefined || /^[0-9]+$/.test(String(recruit.number)))
              );
            } else {
              filteredData[season] = [];
            }
          }
          setRecruitsBySeason(filteredData);
          const seasonsSorted = Object.keys(filteredData).sort().reverse();
          setSortedSeasons(seasonsSorted);
          setActiveSeason(seasonsSorted[0]);
        } else {
          setRecruitsBySeason({});
          setSortedSeasons([]);
          setError('Could not load recruiting data.');
        }
      } catch (err) {
        console.error('Error fetching recruits:', err);
        setError('Failed to load recruiting data.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecruitingData();
  }, []);

  const RecruitCard = ({ recruit }) => (
    <div className="recruit-card-wrapper">
      <div className="recruit-card">
        <div className="card-front">
          <div className="card-bg-gfx"></div>
          <div className="recruit-info">
            <h3>{recruit.name}</h3>
            <div className="stats-row">
              <span className="stat-badge">{recruit.position || 'F'}</span>
              <span className="stat-text">{recruit.height} / {recruit.weight}</span>
            </div>
            <div className="origin-row">
              <span className="label">From</span>
              <span className="value">{recruit.birthplace}</span>
            </div>
            <div className="team-row">
              <span className="label">Previous Team</span>
              <span className="value">{recruit.last_team || 'N/A'}</span>
            </div>
          </div>
          <div className="card-shine"></div>
        </div>
      </div>
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

  return (
    <div className="page-container recruiting-page">
      <div className="recruiting-header">
        <h1>Future Devils</h1>
        <p className="subtitle">The Next Generation of Sun Devil Hockey</p>
      </div>

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

      <div className="recruits-grid fade-in">
        {recruitsBySeason[activeSeason] && recruitsBySeason[activeSeason].length > 0 ? (
          recruitsBySeason[activeSeason].map((recruit, idx) => (
            <RecruitCard key={idx} recruit={recruit} />
          ))
        ) : (
          <div className="no-recruits">
            <p>No commitments announced for the {activeSeason} class yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Recruiting;
