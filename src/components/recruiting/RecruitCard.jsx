import React from 'react';

function RecruitCard({ recruit }) {
  return (
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
                onError={(e) => { e.target.style.display = 'none'; }}
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
}

export default RecruitCard;
