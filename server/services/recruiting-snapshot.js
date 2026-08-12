const fs = require("fs");

function validateRecruitingSnapshot(data, seasons) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(seasons) || seasons.length === 0) return false;
  if (new Set(seasons).size !== seasons.length) return false;
  const snapshotKeys = Object.keys(data);
  if (
    snapshotKeys.length !== seasons.length ||
    snapshotKeys.some((key) => !seasons.includes(key))
  ) return false;
  let totalPlayers = 0;
  for (const season of seasons) {
    const roster = data[season];
    if (!Array.isArray(roster)) return false;
    for (const player of roster) {
      if (
        !player ||
        typeof player !== "object" ||
        typeof player.name !== "string" ||
        !player.name.trim() ||
        typeof player.player_link !== "string" ||
        !player.player_link.trim()
      ) return false;
      totalPlayers += 1;
    }
  }
  return totalPlayers > 0;
}

function readRecruitingSnapshot(filePath, seasons) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return validateRecruitingSnapshot(parsed, seasons) ? parsed : null;
  } catch (error) {
    console.warn(`[Recruiting Snapshot] Unavailable: ${error.message}`);
    return null;
  }
}

module.exports = { validateRecruitingSnapshot, readRecruitingSnapshot };
