const cron = require('node-cron');
const { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('../../scraper');
const { scrapeTransferData } = require('../../transfer-scraper');
const { scrapeAlumniData } = require('../../alumni-scraper');

// Function to refresh News & Schedule (Twice Daily)
async function refreshFrequentData() {
    console.log('[Scheduler] Starting frequent data refresh (News & Schedule)...');
    try {
        // Run in parallel
        await Promise.all([
            fetchNewsData(),
            fetchScheduleData(),
            scrapeCHNStats() // Stats change frequently too
        ]);
        console.log('[Scheduler] Frequent data refresh complete.');
    } catch (error) {
        console.error('[Scheduler] Error refreshing frequent data:', error);
    }
}

// Function to refresh Schedule & Stats only (post-game)
async function refreshPostGameData() {
    console.log('[Scheduler] Starting post-game data refresh (Schedule & Stats)...');
    try {
        await Promise.all([
            fetchScheduleData(),
            scrapeCHNStats(),
            scrapeNCHCStandings()
        ]);
        console.log('[Scheduler] Post-game data refresh complete.');
    } catch (error) {
        console.error('[Scheduler] Error refreshing post-game data:', error);
    }
}

// Function to refresh Roster & Alumni (Once Daily)
async function refreshDailyData() {
    console.log('[Scheduler] Starting daily data refresh (Roster, Alumni, Transfers)...');
    try {
        await Promise.all([
            scrapeCHNRoster(),
            scrapeAlumniData(),
            scrapeTransferData()
        ]);
        console.log('[Scheduler] Daily data refresh complete.');
    } catch (error) {
        console.error('[Scheduler] Error refreshing daily data:', error);
    }
}

function startScheduler() {
    console.log('[Scheduler] Initializing cron jobs...');

    // 1. News & Schedule: 12:00 AM and 12:00 PM every day
    // Cron expression: 0 0,12 * * *
    cron.schedule('0 0,12 * * *', () => {
        console.log('[Cron] Triggering 12:00 AM/PM refresh...');
        refreshFrequentData();
    });

    // 2. Post-game refresh: hourly 2–6 AM UTC on Sat & Sun (covers Fri/Sat night AZ games ending ~4:30 AM UTC)
    // Cron expression: 0 2,3,4,5,6 * * 6,0
    cron.schedule('0 2,3,4,5,6 * * 6,0', () => {
        console.log('[Cron] Triggering weekend post-game refresh (Schedule & Stats)...');
        refreshPostGameData();
    });

    // 4. Roster, Alumni, Transfers: 3:00 AM every day
    // Cron expression: 0 3 * * *
    cron.schedule('0 3 * * *', () => {
        console.log('[Cron] Triggering 3:00 AM daily refresh...');
        refreshDailyData();
    });

    console.log('[Scheduler] Cron jobs scheduled.');

    // 3. Immediate Refresh on Startup (Non-blocking)
    // We don't await this so the server starts immediately
    console.log('[Scheduler] Triggering immediate startup refresh...');
    refreshFrequentData();
    refreshDailyData();
}

module.exports = { startScheduler };
