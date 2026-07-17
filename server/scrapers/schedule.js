// schedule.js — Sun Devils schedule API + CHN box/metrics links + USCHO record
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

const JSON_REQUEST_OPTIONS = { headers: { Accept: "application/json" } };

// Axios parses JSON responses automatically, but the Puppeteer 403-fallback
// path returns raw text — normalize both.
function asJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data;
}

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

async function scrapeScheduleWithExtras() {
  const games = await scrapeSunDevilsSchedule(config.seasons.current);
  if (!games || games.length === 0) {
    return { games: games || [], team_record: null };
  }
  const {
    games: enriched,
    npi,
    krach,
  } = await enrichScheduleWithCHNLinks(games);
  const teamRecord = await scrapeUSCHORecord();
  return { games: enriched, team_record: { ...teamRecord, npi, krach } };
}

const fetchSchedule = createCachedScraper({
  name: "schedule",
  cacheKey: () => `asu_hockey_schedule_${config.seasons.current}`,
  ttl: config.cache.schedule,
  scrape: scrapeScheduleWithExtras,
  validate: (result) => result.games.length > 0,
  // Pre-team_record cache entries were a bare games array.
  normalizeCached: (cached) =>
    Array.isArray(cached) ? { games: cached, team_record: null } : cached,
  onScrapeError: () => ({ games: [], team_record: null }),
});

async function fetchScheduleData(forceRefresh = false) {
  return fetchSchedule({ force: forceRefresh });
}

module.exports = {
  fetchScheduleData,
  scrapeSunDevilsSchedule,
  scrapeCHNScheduleLinks,
  scrapeUSCHORecord,
};
