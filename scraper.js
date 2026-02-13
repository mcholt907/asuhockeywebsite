// Imports
const Sentry = require('@sentry/node');
const cheerio = require('cheerio');
const { saveToCache, getFromCache } = require('./src/scripts/caching-system');
// In-memory cache variables (Request Coalescing)
let newsPromise = null;
let schedulePromise = null;
let statsPromise = null;
let rosterPromise = null;

const config = require('./config/scraper-config');
const { requestWithRetry, delayBetweenRequests } = require('./utils/request-helper');

async function scrapeSunDevilsNewsList() {
  const url = config.urls.sunDevilsNews;
  console.log(`[Sun Devils News] Attempting to fetch news from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const articles = [];

    $('tr.news-table-item').each((i, element) => {
      const row = $(element);
      const titleElement = row.find('td:first-child a');
      const title = titleElement.text().trim();
      let link = titleElement.attr('href');
      const date = row.find('td:last-child').text().trim();

      if (link && !link.startsWith('http')) {
        link = `https://thesundevils.com${link}`;
      }

      if (title && link && date) {
        articles.push({
          title,
          link,
          date,
          source: 'TheSunDevils.com',
        });
      }
    });

    console.log(`[Sun Devils News] Scraped ${articles.length} articles.`);
    return articles;
  } catch (error) {
    console.error('[Sun Devils News] Error scraping news list:', error.message);
    return [];
  }
}

// scrapeSunDevilsRSS removed (unused dead code)

async function scrapeCHN() {
  const url = config.urls.chnNews;
  console.log(`[CHN Scraper] Attempting to fetch CHN news from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    console.log('[CHN Scraper] Successfully fetched data from URL.');
    const $ = cheerio.load(data);
    console.log('[CHN Scraper] Cheerio loaded HTML data.');
    const articles = [];
    const listItems = $('div.newslist ul li');
    console.log(`[CHN Scraper] Found ${listItems.length} list items with selector 'div.newslist ul li'.`);

    listItems.each((i, element) => {
      const listItem = $(element);
      const linkTag = listItem.find('a');
      const title = linkTag.text().trim();
      let link = linkTag.attr('href');

      let dateText = listItem.contents().filter(function () {
        return this.type === 'text' && $(this).text().trim() !== '';
      }).first().text().trim();
      if (dateText.endsWith('—')) {
        dateText = dateText.slice(0, -1).trim();
      }

      console.log(`[CHN Scraper] Processing item ${i + 1}: Title '${title}', Link '${link}', Raw Date '${dateText}'`);

      if (link && !link.startsWith('http')) {
        link = `https://www.collegehockeynews.com${link}`;
      }

      if (title && link && dateText) {
        articles.push({
          title,
          link,
          date: dateText || 'Date not found',
          source: 'CollegeHockeyNews.com'
        });
      } else {
        console.log(`[CHN Scraper] Skipping item ${i + 1} due to missing title, link, or date. Title: '${title}', Link: '${link}', Date: '${dateText}'`);
      }
    });
    console.log(`[CHN Scraper] Successfully scraped ${articles.length} articles from CollegeHockeyNews.com`);
    return articles;
  } catch (error) {
    console.error('[CHN Scraper] Error scraping CollegeHockeyNews.com:', error.message);
    if (error.response) {
      console.error('[CHN Scraper] Response status:', error.response.status);
    }
    return [];
  }
}

// USCHO scraper removed as per user request (latency/value trade-off)

async function scrapeSunDevilsSchedule(year) {
  const scheduleUrl = config.urls.sunDevilsSchedule(year);
  console.log(`[Schedule Scraper] Attempting to fetch schedule from: ${scheduleUrl}`);

  try {
    const { data } = await requestWithRetry(scheduleUrl);
    console.log('[Schedule Scraper] Successfully fetched HTML data.');
    const $ = cheerio.load(data);
    console.log('[Schedule Scraper] Cheerio loaded HTML data.');

    const games = [];
    const scheduleItems = $('div.schedule-event-item');
    console.log(`[Schedule Scraper] Found ${scheduleItems.length} items with selector 'div.schedule-event-item'.`);

    const monthMap = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    scheduleItems.each((index, element) => {
      const item = $(element);
      let game = {
        date: 'TBD',
        time: 'TBD',
        opponent: 'TBD',
        location: 'TBD',
        status: 'TBD', // Home/Away
        notes: '', // For Exhibition, etc.
        tv: '',
        radio: '',
        links: []
      };

      try {
        // Date and Time
        let monthStr, dayStr, timeStr;

        // Desktop date/time
        const desktopDateBox = item.find('div.schedule-event-item__date-desktop strong.schedule-event-grid-date__box');
        if (desktopDateBox.length) {
          monthStr = desktopDateBox.find('time').eq(0).text().trim();
          dayStr = desktopDateBox.find('time').eq(1).text().trim();
        }

        const desktopTimeFooter = item.find('div.schedule-event-grid-date__footer strong.schedule-event-grid-date__time');
        if (desktopTimeFooter.length) {
          timeStr = desktopTimeFooter.first().text().trim();
        }

        // Fallback to mobile if desktop is incomplete
        if (!monthStr || !dayStr) {
          const mobileDateBox = item.find('div.schedule-event-grid-date-mobile strong.schedule-event-grid-date-mobile__box');
          if (mobileDateBox.length) {
            monthStr = mobileDateBox.find('time').eq(0).text().trim();
            dayStr = mobileDateBox.find('time.schedule-event-grid-date-mobile__day').text().trim();
          }
        }

        if (monthStr && dayStr) {
          const monthIndex = monthMap[monthStr.toLowerCase().substring(0, 3)];
          let gameYear = parseInt(String(year), 10); // Explicitly use radix 10
          // If month is Jan-Jul (indices 0-6), it's part of the *end* year of the "YYYY-YY" season
          if (typeof monthIndex === 'number' && monthIndex < config.seasonBoundary.boundaryMonth) {
            gameYear = parseInt(String(year), 10) + 1;
          }

          const parsedDate = new Date(gameYear, monthIndex, parseInt(dayStr, 10));
          if (!isNaN(parsedDate)) {
            game.date = parsedDate.toISOString().split('T')[0];
          } else {
            console.warn(`[Schedule Scraper] Could not parse date for item ${index + 1}. Month: ${monthStr}, Day: ${dayStr}, Year: ${gameYear}`);
          }
        } else {
          console.warn(`[Schedule Scraper] Missing month or day for item ${index + 1}. Month: '${monthStr}', Day: '${dayStr}'`);
        }

        if (timeStr) game.time = timeStr;

        // Result (Win/Loss/Tie and Score)
        const resultLabel = item.find('.schedule-event-grid-result__label');
        if (resultLabel.length > 0) {
          const clone = resultLabel.clone();
          clone.find('.sr-only').remove();
          const textWithoutSr = clone.text().trim(); // E.g., "W 4-1" or "L 3-6" or "T 2-2"

          if (textWithoutSr) {
            game.result = textWithoutSr.replace(/\s+/g, ' ').trim(); // Normalize spaces
          }
        }

        // Location
        game.location = item.find('.schedule-event-item__location').text().trim() || 'TBD';

        // Opponent and Home/Away Status
        const opponentNameElement = item.find('strong.schedule-default-event__name');
        let fullOpponentText = opponentNameElement.text().trim();
        const statusDivider = item.find('strong.schedule-default-event__divider').text().trim().toLowerCase();

        if (statusDivider === 'vs.') {
          game.status = 'Home';
          game.opponent = fullOpponentText.replace(/^vs\.\s*/i, '').trim();
        } else if (statusDivider === 'at') {
          game.status = 'Away';
          game.opponent = fullOpponentText.replace(/^at\s*/i, '').trim();
        } else { // No 'vs.' or 'at' divider, assume it's part of the name or a non-game event description
          game.opponent = fullOpponentText;
        }

        if (item.text().toLowerCase().includes('exhibition')) {
          game.notes = 'Exhibition';
          // Clean opponent name if "Exhibition" was part of it (e.g. "vs. Opponent (Exhibition)")
          game.opponent = game.opponent.replace(/\s*\(exhibition\)/i, '').trim();
        }

        // Links (e.g., Event Details, Tickets)
        const foundLinks = new Set();
        item.find('a.schedule-event-item__link').each((_, linkEl) => {
          const linkTitle = $(linkEl).text().trim();
          let linkUrl = $(linkEl).attr('href');

          if (linkUrl && !linkUrl.startsWith('http')) {
            linkUrl = `https://thesundevils.com${linkUrl}`;
          }

          if (linkTitle && linkUrl && !foundLinks.has(linkUrl)) {
            game.links.push({ text: linkTitle, url: linkUrl });
            foundLinks.add(linkUrl);
          }
        });

        if (game.opponent && game.opponent !== 'TBD' && game.date !== 'TBD') {
          games.push(game);
        } else {
          console.warn(`[Schedule Scraper] Skipping item ${index + 1} due to missing critical info (opponent/date). Opponent: ${game.opponent}, Date: ${game.date}`);
        }

      } catch (e) {
        console.error(`[Schedule Scraper] Error parsing game item ${index + 1}: `, e.message);
        console.log("[Schedule Scraper] Problematic item HTML:", item.html());
      }
    });

    console.log(`[Schedule Scraper] Scraped ${games.length} games successfully.`);
    if (games.length === 0 && scheduleItems.length > 0) {
      console.warn("[Schedule Scraper] Selector found items, but no games parsed. Check parsing logic/HTML.");
    } else if (games.length === 0 && scheduleItems.length === 0) {
      console.warn("[Schedule Scraper] Main selector 'div.schedule-event-item' found no items.");
    }
    return games;

  } catch (error) {
    console.error('[Schedule Scraper] Error fetching or parsing schedule page:', error.message);
    if (error.response) {
      console.error(`[Schedule Scraper] Response Status: ${error.response.status}`);
    }
    throw new Error('Failed to scrape schedule data or no data found.');
  }
}

async function fetchScheduleData() {
  const cacheKey = 'asu_hockey_schedule';
  const targetSeasonStartYear = config.seasons.current;
  const fullCacheKey = cacheKey + '_' + targetSeasonStartYear;

  console.log(`[Cache System] Attempting to fetch schedule for season starting: ${targetSeasonStartYear}`);

  try {
    // 1. Try to get valid cache
    const cachedData = getFromCache(fullCacheKey);
    if (cachedData) {
      console.log(`[Cache System] Schedule data found in cache for ${targetSeasonStartYear}. Returning cached data.`);
      return cachedData;
    }

    // 2. Cache expired or missing. Try stale data for immediate response (SWR)
    console.log(`[Cache System] Cache expired or missing for ${targetSeasonStartYear}. Checking for stale data...`);
    const staleData = getFromCache(fullCacheKey, true); // ignoreExpiration = true

    if (staleData) {
      console.log('[Cache System] Stale schedule found. Returning immediately and refreshing in background.');
      // Trigger background refresh (no await) — coalescing handled inside the IIFE
      (async () => {
        if (!schedulePromise) {
          schedulePromise = (async () => {
            try {
              const startTime = Date.now();
              const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
              const duration = Date.now() - startTime;
              Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });
              if (scheduleData && scheduleData.length > 0) {
                await saveToCache(scheduleData, fullCacheKey);
              }
            } catch (error) {
              console.error(`[Background Refresh] Schedule error: ${error.message}`);
            } finally {
              schedulePromise = null;
            }
          })();
        }
      })();
      return staleData;
    }
  } catch (error) {
    console.error('[Cache System] Error reading from cache:', error.message);
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  console.log(`[Cache System] No cache found at all for ${targetSeasonStartYear}. Scraping live data.`);

  // Request Coalescing
  if (schedulePromise) {
    console.log('[Cache System] Schedule scrape already in progress. Returning shared promise.');
    return await schedulePromise;
  }

  schedulePromise = (async () => {
    try {
      const startTime = Date.now();
      const scheduleData = await scrapeSunDevilsSchedule(targetSeasonStartYear);
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution('scraper.schedule.duration', duration, { unit: 'millisecond' });

      if (scheduleData && scheduleData.length > 0) {
        console.log(`[Cache System] Successfully scraped ${scheduleData.length} games. Saving to cache for ${targetSeasonStartYear}.`);
        await saveToCache(scheduleData, fullCacheKey);
      } else {
        console.log(`[Cache System] No schedule data returned from scraper for ${targetSeasonStartYear}. Not caching.`);
      }
      return scheduleData;
    } catch (error) {
      console.error(`[FetchScheduleData] Error fetching schedule: ${error.message}`);
      return [];
    } finally {
      schedulePromise = null;
    }
  })();

  return await schedulePromise;
}

async function fetchNewsData() {
  const ASU_HOCKEY_NEWS_CACHE_KEY = 'asu_hockey_news'; // Just the base key
  const NEWS_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

  console.log(`[Cache System] Attempting to fetch news data with cache key: ${ASU_HOCKEY_NEWS_CACHE_KEY}`);

  let cachedArticles = null;
  try {
    // 1. Try to get valid cache
    cachedArticles = await getFromCache(ASU_HOCKEY_NEWS_CACHE_KEY);
    if (cachedArticles) {
      console.log('[Cache System] Valid news data found in cache. Returning cached data.');
      return Array.isArray(cachedArticles) ? cachedArticles : (cachedArticles.data || []);
    }

    // 2. Cache expired or missing. Try to get STALE cache for immediate response (SWR)
    console.log('[Cache System] Cache expired or missing. Checking for stale collection...');
    const staleArticles = await getFromCache(ASU_HOCKEY_NEWS_CACHE_KEY, true); // ignoreExpiration = true

    if (staleArticles) {
      console.log('[Cache System] Stale news found. Returning immediately and refreshing in background.');
      // Trigger background refresh (no await)
      refreshNewsCache(ASU_HOCKEY_NEWS_CACHE_KEY, NEWS_CACHE_DURATION).catch(err =>
        console.error('[Background Refresh] Failed:', err)
      );
      return Array.isArray(staleArticles) ? staleArticles : (staleArticles.data || []);
    }

  } catch (error) {
    console.error('[Cache System] Error reading news from cache:', error.message);
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  console.log('[Cache System] No cache found at all. Scraping live news data (User must wait).');

  // Request Coalescing: If a scrape is already in progress, return that promise
  if (newsPromise) {
    console.log('[Cache System] News scrape already in progress. Returning shared promise.');
    return await newsPromise;
  }

  // Start new scrape and store promise
  newsPromise = refreshNewsCache(ASU_HOCKEY_NEWS_CACHE_KEY, NEWS_CACHE_DURATION)
    .finally(() => {
      newsPromise = null; // Clear promise when done
    });

  return await newsPromise;
}

// Extracted scraping logic to reused function
async function refreshNewsCache(cacheKey, duration) {
  console.log('[News Scraper] Starting live scrape...');
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
      let dateA = null, dateB = null;
      try { if (a.date && a.date !== 'Date not found') dateA = new Date(a.date); } catch (e) { /* ignore */ }
      try { if (b.date && b.date !== 'Date not found') dateB = new Date(b.date); } catch (e) { /* ignore */ }

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
      console.log(`[Cache System] Successfully scraped ${allArticles.length} news articles. Saving to cache.`);
      await saveToCache(allArticles, cacheKey, duration);
    } else {
      console.log('[Cache System] No news articles returned from scrapers. Not caching.');
    }
    return allArticles;
  } catch (error) {
    console.error('[FetchNewsData] Error fetching live news data:', error.message);
    return [];
  } finally {
    const totalDuration = Date.now() - startTime;
    Sentry.metrics.distribution('scraper.news.duration', totalDuration, { unit: 'millisecond' });
    console.log(`[News Scraper] Finished in ${totalDuration}ms`);
  }
}

// Helper: parse stats HTML into { skaters: [], goalies: [] }
function parseStatsHtml($) {
  const stats = { skaters: [], goalies: [] };

  const skaterTable = $('#skaters');
  const skaterHeaders = [];
  skaterTable.find('thead tr:last-child th').each((i, el) => {
    skaterHeaders.push($(el).text().trim());
  });
  skaterTable.find('tbody tr').each((i, row) => {
    const rowData = {};
    $(row).find('td').each((j, cell) => {
      const header = skaterHeaders[j] || `col_${j}`;
      rowData[header] = $(cell).text().trim();
    });
    stats.skaters.push(rowData);
  });

  const goalieTable = $('table:contains("Goaltending")');
  const goalieHeaders = [];
  goalieTable.find('thead tr:last-child th').each((i, el) => {
    goalieHeaders.push($(el).text().trim());
  });
  goalieTable.find('tbody tr').each((i, row) => {
    const rowData = {};
    $(row).find('td').each((j, cell) => {
      const header = goalieHeaders[j] || `col_${j}`;
      rowData[header] = $(cell).text().trim();
    });
    if (Object.keys(rowData).length > 0 && rowData[goalieHeaders[0]]) {
      stats.goalies.push(rowData);
    }
  });

  return stats;
}

async function scrapeCHNStats() {
  const STATS_CACHE_KEY = 'asu_hockey_stats';

  // 1. Check cache first
  try {
    const cachedStats = getFromCache(STATS_CACHE_KEY);
    if (cachedStats) {
      console.log('[CHN Stats Scraper] Returning cached stats data.');
      return cachedStats;
    }

    // 2. Cache expired or missing. Try stale data for immediate response (SWR)
    console.log('[CHN Stats Scraper] Cache expired or missing. Checking for stale data...');
    const staleStats = getFromCache(STATS_CACHE_KEY, true); // ignoreExpiration = true

    if (staleStats) {
      console.log('[CHN Stats Scraper] Stale stats found. Returning immediately and refreshing in background.');
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
                await saveToCache(stats, STATS_CACHE_KEY);
              }
            } catch (error) {
              console.error(`[Background Refresh] Stats error: ${error.message}`);
            } finally {
              statsPromise = null;
            }
          })();
        }
      })();
      return staleStats;
    }
  } catch (error) {
    console.log('[CHN Stats Scraper] No valid cache found.');
  }

  // 3. No cache (valid or stale) found. Must wait for scrape.
  const url = config.urls.chnStats(config.seasons.stats);
  console.log(`[CHN Stats Scraper] No cache found at all. Fetching from: ${url}`);

  // Request Coalescing
  if (statsPromise) {
    console.log('[CHN Stats Scraper] Stats scrape already in progress. Returning shared promise.');
    return await statsPromise;
  }

  statsPromise = (async () => {
    const startTime = Date.now();
    try {
      const { data } = await requestWithRetry(url);
      const $ = cheerio.load(data);
      const stats = parseStatsHtml($);

      console.log(`[CHN Stats Scraper] Scraped ${stats.skaters.length} skaters and ${stats.goalies.length} goalies.`);

      if (stats.skaters.length > 0 || stats.goalies.length > 0) {
        await saveToCache(stats, STATS_CACHE_KEY);
      }

      return stats;
    } catch (error) {
      console.error('[CHN Stats Scraper] Error scraping stats:', error.message);
      return { skaters: [], goalies: [] };
    } finally {
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution('scraper.stats.duration', duration, { unit: 'millisecond' });
      statsPromise = null;
    }
  })();

  return await statsPromise;
}

async function scrapeCHNRoster() {
  const ROSTER_CACHE_KEY = 'asu_hockey_roster';

  // Check cache first
  try {
    const cachedRoster = getFromCache(ROSTER_CACHE_KEY);
    if (cachedRoster) {
      console.log('[CHN Roster Scraper] Returning cached roster data.');
      return cachedRoster;
    }
  } catch (error) {
    console.log('[CHN Roster Scraper] No valid cache found.');
  }

  // Request Coalescing
  if (rosterPromise) {
    console.log('[CHN Roster Scraper] Roster scrape already in progress. Returning shared promise.');
    return await rosterPromise;
  }

  rosterPromise = (async () => {
    const url = 'https://www.collegehockeynews.com/reports/roster/Arizona-State/61';
    console.log(`[CHN Roster Scraper] Attempting to fetch roster from: ${url}`);
    try {
      const { data } = await requestWithRetry(url);
      const $ = cheerio.load(data);
      const players = [];

      $('table').each((i, table) => {
        const headers = [];
        $(table).find('thead th').each((j, th) => {
          const text = $(th).text().trim();
          headers.push(text);
        });

        // Heuristic: Check if headers contain "Name" or "Player"
        const hasName = headers.some(h => h.includes('Name') || h.includes('Player'));

        if (hasName) {
          $(table).find('tbody tr').each((j, tr) => {
            const cells = $(tr).find('td');
            // Skip section headers (e.g. "Defensemen", "2026") which usually have 1-2 cells
            if (cells.length < 5) return;

            const row = {};
            cells.each((k, td) => {
              const header = headers[k] || `col_${k}`;
              row[header] = $(td).text().trim();
            });

            // Normalize keys
            let nameVal = row['Name'] || row['Player'];

            // Handle "Last, First" format if present
            if (nameVal && nameVal.includes(',')) {
              const parts = nameVal.split(',').map(s => s.trim());
              if (parts.length === 2) {
                nameVal = `${parts[1]} ${parts[0]}`; // First Last
              }
            }

            if (nameVal) {
              // Clean trailing chars
              nameVal = nameVal.replace(/\s*\(\w+\)$/, '').trim();

              const playerObj = {
                Player: nameVal,
                '#': row['No.'] || row['#'] || '',
                Pos: row['Pos'] || row['Pos.'] || row['Position'] || '',
                Ht: row['Ht.'] || row['Height'] || row['Ht'] || '-',
                Wt: row['Wt.'] || row['Weight'] || row['Wt'] || '-',
                DOB: row['DOB'] || row['Born'] || '-',
                Hometown: row['Hometown'] || row['Birthplace'] || '-'
              };
              players.push(playerObj);
            }
          });
        }
      });

      console.log(`[CHN Roster Scraper] Scraped ${players.length} players.`);

      // Save to cache (24 hours default)
      if (players.length > 0) {
        await saveToCache(players, ROSTER_CACHE_KEY);
      }

      return players;
    } catch (error) {
      console.error('[CHN Roster Scraper] Error scraping roster:', error.message);
      return [];
    } finally {
      rosterPromise = null;
    }
  })();

  return await rosterPromise;
}

module.exports = { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster };
