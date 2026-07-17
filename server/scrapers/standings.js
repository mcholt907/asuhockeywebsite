// standings.js — NCHC conference standings from USCHO's inertia data blob
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

async function scrapeStandings() {
  const url = config.urls.nchcStandings;
  console.log(`[NCHC Standings] Fetching from: ${url}`);
  const { data } = await requestWithRetry(url);
  const $ = cheerio.load(data);

  const raw = $("#app").attr("data-page");
  if (!raw) throw new Error("No data-page attribute found on #app");
  const page = JSON.parse(raw);

  // NCHC conference code on USCHO is "nt"
  const nchcRows = page.props.content.data["nt"];
  if (!nchcRows || !nchcRows.length) {
    throw new Error("No NCHC data found in USCHO response");
  }

  const teams = nchcRows.map((row, i) => {
    // Team name may include a national ranking prefix (e.g. "3 North Dakota") — strip it
    const team = row.team.replace(/^\d+\s+/, "");
    const rank = String(i + 1); // conference standing position, not national rank

    return {
      rank,
      team,
      pts: String(row.pts),
      confRecord: row["conf-w-l-t"],
      overallRecord: row["w-l-t"],
      isASU: team.toLowerCase().includes("arizona"),
    };
  });

  console.log(`[NCHC Standings] Scraped ${teams.length} teams.`);
  return teams;
}

const fetchStandings = createCachedScraper({
  name: "standings",
  cacheKey: "nchc_standings",
  ttl: config.cache.standings,
  scrape: scrapeStandings,
  validate: (teams) => teams.length > 0,
  onScrapeError: () => [],
});

async function scrapeNCHCStandings(forceRefresh = false) {
  return fetchStandings({ force: forceRefresh });
}

module.exports = { scrapeNCHCStandings };
