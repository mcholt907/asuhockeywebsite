// Field-name normalizers for roster players.
// Player records arrive from two sources (CHN scrape + static asu_hockey_data.json)
// with overlapping but inconsistent field names. These helpers pick whichever
// field is populated.

export const getPlayerName = (p) => p?.name || p?.Player || 'Unknown';

export const getPlayerNumber = (p) => p?.number || p?.['#'] || '-';

export const getNationality = (p) => p?.nationality || p?.Nationality || 'USA';

// CHN sometimes drops shoots/catches as the literal string "-"; treat that as blank.
export const getShoots = (p) => {
  const val = p?.S || p?.shoots || '';
  return val === '-' ? '' : val;
};

const positionMatches = (p, code) => {
  const pos = (p?.position || '').toUpperCase();
  const name = p?.name || '';
  return pos === code || name.includes(`(${code})`);
};

export const isGoalie = (p) => positionMatches(p, 'G');
export const isDefenseman = (p) => positionMatches(p, 'D');
