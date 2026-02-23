const cheerio = require('cheerio');
const { saveToCache, getFromCache } = require('./src/scripts/caching-system');
const config = require('./config/scraper-config');
const { requestWithRetry, delayBetweenRequests } = require('./utils/request-helper');

let recruitingPromise = null;

/**
 * Scrapes player photo and current team from a single Elite Prospects profile page visit
 * @param {string} playerLink - Full URL to player's Elite Prospects profile
 * @returns {{ player_photo: string, current_team: string }}
 */
async function scrapePlayerProfile(playerLink) {
    if (!playerLink) return { player_photo: '', current_team: '' };

    try {
        console.log(`[Profile Scraper] Fetching profile from: ${playerLink}`);
        const { data } = await requestWithRetry(playerLink);
        const $ = cheerio.load(data);

        // --- Photo ---
        let player_photo = '';
        const photoEl = $('.ProfileImage_profileImage__JLd31').attr('src') ||
            $('img.ProfileImage_profileImage__JLd31').attr('src') ||
            $('img[src*="files.eliteprospects.com/layout/players"]').first().attr('src') ||
            $('img[alt*="player"]').first().attr('src');
        if (photoEl) {
            player_photo = photoEl.startsWith('http') ? photoEl : `https://www.eliteprospects.com${photoEl}`;
            console.log(`[Profile Scraper] Found photo: ${player_photo}`);
        }

        // --- Current Team ---
        // EP shows current team as a link in the player info header
        // e.g. "#31 Bismarck Bobcats / NAHL - 25/26"
        let current_team = '';
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
        console.error(`[Profile Scraper] Error scraping ${playerLink}:`, error.message);
        return { player_photo: '', current_team: '' };
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
    console.log(`[EP Recruiting Scraper] Fetching recruiting data for ${season} from: ${url}`);

    try {
        const { data } = await requestWithRetry(url);
        const $ = cheerio.load(data);
        const players = [];

        // Find all player rows in the stats table
        const playerRows = $('table.SortTable_table__jnnJk tbody.SortTable_tbody__VrcrZ tr.SortTable_tr__L9yVC');

        console.log(`[EP Recruiting Scraper] Found ${playerRows.length} potential player rows`);

        for (let index = 0; index < playerRows.length; index++) {
            const row = playerRows[index];
            const $row = $(row);
            const cells = $row.find('td.SortTable_trow__T6wLH');

            // Skip if not enough cells (likely a header or section row)
            if (cells.length < 10) {
                continue;
            }

            try {
                // Extract player data from cells
                const number = $(cells[1]).text().trim();

                // Skip statistics/summary rows (they have "NCAA" or numbers as the number field)
                if (number && (number.toUpperCase() === 'NCAA' || number.toUpperCase().startsWith('TOTAL'))) {
                    console.log(`[EP Recruiting Scraper] Skipping statistics row with number: ${number}`);
                    continue;
                }

                // Get player name and link
                const playerLinkElement = $(cells[3]).find('div.Roster_player__e6EbP a.TextLink_link__RhSiC');
                let fullNameWithPos = playerLinkElement.text().trim();
                const playerLink = playerLinkElement.attr('href');

                // Extract position from name (e.g., "John Doe (F)" -> position: "F", name: "John Doe")
                let name = fullNameWithPos;
                let position = '';
                const posMatch = fullNameWithPos.match(/^(.+?)\s*\(([A-Z/]+)\)$/);
                if (posMatch) {
                    name = posMatch[1].trim();
                    position = posMatch[2];
                }

                // Skip if name is just a number (invalid row)
                if (name && !isNaN(name)) {
                    console.log(`[EP Recruiting Scraper] Skipping invalid row with numeric name: ${name}`);
                    continue;
                }

                // Extract other fields
                const age = $(cells[4]).text().trim();

                // Birth year extraction
                const birthYearSpan = $(cells[5]).find('span');
                let birthYear = '';
                if (birthYearSpan.length && birthYearSpan.attr('title')) {
                    const birthYearMatch = birthYearSpan.attr('title').match(/(\d{4})/);
                    if (birthYearMatch) {
                        birthYear = birthYearMatch[1];
                    }
                }
                if (!birthYear) {
                    birthYear = $(cells[5]).text().trim();
                }

                const birthplace = $(cells[6]).find('a.TextLink_link__RhSiC').text().trim() || $(cells[6]).text().trim();
                const height = $(cells[7]).text().trim();
                const weight = $(cells[8]).text().trim();
                const shoots = $(cells[9]).text().trim();

                const fullPlayerLink = playerLink ? `https://www.eliteprospects.com${playerLink}` : '';

                // Scrape player photo and current team if requested (single request)
                let player_photo = '';
                let current_team = '';
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
                        number: number || '',
                        name: name,
                        position: position,
                        age: age || '',
                        birth_year: birthYear || '',
                        birthplace: birthplace || '',
                        height: height || '',
                        weight: weight || '',
                        shoots: shoots || '',
                        player_link: fullPlayerLink,
                        player_photo: player_photo,
                        current_team: current_team
                    };

                    players.push(player);
                    console.log(`[EP Recruiting Scraper] Added player: ${name} (${position})${player_photo ? ' with photo' : ''}`);
                }
            } catch (error) {
                console.error(`[EP Recruiting Scraper] Error parsing row ${index}:`, error.message);
            }
        }

        console.log(`[EP Recruiting Scraper] Successfully scraped ${players.length} players for ${season}`);
        return players;

    } catch (error) {
        console.error(`[EP Recruiting Scraper] Error fetching recruiting data for ${season}:`, error.message);
        return [];
    }
}

/**
 * Scrapes recruiting data for all configured future seasons and saves to cache
 * @param {string} cacheKey - Cache key to save data under
 * @param {boolean} includePhotos - Whether to scrape player photos (much slower)
 * @returns {Object} Object with season keys and player arrays as values
 */
async function scrapeAndCacheRecruiting(cacheKey, includePhotos = false) {
    const recruitingData = {};

    // Scrape data for each future season configured
    for (const season of config.FUTURE_SEASONS || ['2026-2027', '2027-2028', '2028-2029']) {
        console.log(`[Recruiting] Scraping season: ${season}${includePhotos ? ' with photos' : ''}`);
        const players = await scrapeEliteProspectsRecruiting(season, includePhotos);
        recruitingData[season] = players;

        // Add delay between requests to be respectful
        await delayBetweenRequests();
    }

    // Save to cache only if at least one player was returned across all seasons
    const hasAnyPlayers = Object.values(recruitingData).some(arr => arr.length > 0);
    if (hasAnyPlayers) {
        console.log(`[Cache System] Successfully scraped recruiting data. Saving to cache.`);
        saveToCache(recruitingData, cacheKey);
    } else {
        console.log('[Cache System] No recruiting data returned from scraper. Not caching.');
    }

    return recruitingData;
}

/**
 * Fetches recruiting data for all configured future seasons
 * Uses stale-while-revalidate caching to avoid excessive scraping
 * @param {boolean} includePhotos - Whether to scrape player photos (much slower)
 * @returns {Object} Object with season keys and player arrays as values
 */
async function fetchRecruitingData(includePhotos = false) {
    const RECRUITING_CACHE_KEY = 'asu_hockey_recruiting';

    // 1. Fresh cache
    try {
        const cachedData = getFromCache(RECRUITING_CACHE_KEY);
        if (cachedData && !includePhotos) {
            console.log('[Recruiting Scraper] Returning cached recruiting data.');
            return cachedData;
        }

        // 2. SWR: return stale immediately, refresh in background
        const staleData = getFromCache(RECRUITING_CACHE_KEY, true);
        if (staleData && !includePhotos) {
            console.log('[Recruiting Scraper] Stale data found. Returning immediately and refreshing in background.');
            if (!recruitingPromise) {
                // Phase 2 background refresh — always false here because includePhotos=true bypasses cache entirely
                recruitingPromise = scrapeAndCacheRecruiting(RECRUITING_CACHE_KEY, false)
                    .finally(() => { recruitingPromise = null; });
            }
            return staleData;
        }
    } catch (error) {
        console.log('[Recruiting Scraper] No valid cache found.');
    }

    // 3. No cache — must block on live scrape
    if (recruitingPromise) {
        return await recruitingPromise;
    }
    recruitingPromise = scrapeAndCacheRecruiting(RECRUITING_CACHE_KEY, includePhotos)
        .finally(() => { recruitingPromise = null; });
    return await recruitingPromise;
}

module.exports = {
    fetchRecruitingData,
    scrapeEliteProspectsRecruiting,
    scrapePlayerProfile,
    scrapePlayerPhoto
};
