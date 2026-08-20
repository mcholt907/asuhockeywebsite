// recruiting.js — EliteProspects future-season roster scrape (recruiting
// tracker). The direct all-season entry point feeds the automated local
// refresh, while /api/recruits uses the cached/bundled-snapshot path.
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
const {
  assertAutomatedRecruitingSnapshot,
  normalizeRecruitingPosition,
} = require("../services/recruiting-refresh-health");

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
    const value = readRecruitingSnapshot(FALLBACK_FILE, config.FUTURE_SEASONS);
    if (value) fallbackCache = { mtimeMs: stat.mtimeMs, value };
    return value;
  } catch (error) {
    console.warn(`[Recruiting] Fallback unavailable: ${error.message}`);
    return null;
  }
}

function shouldUseFallbackOnly() {
  return (
    process.env.NODE_ENV === "production" || process.env.IS_PRERENDER === "true"
  );
}

function getEliteProspectsPlayerId(value) {
  try {
    const url = new URL(value, "https://www.eliteprospects.com");
    if (
      url.protocol !== "https:" ||
      !["eliteprospects.com", "www.eliteprospects.com"].includes(
        url.hostname.toLowerCase(),
      )
    ) {
      return null;
    }
    return url.pathname.match(/^\/player\/(\d+)(?:\/|$)/)?.[1] || null;
  } catch {
    return null;
  }
}

function getApprovedPlayerPhoto(source) {
  if (typeof source !== "string" || !source.trim()) return "";
  try {
    const imageUrl = new URL(source, "https://www.eliteprospects.com");
    if (imageUrl.protocol !== "https:") return "";
    if (
      imageUrl.hostname === "files.eliteprospects.com" &&
      imageUrl.pathname.startsWith("/layout/players/")
    ) {
      return imageUrl.href;
    }
    if (
      imageUrl.hostname === "cdn.eliteprospects-assets.com" &&
      /(?:^|[-_/])players?(?:[-_/.]|$)/i.test(imageUrl.pathname)
    ) {
      return imageUrl.href;
    }
  } catch {
    // Invalid optional image URLs are ignored.
  }
  return "";
}

function getEntityPhoto(entity) {
  const image = entity?.image;
  if (typeof image === "string") return getApprovedPlayerPhoto(image);
  if (image && typeof image === "object") {
    return getApprovedPlayerPhoto(image.url || image.contentUrl);
  }
  return getApprovedPlayerPhoto(
    entity?.player_photo || entity?.photo || entity?.imageUrl,
  );
}

function getEntityTeam(entity) {
  const team =
    entity?.memberOf ||
    entity?.affiliation ||
    entity?.worksFor ||
    entity?.currentTeam ||
    entity?.team;
  if (typeof team === "string") return team.trim();
  return typeof team?.name === "string" ? team.name.trim() : "";
}

function hasMatchingPlayerUrl(entity, expectedPlayerId) {
  return [entity?.url, entity?.["@id"], entity?.sameAs]
    .flat()
    .some((value) => getEliteProspectsPlayerId(value) === expectedPlayerId);
}

function getJsonLdNodes(value) {
  if (Array.isArray(value)) return value.flatMap(getJsonLdNodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...getJsonLdNodes(value["@graph"] || [])];
}

function extractJsonLdProfile($, expectedPlayerId) {
  const people = [];
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      for (const node of getJsonLdNodes(JSON.parse($(script).text()))) {
        const types = [node?.["@type"]].flat();
        if (types.includes("Person")) people.push(node);
      }
    } catch {
      // A malformed optional metadata block is not authoritative.
    }
  });

  const person = people.find((candidate) =>
    hasMatchingPlayerUrl(candidate, expectedPlayerId),
  );
  return person
    ? {
        player_photo: getEntityPhoto(person),
        current_team: getEntityTeam(person),
      }
    : null;
}

function getNamedPlayerObjects(value) {
  if (Array.isArray(value)) return value.flatMap(getNamedPlayerObjects);
  if (!value || typeof value !== "object") return [];

  const players = [];
  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      key.toLowerCase() === "player" &&
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      players.push(nestedValue);
    }
    players.push(...getNamedPlayerObjects(nestedValue));
  }
  return players;
}

function extractNextDataProfile($, expectedPlayerId) {
  const script = $("#__NEXT_DATA__").first();
  if (!script.length) return null;

  try {
    const nextData = JSON.parse(script.text());
    const player = getNamedPlayerObjects(nextData).find((candidate) => {
      const candidateId =
        candidate.id ?? candidate.playerId ?? candidate.player_id;
      return (
        String(candidateId) === expectedPlayerId &&
        typeof candidate.name === "string" &&
        candidate.name.trim()
      );
    });
    return player
      ? {
          player_photo: getEntityPhoto(player),
          current_team: getEntityTeam(player),
        }
      : null;
  } catch {
    return null;
  }
}

function extractSemanticProfile($, expectedPlayerId) {
  const canonicalIds = $('link[rel~="canonical"][href]')
    .toArray()
    .map((link) => getEliteProspectsPlayerId($(link).attr("href")))
    .filter(Boolean);
  const profileHeadings = $("header h1");
  if (
    canonicalIds.length !== 1 ||
    canonicalIds[0] !== expectedPlayerId ||
    profileHeadings.length !== 1
  ) {
    return null;
  }

  const header = profileHeadings.first().closest("header");
  const player_photo = header
    .find("img[src]")
    .toArray()
    .map((image) => getApprovedPlayerPhoto($(image).attr("src")))
    .find(Boolean);
  const current_team = header.find('a[href*="/team/"]').first().text().trim();
  return { player_photo: player_photo || "", current_team };
}

function isChallengePage($) {
  const title = $("title").text().toLowerCase();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /just a moment|access denied|verify you are human|captcha/.test(title) ||
    /just a moment|access denied|verify you are human|captcha/.test(bodyText) ||
    $("#challenge-form, .cf-challenge, [data-sitekey]").length > 0
  );
}

function hasProfileIdentitySignals($) {
  if ($('link[rel~="canonical"][href*="/player/"]').length) return true;
  if ($("#__NEXT_DATA__").length) return true;

  let hasPerson = false;
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      hasPerson ||= getJsonLdNodes(JSON.parse($(script).text())).some((node) =>
        [node?.["@type"]].flat().includes("Person"),
      );
    } catch {
      // Ignore malformed optional metadata while classifying the page.
    }
  });
  return hasPerson;
}

function emptyProfile() {
  return { player_photo: "", current_team: "" };
}

function emitProfileWarning(playerId, classification, onWarning) {
  console.warn(
    `[Recruiting Profile] playerId=${playerId || "unknown"} classification=${classification}`,
  );
  if (typeof onWarning === "function") onWarning(classification);
}

/**
 * Scrapes player photo and current team from a single Elite Prospects profile page visit
 * @param {string} playerLink - Full URL to player's Elite Prospects profile
 * @returns {{ player_photo: string, current_team: string }}
 */
async function scrapePlayerProfile(playerLink, { onWarning } = {}) {
  const expectedPlayerId = getEliteProspectsPlayerId(playerLink);
  if (!expectedPlayerId) {
    emitProfileWarning(null, "invalid_player_url", onWarning);
    return emptyProfile();
  }

  let data;
  try {
    console.log(`[Profile Scraper] Fetching profile from: ${playerLink}`);
    ({ data } = await requestWithRetry(playerLink));
  } catch {
    emitProfileWarning(expectedPlayerId, "request_error", onWarning);
    return emptyProfile();
  }

  try {
    const $ = cheerio.load(data);
    if (isChallengePage($)) {
      emitProfileWarning(expectedPlayerId, "challenge_page", onWarning);
      return emptyProfile();
    }

    const profile =
      extractJsonLdProfile($, expectedPlayerId) ||
      extractNextDataProfile($, expectedPlayerId) ||
      extractSemanticProfile($, expectedPlayerId);
    if (!profile) {
      emitProfileWarning(
        expectedPlayerId,
        hasProfileIdentitySignals($)
          ? "identity_mismatch"
          : "unrecognized_layout",
        onWarning,
      );
      return emptyProfile();
    }

    if (!profile.player_photo || !profile.current_team) {
      emitProfileWarning(
        expectedPlayerId,
        "missing_optional_fields",
        onWarning,
      );
    }
    return profile;
  } catch {
    emitProfileWarning(expectedPlayerId, "unrecognized_layout", onWarning);
    return emptyProfile();
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
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
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

function isRosterHeadingForSeason($, headingElement, season) {
  const heading = normalizeRosterHeader($(headingElement).text());
  const headingSeasons = heading.match(/\b20\d{2}-20\d{2}\b/g) || [];
  return (
    headingSeasons.length === 1 &&
    headingSeasons[0] === normalizeRosterHeader(season) &&
    heading.startsWith(`${headingSeasons[0]} `) &&
    /\broster\b/.test(heading)
  );
}

function findRosterTables($, season) {
  const tableElements = new Set();

  $("h1, h2, h3")
    .filter((_, heading) => isRosterHeadingForSeason($, heading, season))
    .each((_, heading) => {
      let container = $(heading).parent();
      while (container.length && !container.is("body, html")) {
        if (
          container.is("section, article, div") &&
          container.find("table").length > 0
        ) {
          container.find("table").each((__, table) => tableElements.add(table));
          break;
        }
        container = container.parent();
      }
    });

  return $(Array.from(tableElements)).filter(
    (_, table) => getRosterHeaderMap($, table) !== null,
  );
}

async function scrapeEliteProspectsRecruiting(
  season,
  includePhotos = false,
  { enrichmentStats = null } = {},
) {
  const url = `https://www.eliteprospects.com/team/18066/arizona-state-univ/${season}`;
  const startedAt = Date.now();
  console.log(
    `[EP Recruiting Scraper] Fetching recruiting data for ${season} from: ${url}`,
  );

  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const players = [];

    // Anchor discovery to a semantically verified h1-h3 season/roster
    // heading, then use only roster-shaped tables in its nearest container.
    // This tolerates CSS-module renames without accepting unrelated tables.
    const rosterTables = findRosterTables($, season);
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
        const isKnownSection =
          /^(forwards|defensemen|goaltenders|goalies|skaters)$/i.test(
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
        const posMatch = fullNameWithPos.match(
          /^(.+?)\s*\(\s*([A-Za-z]+(?:\s*\/\s*[A-Za-z]+)*)\s*\)$/,
        );
        if (posMatch) {
          name = posMatch[1].trim();
          position = normalizeRecruitingPosition(posMatch[2]);
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
          if (enrichmentStats) enrichmentStats.attempted += 1;
          const profile = await scrapePlayerProfile(fullPlayerLink, {
            onWarning: (classification) => {
              if (!enrichmentStats) return;
              enrichmentStats.failures += 1;
              enrichmentStats.byClassification[classification] =
                (enrichmentStats.byClassification[classification] || 0) + 1;
            },
          });
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

    assertAutomatedRecruitingSnapshot({ [season]: players }, [season]);
    const profilesWithPhotos = players.filter(
      (player) => player.player_photo,
    ).length;
    console.log(
      `[EP Recruiting Scraper] Season complete: season=${season} players=${players.length} profiles=${includePhotos ? players.length : 0} photos=${profilesWithPhotos} durationMs=${Date.now() - startedAt}`,
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
async function scrapeAllRecruitingSeasons({ includePhotos = false } = {}) {
  const startedAt = Date.now();
  const recruitingData = {};
  const enrichmentStats = {
    attempted: 0,
    failures: 0,
    byClassification: {},
  };

  for (const season of config.FUTURE_SEASONS) {
    console.log(
      `[Recruiting] Scraping season: ${season}${includePhotos ? " with photos" : ""}`,
    );
    recruitingData[season] = await scrapeEliteProspectsRecruiting(
      season,
      includePhotos,
      { enrichmentStats },
    );

    // Add delay between requests to be respectful
    await delayBetweenRequests();
  }

  const health = assertAutomatedRecruitingSnapshot(
    recruitingData,
    config.FUTURE_SEASONS,
  );
  const totalPlayers = Object.values(health.counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  console.log(
    `[Recruiting] Batch complete: seasons=${config.FUTURE_SEASONS.length} players=${totalPlayers} profiles=${includePhotos} durationMs=${Date.now() - startedAt}`,
  );
  if (enrichmentStats.failures > 0) {
    const classifications = Object.entries(enrichmentStats.byClassification)
      .map(([classification, count]) => `${classification}:${count}`)
      .join(",");
    console.warn(
      `[Recruiting] Profile enrichment summary: attempts=${enrichmentStats.attempted} enrichmentFailures=${enrichmentStats.failures} classifications=${classifications}`,
    );
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
  scrape: scrapeAllRecruitingSeasons,
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
  scrapeAllRecruitingSeasons,
  scrapeEliteProspectsRecruiting,
  scrapePlayerProfile,
  scrapePlayerPhoto,
  getFallbackRecruitingData,
  shouldUseFallbackOnly,
};
