// stats.js — CHN player statistics (skaters + goalies)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

// Helper: parse stats HTML into { skaters: [], goalies: [] }
function parseStatsHtml($) {
  const stats = { skaters: [], goalies: [] };

  const skaterTable = $("#skaters");
  const skaterHeaders = [];
  skaterTable.find("thead tr:last-child th").each((i, el) => {
    skaterHeaders.push($(el).text().trim());
  });
  skaterTable.find("tbody tr").each((i, row) => {
    const rowData = {};
    $(row)
      .find("td")
      .each((j, cell) => {
        const header = skaterHeaders[j] || `col_${j}`;
        rowData[header] = $(cell).text().trim();
      });
    stats.skaters.push(rowData);
  });

  const goalieTable = $('table:contains("Goaltending")');
  const goalieHeaders = [];
  goalieTable.find("thead tr:last-child th").each((i, el) => {
    goalieHeaders.push($(el).text().trim());
  });
  goalieTable.find("tbody tr").each((i, row) => {
    const rowData = {};
    $(row)
      .find("td")
      .each((j, cell) => {
        const header = goalieHeaders[j] || `col_${j}`;
        rowData[header] = $(cell).text().trim();
      });
    if (Object.keys(rowData).length > 0 && rowData[goalieHeaders[0]]) {
      stats.goalies.push(rowData);
    }
  });

  return stats;
}

// "20262027" -> "20252026"
function previousStatsSeason(statsSeason) {
  const startYear = parseInt(String(statsSeason).slice(0, 4), 10);
  if (isNaN(startYear)) return null;
  return `${startYear - 1}${startYear}`;
}

// "20252026" -> "2025-26"
function formatStatsSeasonLabel(statsSeason) {
  const s = String(statsSeason);
  return `${s.slice(0, 4)}-${s.slice(6)}`;
}

async function fetchSeasonStats(statsSeason) {
  const url = config.urls.chnStats(statsSeason);
  console.log(`[CHN Stats Scraper] Fetching from: ${url}`);
  const { data } = await requestWithRetry(url);
  return parseStatsHtml(cheerio.load(data));
}

// CHN's stats page has no rows between the season roll in config and the new
// season's first game, which left /stats blank all offseason. Serve the
// previous season's final stats (tagged so the UI can label them) until the
// current season has data.
async function fetchStatsWithSeasonFallback() {
  const currentSeason = config.seasons.stats;
  const stats = await fetchSeasonStats(currentSeason);
  const currentResult = {
    ...stats,
    season: formatStatsSeasonLabel(currentSeason),
    isPriorSeason: false,
  };
  if (stats.skaters.length > 0 || stats.goalies.length > 0) {
    return currentResult;
  }

  const prevSeason = previousStatsSeason(currentSeason);
  if (!prevSeason) return currentResult;

  console.log(
    `[CHN Stats Scraper] No rows for ${currentSeason} yet — trying previous season ${prevSeason}.`,
  );
  try {
    await delayBetweenRequests();
    const prevStats = await fetchSeasonStats(prevSeason);
    if (prevStats.skaters.length > 0 || prevStats.goalies.length > 0) {
      return {
        ...prevStats,
        season: formatStatsSeasonLabel(prevSeason),
        isPriorSeason: true,
      };
    }
  } catch (error) {
    // Empty current season is a valid state; a failed fallback shouldn't
    // turn it into a 500.
    console.error(
      `[CHN Stats Scraper] Previous-season fallback failed: ${error.message}`,
    );
  }
  return currentResult;
}

const fetchStats = createCachedScraper({
  name: "stats",
  cacheKey: "asu_hockey_stats",
  ttl: config.cache.stats,
  scrape: fetchStatsWithSeasonFallback,
  // Empty is a valid offseason state — returned to callers but never cached.
  validate: (stats) => stats.skaters.length > 0 || stats.goalies.length > 0,
  // No onScrapeError: a failed scrape with no stale cache must propagate so
  // callers can distinguish failure from a legitimately empty stats page.
});

async function scrapeCHNStats(forceRefresh = false) {
  return fetchStats({ force: forceRefresh });
}

module.exports = { scrapeCHNStats };
