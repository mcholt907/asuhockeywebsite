import React from 'react';

function RecruitCard({ recruit }) {
  // Determine watermark character
  const getWatermark = (pos) => {
    const p = (pos || '').toUpperCase();
    if (p === 'G' || p.includes('GOAL')) return 'G';
    if (p === 'D' || p.includes('DEF') || p.includes('BACK')) return 'D';
    return 'F';
  };

  const watermark = getWatermark(recruit.position);

  return (
    <div className="recruit-card-glass holo-shine">
      <div className="card-scouting-body">
        {/* Large watermark in background */}
        <div className="position-watermark">{watermark}</div>

        <div className="card-scouting-header">
          <h4>{recruit.name}</h4>
          {recruit.position && (
            <span className="card-scouting-pos-badge">{recruit.position}</span>
          )}
        </div>

        <div className="recruit-details-grid">
          <div className="detail-item">
            <span className="detail-label">Birth Year</span>
            <span className="detail-val">{recruit.birth_year || 'N/A'}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Ht / Wt</span>
            <span className="detail-val">
              {recruit.height && recruit.weight
                ? `${recruit.height} / ${recruit.weight}`
                : recruit.height || recruit.weight || 'N/A'}
            </span>
          </div>

          <div className="detail-item col-span-2">
            <span className="detail-label">Hometown</span>
            <span className="detail-val">{recruit.birthplace || 'N/A'}</span>
          </div>

          <div className="detail-item col-span-2">
            <span className="detail-label">Current Team</span>
            <span className="detail-val">
              {recruit.current_team || recruit.last_team || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {recruit.player_link && (
        <div className="card-scouting-cta">
          <a
            href={recruit.player_link}
            target="_blank"
            rel="noopener noreferrer"
            className="scouting-btn"
          >
            Elite Prospects Profile
            <span className="btn-icon">↗</span>
          </a>
        </div>
      )}
    </div>
  );
}

export default RecruitCard;
