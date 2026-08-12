const fs = require("fs");
const path = require("path");

const DEFAULT_FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "nchc_standings_fallback.json",
);
const NCHC_TEAM_COUNT = 9;

function parseRecordGames(record) {
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(String(record || "").trim());
  return match ? Number(match[1]) + Number(match[2]) + Number(match[3]) : null;
}

function hasScalarValue(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    String(value).trim().length > 0
  );
}

function isTeam(team) {
  return Boolean(
    team &&
      hasScalarValue(team.rank) &&
      typeof team.team === "string" &&
      team.team.trim() &&
      hasScalarValue(team.pts) &&
      parseRecordGames(team.confRecord) !== null &&
      parseRecordGames(team.overallRecord) !== null &&
      typeof team.isASU === "boolean",
  );
}

function normalizeTeamName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasCompleteNCHCTable(teams) {
  if (!Array.isArray(teams) || teams.length !== NCHC_TEAM_COUNT) return false;

  const teamNames = new Set();
  const ranks = new Set();
  let asuRows = 0;

  for (const team of teams) {
    if (!isTeam(team)) return false;

    const normalizedName = normalizeTeamName(team.team);
    const rank = String(team.rank).trim();
    if (!/^[1-9]$/.test(rank)) return false;

    teamNames.add(normalizedName);
    ranks.add(Number(rank));
    if (team.isASU) asuRows += 1;
  }

  return (
    teamNames.size === NCHC_TEAM_COUNT &&
    ranks.size === NCHC_TEAM_COUNT &&
    asuRows === 1
  );
}

function hasPlayedGame(teams) {
  return Array.isArray(teams) && teams.some((team) => {
    const games = parseRecordGames(team?.overallRecord);
    return games !== null && games > 0;
  });
}

function validateStandingsSnapshot(snapshot, { requirePlayedGame = true } = {}) {
  if (!snapshot || !/^\d{4}-\d{4}$/.test(snapshot.season)) return false;
  if (!Number.isFinite(Date.parse(snapshot.lastUpdated))) return false;
  if (!hasCompleteNCHCTable(snapshot.teams)) return false;
  return !requirePlayedGame || hasPlayedGame(snapshot.teams);
}

function readStandingsFallback({
  fallbackFile = DEFAULT_FALLBACK_FILE,
  fileSystem = fs,
} = {}) {
  const snapshot = JSON.parse(fileSystem.readFileSync(fallbackFile, "utf8"));
  if (!validateStandingsSnapshot(snapshot)) {
    throw new Error("Standings fallback is incomplete or malformed");
  }
  return snapshot;
}

module.exports = {
  DEFAULT_FALLBACK_FILE,
  parseRecordGames,
  hasPlayedGame,
  validateStandingsSnapshot,
  readStandingsFallback,
};
