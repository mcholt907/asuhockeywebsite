/**
 * Transfer Feed Scraper
 * Scrapes transfer/transaction data from Elite Prospects team transfers page
 * Uses axios/cheerio for simple HTML scraping
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { saveToCache, getFromCache } = require('./src/scripts/caching-system');
const { requestWithRetry, delayBetweenRequests } = require('./utils/request-helper');

const TRANSFERS_URL = 'https://www.eliteprospects.com/team/18066/arizona-state-univ/transfers';
const CACHE_KEY = 'asu_transfers';
const CACHE_TTL = 3600000; // 1 hour in ms

/**
 * Extract player ID from Elite Prospects URL
 */
function extractPlayerId(url) {
    const match = url.match(/\/player\/(\d+)\//);
    return match ? match[1] : null;
}

/**
 * Scrapes the Elite Prospects transfers page for transaction data
 * @returns {Promise<Object>} Object with incoming and outgoing transfers
 */
async function scrapeTransferData() {
    console.log('[Transfer Scraper] Starting to scrape transfer data...');

    // Check cache first
    try {
        const cached = await getFromCache(CACHE_KEY);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp) < CACHE_TTL) {
            console.log('[Transfer Scraper] Returning cached transfer data');
            return cached.data;
        }
    } catch (error) {
        console.log('[Transfer Scraper] No valid cache found, scraping fresh data');
    }

    try {
        console.log(`[Transfer Scraper] Fetching ${TRANSFERS_URL}`);
        const { data: html } = await requestWithRetry(TRANSFERS_URL);
        const $ = cheerio.load(html);

        const incoming = [];
        const outgoing = [];

        // Parse the transfers page structure
        // Look for sections with "Joining" and "Leaving"

        // Find all transfer entries
        $('table.transfers, .transfers-table, div.transfer-list').each((i, table) => {
            $(table).find('tr, .transfer-item').each((j, row) => {
                const $row = $(row);
                const text = $row.text();

                // Skip header rows
                if (text.includes('Player') && text.includes('From')) return;

                const playerLink = $row.find('a[href*="/player/"]').first();
                const teamLinks = $row.find('a[href*="/team/"]');

                if (playerLink.length) {
                    const playerName = playerLink.text().trim();
                    const playerUrl = playerLink.attr('href');
                    const playerId = extractPlayerId(playerUrl);

                    // Get the team info
                    const fromTeam = teamLinks.first().text().trim();
                    const fromTeamUrl = teamLinks.first().attr('href');

                    if (playerName) {
                        // Determine direction based on context or section
                        const entry = {
                            playerName,
                            playerUrl: playerUrl ? `https://www.eliteprospects.com${playerUrl}` : '',
                            playerId,
                            fromTeam,
                            fromTeamUrl: fromTeamUrl ? `https://www.eliteprospects.com${fromTeamUrl}` : ''
                        };

                        // Will need to determine direction from page structure
                        incoming.push(entry);
                    }
                }
            });
        });

        // Alternative parsing - look for common EP page structure
        // The page typically has sections for "Joining" and "Leaving"

        // Parse "Joining Arizona State Univ." section
        let currentSection = '';
        $('h2, h3, .section-title').each((i, header) => {
            const headerText = $(header).text().toLowerCase();
            if (headerText.includes('joining')) {
                currentSection = 'joining';
            } else if (headerText.includes('leaving')) {
                currentSection = 'leaving';
            }
        });

        // Fallback: parse all player links on the page
        const allPlayerLinks = $('a[href*="/player/"]');
        const seenPlayers = new Set();

        allPlayerLinks.each((i, link) => {
            const $link = $(link);
            const playerUrl = $link.attr('href');
            const playerName = $link.text().trim();

            // Skip if already seen or empty
            if (!playerName || seenPlayers.has(playerUrl)) return;
            seenPlayers.add(playerUrl);

            // Extract position from text like "Jonas Woo (D)" 
            const positionMatch = playerName.match(/\(([DFG])\)$/);
            const position = positionMatch ? positionMatch[1] : '';
            const cleanName = playerName.replace(/\s*\([DFG]\)$/, '').trim();

            // Find the associated team link (usually next sibling or nearby)
            const $parent = $link.parent();
            const teamLink = $parent.find('a[href*="/team/"]').first();
            const teamName = teamLink.length ? teamLink.text().trim() : '';
            const teamUrl = teamLink.length ? teamLink.attr('href') : '';

            // Find detail link for date info
            const detailLink = $parent.find('a[href*="/transfer/"]').first();
            const detailUrl = detailLink.length ? detailLink.attr('href') : '';

            // Parse date from detail URL if available (format: /transfer/2026/01/15/...)
            let transferDate = '';
            if (detailUrl) {
                const dateMatch = detailUrl.match(/\/transfer\/(\d{4})\/(\d{2})\/(\d{2})\//);
                if (dateMatch) {
                    transferDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
            }

            const entry = {
                playerName: cleanName,
                position,
                playerUrl: playerUrl.startsWith('http') ? playerUrl : `https://www.eliteprospects.com${playerUrl}`,
                playerId: extractPlayerId(playerUrl),
                team: teamName,
                teamUrl: teamUrl ? (teamUrl.startsWith('http') ? teamUrl : `https://www.eliteprospects.com${teamUrl}`) : '',
                transferDate,
                detailUrl: detailUrl ? `https://www.eliteprospects.com${detailUrl}` : ''
            };

            // Determine direction based on section context
            // For now, parse based on page structure
            const parentText = $parent.parent().text().toLowerCase();
            if (parentText.includes('joining') || parentText.includes('incoming')) {
                entry.direction = 'incoming';
                incoming.push(entry);
            } else if (parentText.includes('leaving') || parentText.includes('outgoing')) {
                entry.direction = 'outgoing';
                outgoing.push(entry);
            } else {
                // Default to incoming if unclear
                entry.direction = 'unknown';
                incoming.push(entry);
            }
        });

        const result = {
            incoming,
            outgoing,
            lastUpdated: new Date().toISOString()
        };

        console.log(`[Transfer Scraper] Found ${incoming.length} incoming, ${outgoing.length} outgoing transfers`);

        // Cache the results
        await saveToCache({
            data: result,
            timestamp: Date.now()
        }, CACHE_KEY);

        return result;

    } catch (error) {
        console.error('[Transfer Scraper] Error scraping transfers:', error.message);

        // Try to return cached data even if stale
        try {
            const cached = await getFromCache(CACHE_KEY);
            if (cached && cached.data) {
                console.log('[Transfer Scraper] Returning stale cached data due to error');
                return cached.data;
            }
        } catch (e) {
            // Ignore cache errors
        }

        return { incoming: [], outgoing: [], lastUpdated: null };
    }
}

/**
 * Fetch player photo from their profile page
 */
async function fetchPlayerPhoto(playerUrl) {
    if (!playerUrl) return null;

    try {
        await delayBetweenRequests();
        const { data: html } = await requestWithRetry(playerUrl);
        const $ = cheerio.load(html);

        // Look for profile image
        const photoUrl = $('.ProfileImage_profileImage__JLd31').attr('src') ||
            $('img[src*="files.eliteprospects.com/layout/players"]').first().attr('src');

        return photoUrl || null;
    } catch (error) {
        console.error(`[Transfer Scraper] Error fetching photo for ${playerUrl}:`, error.message);
        return null;
    }
}

/**
 * Test function to run the scraper directly
 */
async function testScraper() {
    console.log('=== Testing Transfer Scraper ===\n');
    const data = await scrapeTransferData();
    console.log('\n=== Results ===');
    console.log(JSON.stringify(data, null, 2));
    console.log(`\nIncoming transfers: ${data.incoming.length}`);
    console.log(`Outgoing transfers: ${data.outgoing.length}`);
}

// Run test if called directly
if (require.main === module) {
    testScraper().then(() => process.exit(0)).catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

module.exports = {
    scrapeTransferData,
    fetchPlayerPhoto
};
