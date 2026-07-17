// services/roster-service.js
const { scrapeCHNRoster } = require("../scrapers/roster");
const staticData = require("../../asu_hockey_data.json");

// Build a lookup of shoots by jersey number from static data (fallback for when CHN drops the column)
const staticByNumber = {};
const staticPlayers = Array.isArray(staticData)
  ? staticData
  : staticData.roster || staticData.players || [];
staticPlayers.forEach((p) => {
  const num = String(p.number || "")
    .replace("#", "")
    .trim();
  if (num) staticByNumber[num] = p;
});

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

// Direct EP profile links by player name, from the curated roster plus all
// recruiting classes (this season's freshmen live in recruiting entries).
// EP's /search/player?q= route stopped auto-running queries, so a real
// profile URL is the only reliable link.
const epLinkByName = {};
for (const p of staticPlayers) {
  if (p.player_link && p.name)
    epLinkByName[normalizeName(p.name)] = p.player_link;
}
for (const seasonEntries of Object.values(staticData.recruiting || {})) {
  if (!Array.isArray(seasonEntries)) continue;
  for (const p of seasonEntries) {
    if (p.player_link && p.name)
      epLinkByName[normalizeName(p.name)] = p.player_link;
  }
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

      return {
        number: p["#"] || "",
        name: pos ? `${name} (${pos})` : name,
        position: pos,
        height: p.Ht || "-",
        weight: p.Wt || "-",
        shoots:
          p["S/C"] ||
          staticByNumber[String(p["#"] || "").trim()]?.shoots ||
          "-",
        born: p.DOB || "-",
        birthplace: hometown || "-",
        nationality: determineNationality(hometown),
        player_link:
          epLinkByName[normalizeName(cleanName)] ||
          `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(cleanName)}`,
      };
    });
}

module.exports = { determineNationality, getRoster };
