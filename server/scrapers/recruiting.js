// recruiting.js — EliteProspects future-season roster scrape (recruiting
// tracker). fetchRecruitingData feeds local curation scripts; the live
// /api/recruits endpoint reads asu_hockey_data.json directly.
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const config = require("../../config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");
const { reportScrapeHealth } = require("../cache/scrape-health");
const {
  validateRecruitingSnapshot,
  readRecruitingSnapshot,
} = require("../services/recruiting-snapshot");

const CACHE_TTL = 24 * 60 * 60 * 1000;
const FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "asu_recruiting_fallback.json",
);
let fallbackCache = { mtimeMs: 0, value: null };

class RecruitingDataUnavailableError extends Error {
  constructor(cause) {
    super("Recruiting data is unavailable");
    this.name = "RecruitingDataUnavailableError";
    this.code = "RECRUITING_DATA_UNAVAILABLE";
    this.cause = cause;
  }
}

class InvalidRecruitingSnapshotError extends Error {
  constructor() {
    super("Recruiting snapshot is incomplete or malformed");
    this.name = "InvalidRecruitingSnapshotError";
    this.code = "INVALID_RECRUITING_SNAPSHOT";
  }
}

function getFallbackRecruitingData() {
  try {
    const stat = fs.statSync(FALLBACK_FILE);
    if (fallbackCache.value && fallbackCache.mtimeMs === stat.mtimeMs) {
      return fallbackCache.value;
    }
    const value = readRecruitingSnapshot(
      FALLBACK_FILE,
      config.FUTURE_SEASONS,
    );
    if (value) fallbackCache = { mtimeMs: stat.mtimeMs, value };
    return value;
  } catch (error) {
    console.warn(`[Recruiting] Fallback unavailable: ${error.message}`);
    return null;
  }
}

function shouldUseFallbackOnly() {
  return process.env.NODE_ENV === "production" || process.env.IS_PRERENDER === "true";
}

/**
 * Scrapes player photo and current team from a single Elite Prospects profile page visit
 * @param {string} playerLink - Full URL to player's Elite Prospects profile
 * @returns {{ player_photo: string, current_team: string }}
 */
async function scrapePlayerProfile(playerLink) {
  if (!playerLink) return { player_photo: "", current_team: "" };

  try {
    console.log(`[Profile Scraper] Fetching profile from: ${playerLink}`);
    const { data } = await requestWithRetry(playerLink);
    const $ = cheerio.load(data);

    // --- Photo ---
    let player_photo = "";
    // Structural selectors first — EP's hashed CSS-module classes
    // (ProfileImage_*) rotate on redeploys and have broken before.
    // Scope to the profile header region when possible so a "related
    // players" widget can't supply the wrong player's image.
    const photoEl =
      $(
        '[class*="ProfileHeader"], [class*="PlayerHeader"], [class*="PlayerInfo"]',
      )
        .find('img[src*="files.eliteprospects.com/layout/players"]')
        .first()
        .attr("src") ||
      $('img[src*="files.eliteprospects.com/layout/players"]')
        .first()
        .attr("src") ||
      $(".ProfileImage_profileImage__JLd31").attr("src") ||
      $('img[alt*="player"]').first().attr("src");
    if (photoEl) {
      player_photo = photoEl.startsWith("http")
        ? photoEl
        : `https://www.eliteprospects.com${photoEl}`;
      console.log(`[Profile Scraper] Found photo: ${player_photo}`);
    }

    // --- Current Team ---
    // EP shows current team as a link in the player info header
    // e.g. "#31 Bismarck Bobcats / NAHL - 25/26"
    let current_team = "";
    // Primary: team link inside the PlayerInfo section
    const infoTeamLink = $('[class*="PlayerInfo"] a[href*="/team/"]').first();
    if (infoTeamLink.length) {
      current_team = infoTeamLink.text().trim();
    }
    // Fallback: first team link anywhere on the page
    if (!current_team) {
      $('a[href*="/team/"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 2) {
          current_team = text;
          return false; // break
        }
      });
    }
    if (current_team) {
      console.log(`[Profile Scraper] Found current team: ${current_team}`);
    }

    return { player_photo, current_team };
  } catch (error) {
    console.error(
      `[Profile Scraper] Error scraping ${playerLink}:`,
      error.message,
    );
    return { player_photo: "", current_team: "" };
  }
}

/**
 * Backwards-compatible wrapper — returns only the photo URL
 * @param {string} playerLink
 * @returns {string}
 */
async function scrapePlayerPhoto(playerLink) {
  const { player_photo } = await scrapePlayerProfile(playerLink);
  return player_photo;
}

/**
 * Scrapes Elite Prospects recruiting data for a specific season
 * Enhanced version that also fetches player photos
 * @param {string} season - Season in format "2026-2027"
 * @param {boolean} includePhotos - Whether to scrape individual player photos (slower)
 * @returns {Array} Array of player objects with recruiting information
 */
function normalizeRosterHeader(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getRosterHeaderKey(text) {
  const header = normalizeRosterHeader(text);
  if (header === "#" || /^(no\.?|number)$/.test(header)) return "number";
  if (/^player\b/.test(header)) return "player";
  if (header === "a" || /^age\b/.test(header)) return "age";
  if (/^(born|birth year)\b/.test(header)) return "birthYear";
  if (/^birth ?place\b/.test(header)) return "birthplace";
  if (header === "ht" || /^height\b/.test(header)) return "height";
  if (header === "wt" || /^weight\b/.test(header)) return "weight";
  if (header === "s" || /^(shoots|catches)\b/.test(header)) return "shoots";
  return null;
}

function getRosterHeaderMap($, table) {
  const headerMap = {};
  $(table)
    .find("thead th")
    .each((index, header) => {
      const key = getRosterHeaderKey($(header).text());
      if (key && headerMap[key] === undefined) headerMap[key] = index;
    });

  const requiredHeaders = [
    "player",
    "age",
    "birthYear",
    "birthplace",
    "height",
    "weight",
    "shoots",
  ];
  return requiredHeaders.every((key) => headerMap[key] !== undefined)
    ? headerMap
    : null;
}

function isRosterCardForSeason($, card, season) {
  const heading = normalizeRosterHeader($(card).find("h2").first().text());
  const headingSeasons = heading.match(/\b20\d{2}-20\d{2}\b/g) || [];
  return (
    headingSeasons.length === 1 &&
    headingSeasons[0] === normalizeRosterHeader(season) &&
    heading.startsWith(`${headingSeasons[0]} `) &&
    /\broster\b/.test(heading)
  );
}

async function scrapeEliteProspectsRecruiting(season, includePhotos = false) {
  const url = `https://www.eliteprospects.com/team/18066/arizona-state-univ/${season}`;
  console.log(
    `[EP Recruiting Scraper] Fetching recruiting data for ${season} from: ${url}`,
  );

  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const players = [];

    // Scope tables to EP's roster card for the requested season before
    // checking semantic headers. This prevents a redirected older-season
    // page from being accepted as the requested snapshot. The CSS-module
    // hash rotates, so match only the stable LineupCard_wrapper prefix.
    const rosterTables = $(
      'div[class^="LineupCard_wrapper"], div[class*=" LineupCard_wrapper"]',
    )
      .filter((_, card) => isRosterCardForSeason($, card, season))
      .find("table")
      .filter((_, table) => getRosterHeaderMap($, table) !== null);
    if (rosterTables.length === 0) {
      throw new Error(
        `[EP Recruiting Scraper] Unable to identify roster table for ${season}`,
      );
    }
    const playerRows = rosterTables.find("tbody tr");

    console.log(
      `[EP Recruiting Scraper] Found ${playerRows.length} potential player rows`,
    );

    for (let index = 0; index < playerRows.length; index++) {
      const row = playerRows[index];
      const $row = $(row);
      // children() not find(): a nested table inside a cell must not
      // pollute the positional index space.
      const cells = $row.children("td");
      const headerMap = getRosterHeaderMap($, $row.closest("table").get(0));
      const requiredCellIndex = Math.max(...Object.values(headerMap));

      // A short row is only safe to ignore when it has no player evidence.
      // EP can truncate a player row after its profile cell, which would
      // otherwise silently remove that player from a cached snapshot.
      if (cells.length <= requiredCellIndex) {
        const playerCellText =
          headerMap.player < cells.length
            ? $(cells[headerMap.player]).text().trim()
            : "";
        const numberCellText =
          headerMap.number !== undefined && headerMap.number < cells.length
            ? $(cells[headerMap.number]).text().trim()
            : "";
        const hasPlayerLink = $(row).find('a[href*="/player/"]').length > 0;
        const isKnownSection = /^(forwards|defensemen|goaltenders|goalies|skaters)$/i.test(
          playerCellText,
        );
        const isKnownSummary = /^(ncaa|total)/i.test(numberCellText);
        if (
          hasPlayerLink ||
          (playerCellText && !isKnownSection && !isKnownSummary)
        ) {
          throw new Error(
            `[EP Recruiting Scraper] truncated player-like row ${index}`,
          );
        }
        continue;
      }

      try {
        // Extract player data from cells
        const number =
          headerMap.number === undefined
            ? ""
            : $(cells[headerMap.number]).text().trim();

        // Skip statistics/summary rows (they have "NCAA" or numbers as the number field)
        if (
          number &&
          (number.toUpperCase() === "NCAA" ||
            number.toUpperCase().startsWith("TOTAL"))
        ) {
          console.log(
            `[EP Recruiting Scraper] Skipping statistics row with number: ${number}`,
          );
          continue;
        }

        // Get player name and link (structural first, hashed fallback)
        let playerLinkElement = $(cells[headerMap.player])
          .find('a[href*="/player/"]')
          .first();
        if (!playerLinkElement.length) {
          playerLinkElement = $(cells[headerMap.player]).find(
            "div.Roster_player__e6EbP a.TextLink_link__RhSiC",
          );
        }
        let fullNameWithPos = playerLinkElement.text().trim();
        const playerLink = playerLinkElement.attr("href");

        if (!playerLinkElement.length || !fullNameWithPos || !playerLink) {
          const playerCellText = $(cells[headerMap.player]).text().trim();
          const hasRowPlayerLink = $row.find('a[href*="/player/"]').length > 0;
          if (playerCellText || hasRowPlayerLink) {
            throw new Error(
              `[EP Recruiting Scraper] Player-like row ${index} is missing a valid player name or link`,
            );
          }
          continue;
        }

        // Extract position from name (e.g., "John Doe (F)" -> position: "F", name: "John Doe")
        let name = fullNameWithPos;
        let position = "";
        const posMatch = fullNameWithPos.match(/^(.+?)\s*\(([A-Z/]+)\)$/);
        if (posMatch) {
          name = posMatch[1].trim();
          position = posMatch[2];
        }

        if (!name || !isNaN(name)) {
          throw new Error(
            `[EP Recruiting Scraper] Player-like row ${index} is missing a valid player name or link`,
          );
        }

        // Extract other fields
        const age = $(cells[headerMap.age]).text().trim();

        // Birth year extraction
        const birthYearSpan = $(cells[headerMap.birthYear]).find("span");
        let birthYear = "";
        if (birthYearSpan.length && birthYearSpan.attr("title")) {
          const birthYearMatch = birthYearSpan.attr("title").match(/(\d{4})/);
          if (birthYearMatch) {
            birthYear = birthYearMatch[1];
          }
        }
        if (!birthYear) {
          birthYear = $(cells[headerMap.birthYear]).text().trim();
        }

        // .text() over all links concatenates city + country when EP
        // splits birthplace across two anchors
        const birthplace =
          $(cells[headerMap.birthplace]).find("a").text().trim() ||
          $(cells[headerMap.birthplace]).text().trim();
        const height = $(cells[headerMap.height]).text().trim();
        const weight = $(cells[headerMap.weight]).text().trim();
        const shoots = $(cells[headerMap.shoots]).text().trim();

        const fullPlayerLink = playerLink.startsWith("http")
          ? playerLink
          : `https://www.eliteprospects.com${playerLink}`;

        // Skip players already captured from another matching table
        // (structural table selection can match more than one)
        if (
          fullPlayerLink &&
          players.some((p) => p.player_link === fullPlayerLink)
        ) {
          continue;
        }

        // Scrape player photo and current team if requested (single request)
        let player_photo = "";
        let current_team = "";
        if (includePhotos && fullPlayerLink) {
          const profile = await scrapePlayerProfile(fullPlayerLink);
          player_photo = profile.player_photo;
          current_team = profile.current_team;
          // Add delay after each profile request to be respectful
          await delayBetweenRequests();
        }

        const player = {
          number: number || "",
          name: name,
          position: position,
          age: age || "",
          birth_year: birthYear || "",
          birthplace: birthplace || "",
          height: height || "",
          weight: weight || "",
          shoots: shoots || "",
          player_link: fullPlayerLink,
          player_photo: player_photo,
          current_team: current_team,
        };

        players.push(player);
        console.log(
          `[EP Recruiting Scraper] Added player: ${name} (${position})${player_photo ? " with photo" : ""}`,
        );
      } catch (error) {
        console.error(
          `[EP Recruiting Scraper] Error parsing row ${index}:`,
          error.message,
        );
        throw error;
      }
    }

    console.log(
      `[EP Recruiting Scraper] Successfully scraped ${players.length} players for ${season}`,
    );
    return players;
  } catch (error) {
    console.error(
      `[EP Recruiting Scraper] Error fetching recruiting data for ${season}:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Scrapes recruiting data for all configured future seasons
 * @param {{includePhotos?: boolean}} args
 * @returns {Object} Object with season keys and player arrays as values
 */
async function scrapeAllSeasons({ includePhotos = false } = {}) {
  const recruitingData = {};

  for (const season of config.FUTURE_SEASONS || [
    "2026-2027",
    "2027-2028",
    "2028-2029",
  ]) {
    console.log(
      `[Recruiting] Scraping season: ${season}${includePhotos ? " with photos" : ""}`,
    );
    recruitingData[season] = await scrapeEliteProspectsRecruiting(
      season,
      includePhotos,
    );

    // Add delay between requests to be respectful
    await delayBetweenRequests();
  }

  return recruitingData;
}

function isValidRecruitingSnapshot(data) {
  return validateRecruitingSnapshot(data, config.FUTURE_SEASONS);
}

function requireValidRecruitingSnapshot(data) {
  if (!isValidRecruitingSnapshot(data)) {
    throw new InvalidRecruitingSnapshotError();
  }
  return data;
}

function getValidatedFallback() {
  const fallback = getFallbackRecruitingData();
  return fallback && isValidRecruitingSnapshot(fallback) ? fallback : null;
}

const fetchRecruiting = createCachedScraper({
  name: "recruiting",
  cacheKey: "asu_hockey_recruiting",
  ttl: CACHE_TTL,
  swr: false,
  scrape: scrapeAllSeasons,
  validate: (data) => {
    const valid = isValidRecruitingSnapshot(data);
    const totalPlayers = valid
      ? config.FUTURE_SEASONS.reduce(
          (sum, season) => sum + data[season].length,
          0,
        )
      : 0;
    return reportScrapeHealth("recruiting", {
      validSnapshot: valid ? 1 : 0,
      totalPlayers,
    });
  },
  fallback: getFallbackRecruitingData,
  fallbackOnly: shouldUseFallbackOnly,
  normalizeCached: requireValidRecruitingSnapshot,
  onScrapeError: (error) => {
    throw new RecruitingDataUnavailableError(error);
  },
});

/**
 * Fetches recruiting data for all configured future seasons.
 * includePhotos=true bypasses cache reads in local/live mode. Production and
 * prerender calls always remain on the bundled-snapshot path.
 * @param {boolean} includePhotos - Whether to scrape player photos (much slower)
 */
async function fetchRecruitingData(includePhotos = false, options = {}) {
  // Production and prerender environments cannot reliably access Elite
  // Prospects. This guard intentionally precedes cache-bypass handling so a
  // profile-enrichment request cannot become a live network escape hatch.
  if (shouldUseFallbackOnly()) {
    const fallback = getValidatedFallback();
    if (fallback) return fallback;
    throw new RecruitingDataUnavailableError();
  }
  const fetchOptions = {
    bypassCache: includePhotos || options.bypassCache === true,
    scrapeArgs: { includePhotos },
  };

  try {
    return await fetchRecruiting(fetchOptions);
  } catch (error) {
    if (error.code !== "INVALID_RECRUITING_SNAPSHOT") throw error;

    const fallback = getValidatedFallback();
    if (fallback) return fallback;

    try {
      return await fetchRecruiting({ ...fetchOptions, bypassCache: true });
    } catch (liveError) {
      throw new RecruitingDataUnavailableError(liveError);
    }
  }
}

module.exports = {
  fetchRecruitingData,
  scrapeEliteProspectsRecruiting,
  scrapePlayerProfile,
  scrapePlayerPhoto,
  getFallbackRecruitingData,
  shouldUseFallbackOnly,
};
