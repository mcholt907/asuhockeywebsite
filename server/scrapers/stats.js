// stats.js — CHN player statistics (skaters + goalies)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
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

async function scrapeStats() {
  const url = config.urls.chnStats(config.seasons.stats);
  console.log(`[CHN Stats Scraper] Fetching from: ${url}`);
  const { data } = await requestWithRetry(url);
  const $ = cheerio.load(data);
  const stats = parseStatsHtml($);
  console.log(
    `[CHN Stats Scraper] Scraped ${stats.skaters.length} skaters and ${stats.goalies.length} goalies.`,
  );
  return stats;
}

const fetchStats = createCachedScraper({
  name: "stats",
  cacheKey: "asu_hockey_stats",
  ttl: config.cache.stats,
  scrape: scrapeStats,
  // Empty is a valid offseason state — returned to callers but never cached.
  validate: (stats) => stats.skaters.length > 0 || stats.goalies.length > 0,
  // No onScrapeError: a failed scrape with no stale cache must propagate so
  // callers can distinguish failure from a legitimately empty stats page.
});

async function scrapeCHNStats(forceRefresh = false) {
  return fetchStats({ force: forceRefresh });
}

module.exports = { scrapeCHNStats };
