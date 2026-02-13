/**
 * Alumni Scraper - "Where Are They Now?"
 * Scrapes former player data from Elite Prospects team alumni page
 * V3: Captures ALL team entries per player with individual stats per team
 */

const cheerio = require('cheerio');
const { saveToCache, getFromCache } = require('./src/scripts/caching-system');
const { requestWithRetry } = require('./utils/request-helper');

const BASE_URL = 'https://www.eliteprospects.com/team/18066/arizona-state-univ/where-are-they-now';
const CACHE_KEY = 'asu_alumni';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

// Request coalescing
let alumniPromise = null;

/**
 * Extract player ID from Elite Prospects URL
 */
function extractPlayerId(url) {
    const match = url.match(/\/player\/(\d+)\//);
    return match ? match[1] : null;
}

/**
 * Parse position from player text like "Josh Doan (W/C)"
 */
function parsePlayerInfo(text) {
    const posMatch = text.match(/\(([^)]+)\)$/);
    const position = posMatch ? posMatch[1] : '';
    const name = text.replace(/\s*\([^)]*\)$/, '').trim();
    return { name, position };
}

/**
 * Scrape a single page - returns rows exactly as they appear in the EP table
 * Each row with team data becomes a separate entry
 * Players with "totals" row followed by team rows will have multiple entries
 * 
 * @param {string} url - The URL to scrape
 * @param {string} type - 'skaters' or 'goalies'
 * @returns {Promise<{entries: Array, nextPage: string|null}>}
 */
async function scrapePage(url, type) {
    console.log(`[Alumni Scraper] Fetching: ${url}`);
    const { data: html } = await requestWithRetry(url);
    const $ = cheerio.load(html);

    const entries = [];
    let currentPlayer = null;

    // Process each table row
    $('table tbody tr').each((i, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        // Check if this row has a player link
        const playerLink = $row.find('a[href*="/player/"]').first();
        const teamLinks = $row.find('a[href*="/team/"]');
        const leagueLinks = $row.find('a[href*="/league/"]');

        // Get all text from cells for stats parsing
        const cellTexts = [];
        cells.each((j, cell) => {
            cellTexts.push($(cell).text().trim());
        });

        // Extract numeric values for stats
        // Exclude row numbers like "1.", "2." by only matching pure integers or proper decimals/percentages
        const numericCells = cellTexts
            .filter(t => {
                const val = t.replace(',', '').trim();
                // Match: integers, decimals (X.XX), or percentages (X.XX%)
                // Also match SV% format like .938, .916
                // Exclude: numbers ending with just a period like "1." (row numbers)
                return /^\d+$/.test(val) ||                    // Pure integers: 35, 17, 0
                    /^\d+\.\d+%?$/.test(val) ||             // Decimals: 3.14, 93.5%
                    /^\.\d+$/.test(val) ||                  // SV% format: .938, .916
                    val === '-';                             // Dash for missing values
            })
            .map(t => t === '-' ? '-' : t.replace(',', '').trim());

        if (playerLink.length > 0) {
            // This is a player row
            const playerText = playerLink.text().trim();
            const playerHref = playerLink.attr('href') || '';
            const { name, position } = parsePlayerInfo(playerText);

            if (!name) return;

            const playerUrl = playerHref.startsWith('http') ? playerHref : `https://www.eliteprospects.com${playerHref}`;

            currentPlayer = {
                name,
                position,
                playerUrl,
                playerId: extractPlayerId(playerHref)
            };

            // Check if this row has team info (single-team player or team row)
            if (teamLinks.length > 0) {
                const $team = teamLinks.first();
                const teamName = $team.text().trim();
                const teamHref = $team.attr('href') || '';
                const teamUrl = teamHref.startsWith('http') ? teamHref : `https://www.eliteprospects.com${teamHref}`;

                let league = '';
                let leagueUrl = '';
                if (leagueLinks.length > 0) {
                    const $league = leagueLinks.first();
                    league = $league.text().trim();
                    const leagueHref = $league.attr('href') || '';
                    leagueUrl = leagueHref.startsWith('http') ? leagueHref : `https://www.eliteprospects.com${leagueHref}`;
                }

                // Build entry with stats
                const entry = {
                    ...currentPlayer,
                    team: teamName,
                    teamUrl,
                    league,
                    leagueUrl,
                    isTotals: false
                };

                // Add stats based on type
                if (type === 'skaters') {
                    // Skater stats: GP, G, A, TP, PIM (last 5 numeric values typically)
                    if (numericCells.length >= 5) {
                        const offset = numericCells.length - 5;
                        entry.gp = numericCells[offset] || '-';
                        entry.g = numericCells[offset + 1] || '-';
                        entry.a = numericCells[offset + 2] || '-';
                        entry.tp = numericCells[offset + 3] || '-';
                        entry.pim = numericCells[offset + 4] || '-';
                    }
                } else {
                    // Goalie stats: GP, GAA, SV%, W, L, etc.
                    // EP goalie columns vary, but typically: GP, GAA, SV%, and possibly more
                    if (numericCells.length >= 1) {
                        entry.gp = numericCells[0] || '-';
                    }
                    if (numericCells.length >= 2) {
                        entry.gaa = numericCells[1] || '-';
                    }
                    if (numericCells.length >= 3) {
                        entry.svPct = numericCells[2] || '-';
                    }
                }

                entries.push(entry);
            } else {
                // This is a "totals" row - player with multiple teams
                // Create a totals entry
                const entry = {
                    ...currentPlayer,
                    team: '',
                    teamUrl: '',
                    league: 'totals',
                    leagueUrl: '',
                    isTotals: true
                };

                if (type === 'skaters' && numericCells.length >= 5) {
                    const offset = numericCells.length - 5;
                    entry.gp = numericCells[offset] || '-';
                    entry.g = numericCells[offset + 1] || '-';
                    entry.a = numericCells[offset + 2] || '-';
                    entry.tp = numericCells[offset + 3] || '-';
                    entry.pim = numericCells[offset + 4] || '-';
                } else if (type === 'goalies') {
                    if (numericCells.length >= 1) entry.gp = numericCells[0] || '-';
                    if (numericCells.length >= 2) entry.gaa = numericCells[1] || '-';
                    if (numericCells.length >= 3) entry.svPct = numericCells[2] || '-';
                }

                entries.push(entry);
            }

        } else if (currentPlayer && teamLinks.length > 0) {
            // This is a continuation row (additional team for current player)
            const $team = teamLinks.first();
            const teamName = $team.text().trim();
            const teamHref = $team.attr('href') || '';
            const teamUrl = teamHref.startsWith('http') ? teamHref : `https://www.eliteprospects.com${teamHref}`;

            let league = '';
            let leagueUrl = '';
            if (leagueLinks.length > 0) {
                const $league = leagueLinks.first();
                league = $league.text().trim();
                const leagueHref = $league.attr('href') || '';
                leagueUrl = leagueHref.startsWith('http') ? leagueHref : `https://www.eliteprospects.com${leagueHref}`;
            }

            const entry = {
                ...currentPlayer,
                team: teamName,
                teamUrl,
                league,
                leagueUrl,
                isTotals: false
            };

            // Add stats for this team row
            if (type === 'skaters' && numericCells.length >= 5) {
                const offset = numericCells.length - 5;
                entry.gp = numericCells[offset] || '-';
                entry.g = numericCells[offset + 1] || '-';
                entry.a = numericCells[offset + 2] || '-';
                entry.tp = numericCells[offset + 3] || '-';
                entry.pim = numericCells[offset + 4] || '-';
            } else if (type === 'goalies') {
                if (numericCells.length >= 1) entry.gp = numericCells[0] || '-';
                if (numericCells.length >= 2) entry.gaa = numericCells[1] || '-';
                if (numericCells.length >= 3) entry.svPct = numericCells[2] || '-';
            }

            entries.push(entry);
        }
    });

    // Check for pagination
    let nextPage = null;
    $('a').each((i, el) => {
        const $el = $(el);
        const text = $el.text().trim().toLowerCase();
        const href = $el.attr('href') || '';

        if (text === 'next' && href.includes('page=')) {
            nextPage = href.startsWith('http') ? href : `https://www.eliteprospects.com${href}`;
        }
    });

    console.log(`[Alumni Scraper] Found ${entries.length} ${type} entries on this page`);

    return { entries, nextPage };
}

/**
 * Scrape all pages for a given type (skaters or goalies)
 */
async function scrapeAllPages(type) {
    const allEntries = [];
    let url = type === 'goalies'
        ? `${BASE_URL}?tab=goalies`
        : BASE_URL;

    let pageCount = 0;
    const maxPages = 10;

    while (url && pageCount < maxPages) {
        pageCount++;
        const { entries, nextPage } = await scrapePage(url, type);
        allEntries.push(...entries);
        url = nextPage;

        if (url) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`[Alumni Scraper] Total ${type} entries: ${allEntries.length} (from ${pageCount} pages)`);
    return allEntries;
}

/**
 * Main function to scrape all alumni data
 */
async function scrapeAlumniData() {
    console.log('[Alumni Scraper] Starting to scrape alumni data...');

    // Check cache first - caching system handles TTL automatically
    try {
        const cached = getFromCache(CACHE_KEY);
        if (cached) {
            console.log('[Alumni Scraper] Returning cached alumni data');
            return cached;
        }
    } catch (error) {
        console.log('[Alumni Scraper] No valid cache found, scraping fresh data');
    }

    // Request Coalescing: if a scrape is already in progress, return that promise
    if (alumniPromise) {
        console.log('[Alumni Scraper] Scrape already in progress. Returning shared promise.');
        return await alumniPromise;
    }

    alumniPromise = (async () => {
        try {
            const [skaters, goalies] = await Promise.all([
                scrapeAllPages('skaters'),
                scrapeAllPages('goalies')
            ]);

            const result = {
                skaters,
                goalies,
                lastUpdated: new Date().toISOString()
            };

            // Count unique players
            const uniqueSkaters = new Set(skaters.map(s => s.playerId)).size;
            const uniqueGoalies = new Set(goalies.map(g => g.playerId)).size;

            console.log(`[Alumni Scraper] Complete - ${skaters.length} skater entries (${uniqueSkaters} unique), ${goalies.length} goalie entries (${uniqueGoalies} unique)`);

            // Log NHL players
            const nhlEntries = [...skaters, ...goalies].filter(p => p.league === 'NHL');
            if (nhlEntries.length > 0) {
                console.log('[Alumni Scraper] NHL entries:');
                nhlEntries.forEach(p => console.log(`  - ${p.name} (${p.team})`));
            }

            // Cache results - pass result directly, caching system wraps with timestamp
            await saveToCache(result, CACHE_KEY, CACHE_TTL);

            return result;

        } catch (error) {
            console.error('[Alumni Scraper] Error:', error.message);

            // Try to return stale cache on error (ignoreExpiration=true)
            try {
                const stale = getFromCache(CACHE_KEY, true);
                if (stale) {
                    console.log('[Alumni Scraper] Returning stale cached data');
                    return stale;
                }
            } catch (e) { }

            return { skaters: [], goalies: [], lastUpdated: null };
        } finally {
            alumniPromise = null;
        }
    })();

    return await alumniPromise;
}

/**
 * Test function
 */
async function testScraper() {
    console.log('=== Testing Alumni Scraper V3 ===\n');
    const data = await scrapeAlumniData();
    console.log(`\n=== Results ===`);
    console.log(`Skater entries: ${data.skaters.length}`);
    console.log(`Goalie entries: ${data.goalies.length}`);

    // Show Ryan Kirwan (multi-team player) as example
    console.log('\n=== Multi-team example (Ryan Kirwan) ===');
    data.skaters.filter(s => s.name.includes('Kirwan')).forEach(e => {
        console.log(`  ${e.isTotals ? '[TOTALS]' : e.team} [${e.league}] - GP:${e.gp} G:${e.g} A:${e.a} P:${e.tp} PIM:${e.pim}`);
    });

    // Show sample goalies with stats
    console.log('\n=== Sample Goalies ===');
    data.goalies.slice(0, 5).forEach(g => {
        console.log(`  ${g.name} - ${g.team || 'TOTALS'} [${g.league}] | GP:${g.gp} GAA:${g.gaa || '-'} SV%:${g.svPct || '-'}`);
    });
}

if (require.main === module) {
    testScraper().then(() => process.exit(0)).catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

module.exports = { scrapeAlumniData };
