const cheerio = require('cheerio');
const { saveToCache, getFromCache } = require('./src/scripts/caching-system');
const config = require('./config/scraper-config');
const { requestWithRetry, delayBetweenRequests } = require('./utils/request-helper');

/**
 * Scrapes player photo URL from Elite Prospects player profile page
 * @param {string} playerLink - Full URL to player's Elite Prospects profile
 * @returns {string} URL of player photo, or empty string if not found
 */
async function scrapePlayerPhoto(playerLink) {
    if (!playerLink) return '';

    try {
        console.log(`[Photo Scraper] Fetching photo from: ${playerLink}`);
        const { data } = await requestWithRetry(playerLink);
        const $ = cheerio.load(data);

        // Look for player photo using the ProfileImage class (actual player headshot)
        // This is the correct selector based on testing
        let photoUrl = '';
        const playerPhoto = $('.ProfileImage_profileImage__JLd31').attr('src') ||
            $('img.ProfileImage_profileImage__JLd31').attr('src') ||
            $('img[src*="files.eliteprospects.com/layout/players"]').first().attr('src') ||
            $('img[alt*="player"]').first().attr('src');

        if (playerPhoto) {
            // Make sure it's a full URL
            photoUrl = playerPhoto.startsWith('http') ? playerPhoto : `https://www.eliteprospects.com${playerPhoto}`;
            console.log(`[Photo Scraper] Found photo: ${photoUrl}`);
        } else {
            console.log(`[Photo Scraper] No photo found for ${playerLink}`);
        }

        return photoUrl;
    } catch (error) {
        console.error(`[Photo Scraper] Error scraping photo from ${playerLink}:`, error.message);
        return '';
    }
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

                // Scrape player photo if requested
                let player_photo = '';
                if (includePhotos && fullPlayerLink) {
                    player_photo = await scrapePlayerPhoto(fullPlayerLink);
                    // Add delay after each photo request to be respectful
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
                        player_photo: player_photo
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
 * Fetches recruiting data for all configured future seasons
 * Uses caching to avoid excessive scraping
 * @param {boolean} includePhotos - Whether to scrape player photos (much slower)
 * @returns {Object} Object with season keys and player arrays as values
 */
async function fetchRecruitingData(includePhotos = false) {
    const RECRUITING_CACHE_KEY = 'asu_hockey_recruiting';

    console.log(`[Cache System] Attempting to fetch recruiting data with cache key: ${RECRUITING_CACHE_KEY}`);

    try {
        const cachedData = await getFromCache(RECRUITING_CACHE_KEY);
        if (cachedData && !includePhotos) {
            console.log('[Cache System] Recruiting data found in cache. Returning cached data.');
            return cachedData;
        }
    } catch (error) {
        console.error('[Cache System] Error reading recruiting data from cache:', error.message);
    }

    console.log('[Cache System] No recruiting cache found or cache is stale. Scraping live data.');

    try {
        const recruitingData = {};

        // Scrape data for each future season configured
        for (const season of config.FUTURE_SEASONS || ['2026-2027', '2027-2028', '2028-2029']) {
            console.log(`[Recruiting] Scraping season: ${season}${includePhotos ? ' with photos' : ''}`);
            const players = await scrapeEliteProspectsRecruiting(season, includePhotos);
            recruitingData[season] = players;

            // Add delay between requests to be respectful
            await delayBetweenRequests();
        }

        // Save to cache if we got any data
        if (Object.keys(recruitingData).length > 0) {
            console.log(`[Cache System] Successfully scraped recruiting data. Saving to cache.`);
            await saveToCache(recruitingData, RECRUITING_CACHE_KEY);
        } else {
            console.log('[Cache System] No recruiting data returned from scraper. Not caching.');
        }

        return recruitingData;

    } catch (error) {
        console.error('[FetchRecruitingData] Error fetching recruiting data:', error.message);
        return {};
    }
}

module.exports = {
    fetchRecruitingData,
    scrapeEliteProspectsRecruiting,
    scrapePlayerPhoto
};
