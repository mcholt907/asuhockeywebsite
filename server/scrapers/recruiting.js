// recruiting.js — EliteProspects future-season roster scrape (recruiting
// tracker). fetchRecruitingData feeds local curation scripts; the live
// /api/recruits endpoint reads asu_hockey_data.json directly.
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

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
async function scrapeEliteProspectsRecruiting(season, includePhotos = false) {
  const url = `https://www.eliteprospects.com/team/18066/arizona-state-univ/${season}?tab=stats`;
  console.log(
    `[EP Recruiting Scraper] Fetching recruiting data for ${season} from: ${url}`,
  );

  try {
    const { data } = await requestWithRetry(url);
    const $ = cheerio.load(data);
    const players = [];

    // Find all player rows in the roster table. Structural selection
    // first — the hashed CSS-module class names (SortTable_*) rotate
    // whenever EP redeploys. A roster table is one that contains player
    // profile links AND has an Age column in its header; the header check
    // keeps pure stats tables (GP/G/A columns at the same indexes) from
    // being parsed as roster rows. Header/summary rows inside the table
    // are filtered by the cell-count and name checks below.
    const candidateTables = $("table").filter(
      (_, t) => $(t).find('a[href*="/player/"]').length > 0,
    );
    let rosterTables = candidateTables.filter((_, t) =>
      $(t)
        .find("thead th")
        .toArray()
        .some((th) => /^\s*age\s*$/i.test($(th).text())),
    );
    if (rosterTables.length === 0) rosterTables = candidateTables;
    let playerRows = rosterTables.find("tbody tr");
    if (playerRows.length === 0) {
      playerRows = $(
        "table.SortTable_table__jnnJk tbody.SortTable_tbody__VrcrZ tr.SortTable_tr__L9yVC",
      );
    }

    console.log(
      `[EP Recruiting Scraper] Found ${playerRows.length} potential player rows`,
    );

    for (let index = 0; index < playerRows.length; index++) {
      const row = playerRows[index];
      const $row = $(row);
      // children() not find(): a nested table inside a cell must not
      // pollute the positional index space.
      const cells = $row.children("td");

      // Skip if not enough cells (likely a header or section row)
      if (cells.length < 10) {
        continue;
      }

      try {
        // Extract player data from cells
        const number = $(cells[1]).text().trim();

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
        let playerLinkElement = $(cells[3]).find('a[href*="/player/"]').first();
        if (!playerLinkElement.length) {
          playerLinkElement = $(cells[3]).find(
            "div.Roster_player__e6EbP a.TextLink_link__RhSiC",
          );
        }
        let fullNameWithPos = playerLinkElement.text().trim();
        const playerLink = playerLinkElement.attr("href");

        // Extract position from name (e.g., "John Doe (F)" -> position: "F", name: "John Doe")
        let name = fullNameWithPos;
        let position = "";
        const posMatch = fullNameWithPos.match(/^(.+?)\s*\(([A-Z/]+)\)$/);
        if (posMatch) {
          name = posMatch[1].trim();
          position = posMatch[2];
        }

        // Skip if name is just a number (invalid row)
        if (name && !isNaN(name)) {
          console.log(
            `[EP Recruiting Scraper] Skipping invalid row with numeric name: ${name}`,
          );
          continue;
        }

        // Skip Carson McGinley as requested
        if (name && name === "Carson McGinley") {
          console.log(
            `[EP Recruiting Scraper] Skipping removed recruit: Carson McGinley`,
          );
          continue;
        }

        // Extract other fields
        const age = $(cells[4]).text().trim();

        // Birth year extraction
        const birthYearSpan = $(cells[5]).find("span");
        let birthYear = "";
        if (birthYearSpan.length && birthYearSpan.attr("title")) {
          const birthYearMatch = birthYearSpan.attr("title").match(/(\d{4})/);
          if (birthYearMatch) {
            birthYear = birthYearMatch[1];
          }
        }
        if (!birthYear) {
          birthYear = $(cells[5]).text().trim();
        }

        // .text() over all links concatenates city + country when EP
        // splits birthplace across two anchors
        const birthplace =
          $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
        const height = $(cells[7]).text().trim();
        const weight = $(cells[8]).text().trim();
        const shoots = $(cells[9]).text().trim();

        const fullPlayerLink = playerLink
          ? `https://www.eliteprospects.com${playerLink}`
          : "";

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

        // Only add if we have a valid player name
        if (name && name.length > 0) {
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
        }
      } catch (error) {
        console.error(
          `[EP Recruiting Scraper] Error parsing row ${index}:`,
          error.message,
        );
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
    return [];
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

const fetchRecruiting = createCachedScraper({
  name: "recruiting",
  cacheKey: "asu_hockey_recruiting",
  // no ttl: saveToCache's 24h default, same as the old bare saveToCache call
  scrape: scrapeAllSeasons,
  validate: (data) => Object.values(data).some((arr) => arr.length > 0),
});

/**
 * Fetches recruiting data for all configured future seasons.
 * includePhotos=true bypasses cache reads and always scrapes live (local
 * curation scripts only); the result still refreshes the shared cache key.
 * @param {boolean} includePhotos - Whether to scrape player photos (much slower)
 */
async function fetchRecruitingData(includePhotos = false) {
  return fetchRecruiting({
    bypassCache: includePhotos,
    scrapeArgs: { includePhotos },
  });
}

module.exports = {
  fetchRecruitingData,
  scrapeEliteProspectsRecruiting,
  scrapePlayerProfile,
  scrapePlayerPhoto,
};
