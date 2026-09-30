// services/alumni-service.js
// EliteProspects' alumni list includes players who were once listed on a
// future ASU roster and then deferred (e.g. a 2026-27 commit now arriving in
// 2027-28). They haven't played for ASU yet, so "Where Are They Now?" drops
// anyone still committed to an upcoming class. Matched by EP player ID.

const EP_PLAYER_ID = /\/player\/(\d+)\//;

function committedRecruitIds(recruiting) {
  const ids = new Set();
  for (const players of Object.values(recruiting || {})) {
    if (!Array.isArray(players)) continue;
    for (const player of players) {
      const match = EP_PLAYER_ID.exec(player?.player_link || "");
      if (match) ids.add(match[1]);
    }
  }
  return ids;
}

function excludeCommittedRecruits(alumniData, recruiting) {
  const ids = committedRecruitIds(recruiting);
  if (!alumniData || ids.size === 0) return alumniData;

  const keep = (rows) =>
    Array.isArray(rows)
      ? rows.filter((row) => !ids.has(String(row.playerId)))
      : rows;

  return {
    ...alumniData,
    skaters: keep(alumniData.skaters),
    goalies: keep(alumniData.goalies),
  };
}

module.exports = { excludeCommittedRecruits };
