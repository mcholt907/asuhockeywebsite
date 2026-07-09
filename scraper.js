// Imports
const Sentry = require("@sentry/node");
const cheerio = require("cheerio");
const { saveToCache, getFromCache } = require("./src/scripts/caching-system");
// In-memory cache variables (Request Coalescing)
let newsPromise = null;
let schedulePromise = null;
let statsPromise = null;
let rosterPromise = null;
let standingsPromise = null;

const config = require("./config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("./utils/request-helper");

// thesundevils.com runs on the WMT Digital / Nuxt platform, which serves all
// page data from a public JSON API under /website-api/. News and schedule read
// that API instead of scraping HTML selectors, which broke on template changes
// (see docs/plans/2026-07-09-sundevils-website-api-migration.md).

const JSON_REQUEST_OPTIONS = { headers: { Accept: "application/json" } };

// Axios parses JSON responses automatically, but the Puppeteer 403-fallback
// path returns raw text — normalize both.
function asJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data;
}

// "2026-06-01T05:05:00.000000Z" → "June 01, 2026" — the display format the old
// HTML scrape produced. News.jsx renders this string raw, and the news sort
// does new Date(date), which parses it.
function formatArticleDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

async function scrapeSunDevilsNewsList() {
  const url = config.urls.sunDevilsArticles;
  console.log(`[Sun Devils News] Fetching articles API: ${url}`);
  try {
    const { data } = await requestWithRetry(url, JSON_REQUEST_OPTIONS);
    const items = asJson(data).data || [];
    const articles = [];

    for (const item of items) {
      const title = String(item.title || "").trim();
      const link = item.permalink;
      const date = formatArticleDate(item.published_at);
      if (title && link && date) {
        articles.push({ title, link, date, source: "TheSunDevils.com" });
      }
    }

    console.log(`[Sun Devils News] Scraped ${articles.length} articles.`);
    return articles;
  } catch (error) {
    console.error("[Sun Devils News] Error fetching articles:", error.message);
    return [];
  }
}

async function scrapeCHN() {
  const url = config.urls.chnNews;
  console.log(`[CHN Scraper] Attempting to fetch CHN news from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    console.log("[CHN Scraper] Successfully fetched data from URL.");
    const $ = cheerio.load(data);
    console.log("[CHN Scraper] Cheerio loaded HTML data.");
    const articles = [];
    const listItems = $("div.newslist ul li");
    console.log(
      `[CHN Scraper] Found ${listItems.length} list items with selector 'div.newslist ul li'.`,
    );

    listItems.each((i, element) => {
      const listItem = $(element);
      const linkTag = listItem.find("a");
      const title = linkTag.text().trim();
      let link = linkTag.attr("href");

      let dateText = listItem
        .contents()
        .filter(function () {
          return this.type === "text" && $(this).text().trim() !== "";
        })
        .first()
        .text()
        .trim();
      if (dateText.endsWith("—")) {
        dateText = dateText.slice(0, -1).trim();
      }

      console.log(
        `[CHN Scraper] Processing item ${i + 1}: Title '${title}', Link '${link}', Raw Date '${dateText}'`,
      );

      if (link && !link.startsWith("http")) {
        link = `https://www.collegehockeynews.com${link}`;
      }

      if (title && link && dateText) {
        articles.push({
          title,
          link,
          date: dateText || "Date not found",
          source: "CollegeHockeyNews.com",
        });
      } else {
        console.log(
          `[CHN Scraper] Skipping item ${i + 1} due to missing title, link, or date. Title: '${title}', Link: '${link}', Date: '${dateText}'`,
        );
      }
    });
    console.log(
      `[CHN Scraper] Successfully scraped ${articles.length} articles from CollegeHockeyNews.com`,
    );
    return articles;
  } catch (error) {
    console.error(
      "[CHN Scraper] Error scraping CollegeHockeyNews.com:",
      error.message,
    );
    if (error.response) {
      console.error("[CHN Scraper] Response status:", error.response.status);
    }
    return [];
  }
}

// USCHO scraper removed as per user request (latency/value trade-off)

// "2025" → "2025-26", the season slug format the schedules API uses
function seasonSlugFor(year) {
  const startYear = parseInt(String(year), 10);
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

// schedule_event_result { result: "win"|"loss"|"tie", winning_score, losing_score }
// → "W 5-3" / "L 3-6" / "T 3-3", ASU score first. Schedule.jsx splits this
// with charAt(0) / slice(2), so the exact format is load-bearing.
function formatGameResult(result) {
  if (!result || !result.result) return null;
  const letter = { win: "W", loss: "L", tie: "T" }[result.result];
  if (!letter) return null;
  const winScore = Math.round(parseFloat(result.winning_score));
  const loseScore = Math.round(parseFloat(result.losing_score));
  if (!Number.isFinite(winScore) || !Number.isFinite(loseScore)) return letter;
  const scores =
    letter === "L" ? `${loseScore}-${winScore}` : `${winScore}-${loseScore}`;
  return `${letter} ${scores}`;
}

// Map one schedule-events API entry to the game shape the frontend consumes.
// Returns null for entries missing an opponent or parseable datetime.
function mapScheduleEvent(event) {
  const opponent = String(
    event.opponent_name || (event.opponent && event.opponent.long_name) || "",
  ).trim();
  const gameDate = new Date(event.datetime);
  if (!opponent || !event.datetime || isNaN(gameDate)) return null;

  const game = {
    // en-CA formats as YYYY-MM-DD; game dates/times are Phoenix-local
    date: gameDate.toLocaleDateString("en-CA", {
      timeZone: "America/Phoenix",
    }),
    time:
      event.tba || event.is_all_day
        ? "TBA"
        : gameDate.toLocaleTimeString("en-US", {
            timeZone: "America/Phoenix",
            hour: "numeric",
            minute: "2-digit",
          }),
    opponent,
    location: [event.venue, event.location].filter(Boolean).join(", ") || "TBD",
    status:
      event.venue_type === "home"
        ? "Home"
        : event.venue_type === "away"
          ? "Away"
          : event.neutral_event
            ? "Neutral"
            : "TBD",
    notes: event.is_exhibition ? "Exhibition" : "",
    tv: "",
    radio: "",
    links: (event.schedule_event_links || [])
      .filter((l) => l && l.title && l.link)
      .map((l) => ({ text: l.title, url: l.link })),
  };

  const result = formatGameResult(event.schedule_event_result);
  if (result) game.result = result;
  return game;
}

async function scrapeSunDevilsSchedule(year) {
  const slug = seasonSlugFor(year);
  console.log(`[Schedule Scraper] Resolving schedule id for season ${slug}`);

  try {
    const { data: schedulesRaw } = await requestWithRetry(
      config.urls.sunDevilsSchedules,
      JSON_REQUEST_OPTIONS,
    );
    const schedules = asJson(schedulesRaw).data || [];
    const schedule = schedules.find((s) => s.season && s.season.slug === slug);
    if (!schedule) {
      const known = schedules
        .map((s) => s.season && s.season.slug)
        .filter(Boolean)
        .join(", ");
      throw new Error(`no schedule for season ${slug} (available: ${known})`);
    }

    console.log(
      `[Schedule Scraper] Fetching events for schedule ${schedule.id} (${slug})`,
    );
    const { data: eventsRaw } = await requestWithRetry(
      config.urls.sunDevilsScheduleEvents(schedule.id),
      JSON_REQUEST_OPTIONS,
    );
    const events = asJson(eventsRaw).data || [];

    const games = events.map(mapScheduleEvent).filter(Boolean);
    console.log(
      `[Schedule Scraper] Mapped ${games.length}/${events.length} events for ${slug}.`,
    );
    return games;
  } catch (error) {
    console.error(
      "[Schedule Scraper] Error fetching schedule API:",
      error.message,
    );
    if (error.response) {
      console.error(
        `[Schedule Scraper] Response Status: ${error.response.status}`,
      );
    }
    throw new Error(
      `Failed to fetch Sun Devils schedule for season ${slug}: ${error.message}`,
    );
  }
}

async function scrapeCHNScheduleLinks() {
  const url = config.urls.chnSchedule;
  console.log(`[CHN Schedule Links] Fetching from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const linkMap = {};

    $(`tr`).each((_, row) => {
      let boxHref = null;
      let metricsHref = null;

      $(row)
        .find(`a`)
        .each((_, a) => {
          const text = $(a).text().trim();
          const href = $(a).attr(`href`);
          if (text === `Box` && href) boxHref = href;
          if (text === `Metrics` && href) metricsHref = href;
        });

      if (boxHref) {
        if (!boxHref.startsWith("http")) {
          boxHref = `https://www.collegehockeynews.com${boxHref}`;
        }
        if (metricsHref && !metricsHref.startsWith("http")) {
          metricsHref = `https://www.collegehockeynews.com${metricsHref}`;
        }
        const match = boxHref.match(/\/box\/final\/(\d{4})(\d{2})(\d{2})\//);
        if (match) {
          const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
          linkMap[isoDate] = {
            box_link: boxHref,
            metrics_link: metricsHref || null,
          };
        }
      }
    });

    // Parse NPI and KRACH from the <small> tag inside h2.teamlabel
    let npi = null;
    let krach = null;
    const smallText = $("h2.teamlabel small").text();
    const npiMatch = smallText.match(/NPI:\s*(\d+)/);
    const krachMatch = smallText.match(/KRACH:\s*(\d+)/);
    if (npiMatch) npi = parseInt(npiMatch[1], 10);
    if (krachMatch) krach = parseInt(krachMatch[1], 10);
    console.log(
      `[CHN Schedule Links] Found links for ${Object.keys(linkMap).length} games. NPI: ${npi}, KRACH: ${krach}`,
    );
    return { linkMap, npi, krach };
  } catch (error) {
    console.error(`[CHN Schedule Links] Error: ${error.message}`);
    return { linkMap: {}, npi: null, krach: null };
  }
}

async function scrapeUSCHORecord() {
  const url = config.urls.uscho;
  console.log(`[USCHO Record] Fetching from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const raw = $("#app").attr("data-page");
    if (!raw) throw new Error("No data-page attribute found");
    const page = JSON.parse(raw);
    const r = page.props.content.record;
    return {
      overall: {
        wins: r.total.wins,
        losses: r.total.losses,
        ties: r.total.ties,
      },
      conf: {
        wins: r.conf.total.wins,
        losses: r.conf.total.losses,
        ties: r.conf.total.ties,
      },
      home: { wins: r.home.wins, losses: r.home.losses, ties: r.home.ties },
      away: { wins: r.road.wins, losses: r.road.losses, ties: r.road.ties },
    };
  } catch (error) {
    console.error(`[USCHO Record] Error: ${error.message}`);
    return null;
  }
}

async function enrichScheduleWithCHNLinks(games) {
  const { linkMap, npi, krach } = await scrapeCHNScheduleLinks();
  for (const game of games) {
    if (game.date && linkMap[game.date]) {
      game.box_link = linkMap[game.date].box_link;
      game.metrics_link = linkMap[game.date].metrics_link;
    }
  }
  return { games, npi, krach };
}

async function fetchScheduleData(forceRefresh = false) {
  const cacheKey = "asu_hockey_schedule";
  const targetSeasonStartYear = config.seasons.current;
  const fullCacheKey = cacheKey + "_" + targetSeasonStartYear;

  console.log(
    `[Cache System] Attempting to fetch schedule for season starting: ${targetSeasonStartYear}${forceRefresh ? " (force refresh)" : ""}`,
  );

  try {
    // 1. Try to get valid cache (skip if forceRefresh)
    if (!forceRefresh) {
      const cachedData = getFromCache(fullCacheKey);
      if (cachedData) {
        console.log(
          `[Cache System] Schedule data found in cache for ${targetSeasonStartYear}. Returning cached data.`,
        );
        const normalised = Array.isArray(cachedData)
          ? { games: cachedData, team_record: null }
          : cachedData;
        return normalised;
      }
    }

    // 2. Cache expired or missing. Try stale data for immediate response (SWR)
    console.log(
      `[Cache System] Cache expired or missing for ${targetSeasonStartYear}. Checking for stale data...`,
    );
    const staleData = getFromCache(fullCacheKey, true); // ignoreExpiration = true

    if (staleData) {
      console.log(
        "[Cache System] Stale schedule found. Returning immediately and refreshing in background.",
      );
      // Trigger background refresh (no await) — coalescing handled inside the IIFE
      (async () => {
        if (!schedulePromise) {
          schedulePromise = (async () => {
            try {
              const startTime = Date.now();
              const scheduleData = await scrapeSunDevilsSchedule(
                targetSeasonStartYear,
              );
              const duration = Date.now() - startTime;
              Sentry.metrics.distribution(
                "scraper.schedule.duration",
                duration,
                { unit: "millisecond" },
              );
              if (scheduleData && scheduleData.length > 0) {
                const {
                  games: enriched,
                  npi,
                  krach,
                } = await enrichScheduleWithCHNLinks(scheduleData);
                const teamRecord = await scrapeUSCHORecord();
                await saveToCache(
                  {
                    games: enriched,
                    team_record: { ...teamRecord, npi, krach },
                  },
                  fullCacheKey,
                  config.cache.schedule,
                );
              }
            } catch (error) {
              console.error(
                `[Background Refresh] Schedule error: ${error.message}`,
              );
            } finally {
              schedulePromise = null;
            }
          })();
        }
      })();
      const normalised = Array.isArray(staleData)
        ? { games: staleData, team_record: null }
        : staleData;
      return normalised;
    }
  } catch (error) {
    console.error("[Cache System] Error reading from cache:", error.message);
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  console.log(
    `[Cache System] No cache found at all for ${targetSeasonStartYear}. Scraping live data.`,
  );

  // Request Coalescing
  if (schedulePromise) {
    console.log(
      "[Cache System] Schedule scrape already in progress. Returning shared promise.",
    );
    return await schedulePromise;
  }

  schedulePromise = (async () => {
    try {
      const startTime = Date.now();
      const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution("scraper.schedule.duration", duration, {
        unit: "millisecond",
      });

      let teamRecord = null;
      if (scheduleData && scheduleData.length > 0) {
        console.log(
          `[Cache System] Successfully scraped ${scheduleData.length} games. Saving to cache for ${targetSeasonStartYear}.`,
        );
        const {
          games: enriched,
          npi,
          krach,
        } = await enrichScheduleWithCHNLinks(scheduleData);
        teamRecord = await scrapeUSCHORecord();
        teamRecord = { ...teamRecord, npi, krach };
        await saveToCache(
          { games: enriched, team_record: teamRecord },
          fullCacheKey,
          config.cache.schedule,
        );
      } else {
        console.log(
          `[Cache System] No schedule data returned from scraper for ${targetSeasonStartYear}. Not caching.`,
        );
      }
      return { games: scheduleData, team_record: teamRecord };
    } catch (error) {
      console.error(
        `[FetchScheduleData] Error fetching schedule: ${error.message}`,
      );
      return { games: [], team_record: null };
    } finally {
      schedulePromise = null;
    }
  })();

  return await schedulePromise;
}

async function fetchNewsData() {
  const ASU_HOCKEY_NEWS_CACHE_KEY = "asu_hockey_news"; // Just the base key
  const NEWS_CACHE_DURATION = config.cache.news;

  console.log(
    `[Cache System] Attempting to fetch news data with cache key: ${ASU_HOCKEY_NEWS_CACHE_KEY}`,
  );

  let cachedArticles = null;
  try {
    // 1. Try to get valid cache
    cachedArticles = await getFromCache(ASU_HOCKEY_NEWS_CACHE_KEY);
    if (cachedArticles) {
      console.log(
        "[Cache System] Valid news data found in cache. Returning cached data.",
      );
      return Array.isArray(cachedArticles)
        ? cachedArticles
        : cachedArticles.data || [];
    }

    // 2. Cache expired or missing. Try to get STALE cache for immediate response (SWR)
    console.log(
      "[Cache System] Cache expired or missing. Checking for stale collection...",
    );
    const staleArticles = await getFromCache(ASU_HOCKEY_NEWS_CACHE_KEY, true); // ignoreExpiration = true

    if (staleArticles) {
      console.log(
        "[Cache System] Stale news found. Returning immediately and refreshing in background.",
      );
      // Trigger background refresh (no await)
      refreshNewsCache(ASU_HOCKEY_NEWS_CACHE_KEY, NEWS_CACHE_DURATION).catch(
        (err) => console.error("[Background Refresh] Failed:", err),
      );
      return Array.isArray(staleArticles)
        ? staleArticles
        : staleArticles.data || [];
    }
  } catch (error) {
    console.error(
      "[Cache System] Error reading news from cache:",
      error.message,
    );
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  console.log(
    "[Cache System] No cache found at all. Scraping live news data (User must wait).",
  );

  // Request Coalescing: If a scrape is already in progress, return that promise
  if (newsPromise) {
    console.log(
      "[Cache System] News scrape already in progress. Returning shared promise.",
    );
    return await newsPromise;
  }

  // Start new scrape and store promise
  newsPromise = refreshNewsCache(
    ASU_HOCKEY_NEWS_CACHE_KEY,
    NEWS_CACHE_DURATION,
  ).finally(() => {
    newsPromise = null; // Clear promise when done
  });

  return await newsPromise;
}

// Extracted scraping logic to reused function
async function refreshNewsCache(cacheKey, duration) {
  console.log("[News Scraper] Starting live scrape...");
  const startTime = Date.now();
  try {
    const sunDevilsArticles = await scrapeSunDevilsNewsList();
    await delayBetweenRequests();
    const chnArticles = await scrapeCHN();

    let allArticles = [...sunDevilsArticles, ...chnArticles];

    if (allArticles.length > 0) {
      const uniqueArticles = [];
      const seenLinks = new Set();
      for (const article of allArticles) {
        if (article.link && !seenLinks.has(article.link)) {
          uniqueArticles.push(article);
          seenLinks.add(article.link);
        } else if (!article.link && article.title) {
          const key = `title:${article.title}`;
          if (!seenLinks.has(key)) {
            uniqueArticles.push(article);
            seenLinks.add(key);
          }
        } else if (!article.link && !article.title) {
          uniqueArticles.push(article);
        }
      }
      allArticles = uniqueArticles;
    }

    allArticles.sort((a, b) => {
      let dateA = null,
        dateB = null;
      try {
        if (a.date && a.date !== "Date not found") dateA = new Date(a.date);
      } catch (e) {
        /* ignore */
      }
      try {
        if (b.date && b.date !== "Date not found") dateB = new Date(b.date);
      } catch (e) {
        /* ignore */
      }

      if (dateA && dateB && !isNaN(dateA) && !isNaN(dateB)) {
        return dateB - dateA;
      } else if (dateA && !isNaN(dateA)) {
        return -1;
      } else if (dateB && !isNaN(dateB)) {
        return 1;
      }
      if (a.source && b.source) {
        if (a.source < b.source) return -1;
        if (a.source > b.source) return 1;
      }
      if (a.title && b.title) {
        if (a.title < b.title) return -1;
        if (a.title > b.title) return 1;
      }
      return 0;
    });

    if (allArticles.length > 0) {
      console.log(
        `[Cache System] Successfully scraped ${allArticles.length} news articles. Saving to cache.`,
      );
      await saveToCache(allArticles, cacheKey, duration);
    } else {
      console.log(
        "[Cache System] No news articles returned from scrapers. Not caching.",
      );
    }
    return allArticles;
  } catch (error) {
    console.error(
      "[FetchNewsData] Error fetching live news data:",
      error.message,
    );
    return [];
  } finally {
    const totalDuration = Date.now() - startTime;
    Sentry.metrics.distribution("scraper.news.duration", totalDuration, {
      unit: "millisecond",
    });
    console.log(`[News Scraper] Finished in ${totalDuration}ms`);
  }
}

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

// NCHC teams for identifying the correct table section
const NCHC_TEAM_NAMES = [
  "Arizona State",
  "Denver",
  "Minnesota Duluth",
  "North Dakota",
  "St. Cloud State",
  "Western Michigan",
  "Colorado College",
  "Miami",
  "Omaha",
];

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
  fetchNewsData,
  fetchScheduleData,
  scrapeSunDevilsNewsList,
  scrapeSunDevilsSchedule,
  scrapeCHNStats,
  scrapeCHNRoster,
  scrapeCHNScheduleLinks,
  scrapeUSCHORecord,
  scrapeNCHCStandings,
};
