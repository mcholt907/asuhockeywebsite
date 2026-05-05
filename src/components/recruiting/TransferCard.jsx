import React from 'react';
import { getDaysAgo } from '../../utils/dateHelpers';

function TransferCard({ transfer, direction }) {
  const isIncoming = direction === 'incoming';
  return (
    <div className={`transfer-card ${direction}`}>
      <div className="transfer-player-info">
        <div className="transfer-badge">
          {isIncoming ? 'JOINING' : 'LEAVING'}
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
        <span className="team-from">
          {isIncoming ? (transfer.team || 'Unknown Team') : 'Arizona State'}
        </span>
        <span className="transfer-arrow">→</span>
        <span className="team-to">
          {isIncoming ? 'Arizona State' : (transfer.team || 'Unknown Team')}
        </span>
      </div>
      {transfer.transferDate && (
        <div className="transfer-date">{getDaysAgo(transfer.transferDate)}</div>
      )}
    </div>
  );
}

export default TransferCard;
