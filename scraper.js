// Imports
const Sentry = require("@sentry/node");
const cheerio = require("cheerio");
const { saveToCache, getFromCache } = require("./server/cache/caching-system");
// In-memory cache variables (Request Coalescing)
let statsPromise = null;
let rosterPromise = null;
let standingsPromise = null;

const config = require("./config/scraper-config");
const { requestWithRetry } = require("./server/lib/request-helper");

// News and schedule scraping moved to server/scrapers/news.js and
// server/scrapers/schedule.js (Phase 6). Stats, roster and standings move in
// the next step of the same refactor.

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

async function scrapeCHNStats(forceRefresh = false) {
  const STATS_CACHE_KEY = "asu_hockey_stats";

  // 1. Check cache first (skip if forceRefresh)
  try {
    if (!forceRefresh) {
      const cachedStats = getFromCache(STATS_CACHE_KEY);
      if (cachedStats) {
        console.log("[CHN Stats Scraper] Returning cached stats data.");
        return cachedStats;
      }
    }

    // 2. Cache expired or missing. Try stale data for immediate response (SWR)
    console.log(
      "[CHN Stats Scraper] Cache expired or missing. Checking for stale data...",
    );
    const staleStats = getFromCache(STATS_CACHE_KEY, true); // ignoreExpiration = true

    if (staleStats) {
      console.log(
        "[CHN Stats Scraper] Stale stats found. Returning immediately and refreshing in background.",
      );
      // Trigger background refresh (no await) — coalescing handled inside
      (async () => {
        if (!statsPromise) {
          statsPromise = (async () => {
            try {
              const url = config.urls.chnStats(config.seasons.stats);
              const { data } = await requestWithRetry(url);
              const $ = cheerio.load(data);
              const stats = parseStatsHtml($);
              if (stats.skaters.length > 0 || stats.goalies.length > 0) {
                await saveToCache(stats, STATS_CACHE_KEY, config.cache.stats);
              }
            } catch (error) {
              console.error(
                `[Background Refresh] Stats error: ${error.message}`,
              );
            } finally {
              statsPromise = null;
            }
          })();
        }
      })();
      return staleStats;
    }
  } catch (error) {
    console.log("[CHN Stats Scraper] No valid cache found.");
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  const url = config.urls.chnStats(config.seasons.stats);
  console.log(
    `[CHN Stats Scraper] No cache found at all. Fetching from: ${url}`,
  );

  // Request Coalescing
  if (statsPromise) {
    console.log(
      "[CHN Stats Scraper] Stats scrape already in progress. Returning shared promise.",
    );
    return await statsPromise;
  }

  statsPromise = (async () => {
    const startTime = Date.now();
    try {
      const { data } = await requestWithRetry(url);
      const $ = cheerio.load(data);
      const stats = parseStatsHtml($);

      console.log(
        `[CHN Stats Scraper] Scraped ${stats.skaters.length} skaters and ${stats.goalies.length} goalies.`,
      );

      if (stats.skaters.length > 0 || stats.goalies.length > 0) {
        await saveToCache(stats, STATS_CACHE_KEY, config.cache.stats);
      }

      return stats;
    } catch (error) {
      console.error("[CHN Stats Scraper] Error scraping stats:", error.message);
      // No cache to fall back on — propagate so callers can distinguish a
      // failed scrape from a legitimately empty stats page (e.g. offseason).
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution("scraper.stats.duration", duration, {
        unit: "millisecond",
      });
      statsPromise = null;
    }
  })();

  return await statsPromise;
}

async function scrapeAndCacheRoster(cacheKey) {
  const url =
    "https://www.collegehockeynews.com/reports/roster/Arizona-State/61";
  console.log(`[CHN Roster Scraper] Attempting to fetch roster from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const players = [];

    $("table").each((i, table) => {
      const headers = [];
      $(table)
        .find("thead th")
        .each((j, th) => {
          const text = $(th).text().trim();
          headers.push(text);
        });

      // Heuristic: Check if headers contain "Name" or "Player"
      const hasName = headers.some(
        (h) => h.includes("Name") || h.includes("Player"),
      );

      if (hasName) {
        $(table)
          .find("tbody tr")
          .each((j, tr) => {
            const cells = $(tr).find("td");
            // Skip section headers (e.g. "Defensemen", "2026") which usually have 1-2 cells
            if (cells.length < 5) return;

            const row = {};
            cells.each((k, td) => {
              const header = headers[k] || `col_${k}`;
              row[header] = $(td).text().trim();
            });

            // Normalize keys
            let nameVal = row["Name"] || row["Player"];

            // Handle "Last, First" format if present
            if (nameVal && nameVal.includes(",")) {
              const parts = nameVal.split(",").map((s) => s.trim());
              if (parts.length === 2) {
                nameVal = `${parts[1]} ${parts[0]}`; // First Last
              }
            }

            if (nameVal) {
              // Clean trailing chars
              nameVal = nameVal.replace(/\s*\(\w+\)$/, "").trim();

              const playerObj = {
                Player: nameVal,
                "#": row["No."] || row["#"] || "",
                Pos: row["Pos"] || row["Pos."] || row["Position"] || "",
                "S/C": row["S/C"] || row["S"] || row["Shoots"] || "",
                Ht: row["Ht."] || row["Height"] || row["Ht"] || "-",
                Wt: row["Wt."] || row["Weight"] || row["Wt"] || "-",
                DOB: row["DOB"] || row["Born"] || "-",
                Hometown: row["Hometown"] || row["Birthplace"] || "-",
              };
              players.push(playerObj);
            }
          });
      }
    });

    console.log(`[CHN Roster Scraper] Scraped ${players.length} players.`);

    if (players.length > 0) {
      await saveToCache(players, cacheKey, config.cache.roster);
    }

    return players;
  } catch (error) {
    console.error("[CHN Roster Scraper] Error scraping roster:", error.message);
    return [];
  }
}

async function scrapeCHNRoster() {
  const ROSTER_CACHE_KEY = "asu_hockey_roster";

  // 1. Check for fresh cache
  try {
    const cachedRoster = getFromCache(ROSTER_CACHE_KEY);
    if (cachedRoster) {
      console.log("[CHN Roster Scraper] Returning cached roster data.");
      return cachedRoster;
    }

    // 2. Cache expired or missing — return stale data immediately and refresh in background (SWR)
    console.log(
      "[CHN Roster Scraper] Cache expired or missing. Checking for stale data...",
    );
    const staleRoster = getFromCache(ROSTER_CACHE_KEY, true);
    if (staleRoster) {
      console.log(
        "[CHN Roster Scraper] Stale roster found. Returning immediately and refreshing in background.",
      );
      if (!rosterPromise) {
        rosterPromise = scrapeAndCacheRoster(ROSTER_CACHE_KEY).finally(() => {
          rosterPromise = null;
        });
      }
      return staleRoster;
    }
  } catch (error) {
    console.log("[CHN Roster Scraper] No valid cache found.");
  }

  // 3. No cache (valid or stale) — must wait for live scrape
  if (rosterPromise) {
    console.log(
      "[CHN Roster Scraper] Roster scrape already in progress. Returning shared promise.",
    );
    return await rosterPromise;
  }

  rosterPromise = scrapeAndCacheRoster(ROSTER_CACHE_KEY).finally(() => {
    rosterPromise = null;
  });
  return await rosterPromise;
}

async function fetchAndCacheNCHCStandings(cacheKey) {
  const url = config.urls.nchcStandings;
  console.log(`[NCHC Standings] Fetching from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);

    const raw = $("#app").attr("data-page");
    if (!raw) throw new Error("No data-page attribute found on #app");
    const page = JSON.parse(raw);

    // NCHC conference code on USCHO is "nt"
    const nchcRows = page.props.content.data["nt"];
    if (!nchcRows || !nchcRows.length) {
      console.error("[NCHC Standings] No NCHC data found in USCHO response");
      return [];
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
    if (teams.length > 0) {
      await saveToCache(teams, cacheKey, config.cache.standings);
    }
    return teams;
  } catch (error) {
    console.error(`[NCHC Standings] Error: ${error.message}`);
    return [];
  }
}

async function scrapeNCHCStandings(forceRefresh = false) {
  const STANDINGS_CACHE_KEY = "nchc_standings";

  try {
    if (!forceRefresh) {
      const cached = getFromCache(STANDINGS_CACHE_KEY);
      if (cached) {
        console.log("[NCHC Standings] Returning cached data.");
        return cached;
      }
    }

    const stale = getFromCache(STANDINGS_CACHE_KEY, true);
    if (stale) {
      console.log(
        "[NCHC Standings] Stale data found. Returning immediately and refreshing in background.",
      );
      if (!standingsPromise) {
        standingsPromise = fetchAndCacheNCHCStandings(
          STANDINGS_CACHE_KEY,
        ).finally(() => {
          standingsPromise = null;
        });
      }
      return stale;
    }
  } catch (error) {
    console.log("[NCHC Standings] No valid cache found.");
  }

  if (standingsPromise) {
    console.log(
      "[NCHC Standings] Scrape already in progress. Returning shared promise.",
    );
    return await standingsPromise;
  }

  standingsPromise = fetchAndCacheNCHCStandings(STANDINGS_CACHE_KEY).finally(
    () => {
      standingsPromise = null;
    },
  );
  return await standingsPromise;
}

module.exports = {
  scrapeCHNStats,
  scrapeCHNRoster,
  scrapeNCHCStandings,
};
