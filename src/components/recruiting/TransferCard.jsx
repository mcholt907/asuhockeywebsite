import React from 'react';
import { getDaysAgo } from '../../utils/dateHelpers';

// MANUAL DATA — must be updated whenever incoming transfers change.
// EliteProspects' transfers listing page (what transfer-scraper.js parses) does
// not expose birth years, so they're maintained here by playerId. After every
// `npm run refresh-transfers`, add entries for any new incoming player; players
// missing from this map simply render without a birth year (no error).
const TRANSFER_BIRTH_YEARS = {
  "538376": "2003", // Jack O'Brien
  "710109": "2005", // Jack Willson
  "658439": "2004", // Olivier Houde
  "645475": "2004", // Hunter Hady
  "634828": "2004", // Cade Littler
  "701600": "2005", // Sam Hillebrandt
  "618481": "2005", // Daniel Shlaine
  "639682": "2004", // Ben Muthersbaugh
  "642746": "2005", // Rylan Brown
  "475836": "2003", // Nic Chin-Degraves
  "643091": "2004", // Filip Nordberg
  "640785": "2004", // Matthew Mayich
  "597734": "2006", // Jonas Woo
  "934676": "2009", // Colton Lien
};

function TransferCard({ transfer, direction }) {
  const isIncoming = direction === 'incoming';

  // Scraper emits single-letter codes (F/D/G); first char also normalizes any
  // full-word position (e.g. "Forward" -> "F") defensively.
  const posCode = (transfer.position || '').trim().toUpperCase().charAt(0);
  const birthYear = isIncoming ? (TRANSFER_BIRTH_YEARS[transfer.playerId] || '') : '';

  return (
    <div className={`transfer-card-glass holo-shine ${direction}`}>
      <div className="transfer-header">
        {transfer.transferDate && (
          <span className="transfer-time">{getDaysAgo(transfer.transferDate)}</span>
        )}
      </div>

      <h3>
        {transfer.playerUrl ? (
          <a href={transfer.playerUrl} target="_blank" rel="noopener noreferrer">
            {transfer.playerName}
          </a>
        ) : (
          transfer.playerName
        )}
      </h3>

      <div className="transfer-meta">
        {posCode && (
          <span className="transfer-pos-badge">{posCode}</span>
        )}
        {birthYear && (
          <span className="transfer-pos-badge">{birthYear}</span>
        )}
      </div>

      <div className="transfer-flow-simplified">
        <span className="flow-team-val">{transfer.team || 'Unknown Team'}</span>
      </div>
    </div>
  );
}

export default TransferCard;
