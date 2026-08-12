// standings.js — NCHC conference standings from USCHO's inertia data blob
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const {
  validateStandingsSnapshot,
  readStandingsFallback,
} = require("../services/standings-snapshot");
const { createCachedScraper } = require("./create-cached-scraper");

class StandingsNotPublishedError extends Error {
  constructor() {
    super("No NCHC data found in USCHO response");
    this.name = "StandingsNotPublishedError";
    this.code = "STANDINGS_NOT_PUBLISHED";
  }
}

function parseUSCHOStandings(html) {
  const $ = cheerio.load(html);
  const raw = $("#app").attr("data-page");
  if (!raw) throw new Error("No data-page attribute found on #app");
  const page = JSON.parse(raw);
  const nchcRows = page?.props?.content?.data?.nt;
  if (!Array.isArray(nchcRows) || nchcRows.length === 0) {
    throw new StandingsNotPublishedError();
  }
  return nchcRows.map((row, index) => {
    const team = String(row.team || "").replace(/^\d+\s+/, "").trim();
    return {
      rank: String(index + 1),
      team,
      pts: row.pts == null ? "" : String(row.pts),
      confRecord: String(row["conf-w-l-t"] || ""),
      overallRecord: String(row["w-l-t"] || ""),
      isASU: team.toLowerCase().includes("arizona"),
    };
  });
}

async function scrapeLiveNCHCStandings() {
  const { data } = await requestWithRetry(config.urls.nchcStandings);
  return {
    season: config.CURRENT_SEASON,
    lastUpdated: new Date().toISOString(),
    teams: parseUSCHOStandings(data),
  };
}

const fetchStandings = createCachedScraper({
  name: "standings",
  cacheKey: () => `nchc_standings_${config.CURRENT_SEASON}`,
  ttl: config.cache.standings,
  scrape: scrapeLiveNCHCStandings,
  validate: (snapshot) => validateStandingsSnapshot(snapshot),
  validateCached: (snapshot) =>
    snapshot?.season === config.CURRENT_SEASON &&
    validateStandingsSnapshot(snapshot),
  fallback: () => readStandingsFallback(),
});

async function scrapeNCHCStandings(
  forceRefresh = false,
  { bypassCache = false } = {},
) {
  return fetchStandings({ force: forceRefresh, bypassCache });
}

module.exports = {
  StandingsNotPublishedError,
  parseUSCHOStandings,
  scrapeLiveNCHCStandings,
  scrapeNCHCStandings,
};
