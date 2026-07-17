// services/roster-service.js
const { scrapeCHNRoster } = require("../scrapers/roster");
const staticData = require("../../asu_hockey_data.json");

const staticPlayers = Array.isArray(staticData)
  ? staticData
  : staticData.roster || staticData.players || [];

// Lowercase, strip diacritics/punctuation — CHN and EP spell names slightly
// differently ("Nordberg" vs "Nordberg (D)", accented characters).
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Static-data lookup by player name: curated roster entries first, recruiting
// classes filling gaps (this season's freshmen live in recruiting entries).
// Name-keyed, not number-keyed — CHN lists placeholder jersey numbers early
// in the season, so number matching hands out the wrong player's data.
// Supplies:
// - player_link: EP's /search/player?q= route stopped auto-running queries,
//   so a real profile URL is the only reliable link.
// - shoots: fallback for when CHN drops the S/C column.
const staticByName = {};
function indexStaticPlayer(p) {
  if (!p || !p.name) return;
  const key = normalizeName(p.name);
  const existing = staticByName[key] || {};
  staticByName[key] = {
    player_link: existing.player_link || p.player_link || "",
    shoots: existing.shoots || p.shoots || "",
  };
}
staticPlayers.forEach(indexStaticPlayer);
for (const seasonEntries of Object.values(staticData.recruiting || {})) {
  if (Array.isArray(seasonEntries)) seasonEntries.forEach(indexStaticPlayer);
}

function determineNationality(hometown) {
  if (!hometown || hometown === "-") return "USA";

  // Token-based match avoids false positives like "Geraldton, ON" → GER
  // or "Latrobe, PA" → LAT from a naive substring check.
  const tokens = new Set(
    hometown
      .toUpperCase()
      .split(/[\s,]+/)
      .filter(Boolean),
  );

  const countryMap = {
    SVK: "SVK",
    SLOVAKIA: "SVK",
    CZE: "CZE",
    CZECH: "CZE",
    CZECHIA: "CZE",
    SWE: "SWE",
    SWEDEN: "SWE",
    FIN: "FIN",
    FINLAND: "FIN",
    RUS: "RUS",
    RUSSIA: "RUS",
    GER: "GER",
    GERMANY: "GER",
    LAT: "LAT",
    LATVIA: "LAT",
    BLR: "BLR",
    BELARUS: "BLR",
    SUI: "SUI",
    SWITZERLAND: "SUI",
    AUT: "AUT",
    AUSTRIA: "AUT",
    GBR: "GBR",
    UK: "GBR",
  };

  for (const [key, code] of Object.entries(countryMap)) {
    if (tokens.has(key)) return code;
  }

  const canadianMarkers = [
    "CAN",
    "CANADA",
    "ON",
    "QC",
    "QUE",
    "BC",
    "AB",
    "MB",
    "SK",
    "NS",
    "NB",
    "PE",
    "NL",
    "ONT",
    "MAN",
    "ALB",
    "SASK",
  ];
  if (canadianMarkers.some((m) => tokens.has(m))) return "CAN";

  return "USA";
}

async function getRoster() {
  const chnPlayers = await scrapeCHNRoster();

  return chnPlayers
    .filter((p) => p.Player)
    .map((p) => {
      const name = p.Player.trim();
      const pos = p.Pos || "";
      const hometown = p.Hometown || "";
      const cleanName = name.replace(/\s*\([A-Z]+\)\s*/i, "").trim();
      const staticEntry = staticByName[normalizeName(cleanName)] || {};

      return {
        number: p["#"] || "",
        name: pos ? `${name} (${pos})` : name,
        position: pos,
        height: p.Ht || "-",
        weight: p.Wt || "-",
        shoots: p["S/C"] || staticEntry.shoots || "-",
        born: p.DOB || "-",
        birthplace: hometown || "-",
        nationality: determineNationality(hometown),
        player_link:
          staticEntry.player_link ||
          `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(cleanName)}`,
      };
    });
}

module.exports = { determineNationality, getRoster };
