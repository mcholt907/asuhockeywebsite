const cron = require('node-cron');
const Sentry = require('@sentry/node');
const { fetchNewsData, fetchScheduleData, scrapeCHNStats, scrapeCHNRoster, scrapeNCHCStandings } = require('../../scraper');
const { scrapeTransferData } = require('../../transfer-scraper');
const { scrapeAlumniData } = require('../../alumni-scraper');

const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// Run fn; if it throws, log + Sentry-report and retry once after RETRY_DELAY_MS.
// Without retry, a transient failure means stale data until the next scheduled run.
function withRetry(label, fn) {
    return Promise.resolve()
        .then(fn)
        .catch(err => {
            console.error(`[Scheduler] ${label} failed; retrying in ${RETRY_DELAY_MS / 60000} min`, err);
            Sentry.captureException(err, { tags: { component: 'scheduler', task: label } });
            setTimeout(() => {
                Promise.resolve().then(fn).then(
                    () => console.log(`[Scheduler] ${label} retry succeeded.`),
                    retryErr => {
                        console.error(`[Scheduler] ${label} retry also failed.`, retryErr);
                        Sentry.captureException(retryErr, {
                            tags: { component: 'scheduler', task: label, retry: 'true' },
                        });
                    }
                );
            }, RETRY_DELAY_MS);
        });
}

// Function to refresh News & Schedule (Twice Daily)
async function refreshFrequentData() {
    console.log('[Scheduler] Starting frequent data refresh (News & Schedule)...');
    await Promise.all([
        fetchNewsData(),
        fetchScheduleData(),
        scrapeCHNStats(),
        scrapeNCHCStandings()
    ]);
    console.log('[Scheduler] Frequent data refresh complete.');
}

// Function to refresh Schedule & Stats only (post-game)
async function refreshPostGameData() {
    console.log('[Scheduler] Starting post-game data refresh (Schedule & Stats)...');
    await Promise.all([
        fetchNewsData(),
        fetchScheduleData(true),      // forceRefresh — bypass valid cache so post-game results are scraped immediately
        scrapeCHNStats(true),          // forceRefresh
        scrapeNCHCStandings(true)      // forceRefresh
    ]);
    console.log('[Scheduler] Post-game data refresh complete.');
}

// Function to refresh Roster & Alumni (Once Daily)
async function refreshDailyData() {
    console.log('[Scheduler] Starting daily data refresh (Roster, Alumni, Transfers)...');
    await Promise.all([
        scrapeCHNRoster(),
        scrapeAlumniData(),
        scrapeTransferData()
    ]);
    console.log('[Scheduler] Daily data refresh complete.');
}

function startScheduler() {
    console.log('[Scheduler] Initializing cron jobs...');

    // 1. News & Schedule: 12:00 AM and 12:00 PM every day
    // Cron expression: 0 0,12 * * *
    cron.schedule('0 0,12 * * *', () => {
        console.log('[Cron] Triggering 12:00 AM/PM refresh...');
        withRetry('frequent', refreshFrequentData);
    });

    // 2. Post-game refresh: hourly 2–6 AM UTC on Sat & Sun (covers Fri/Sat night AZ games ending ~4:30 AM UTC)
    // Cron expression: 0 2,3,4,5,6 * * 6,0
    cron.schedule('0 2,3,4,5,6 * * 6,0', () => {
        console.log('[Cron] Triggering weekend post-game refresh (Schedule & Stats)...');
        withRetry('post-game', refreshPostGameData);
    });

    // 4. Roster, Alumni, Transfers: 3:00 AM every day
    // Cron expression: 0 3 * * *
    cron.schedule('0 3 * * *', () => {
        console.log('[Cron] Triggering 3:00 AM daily refresh...');
        withRetry('daily', refreshDailyData);
    });

    console.log('[Scheduler] Cron jobs scheduled.');

    // 3. Immediate Refresh on Startup (Non-blocking)
    // We don't await this so the server starts immediately
    console.log('[Scheduler] Triggering immediate startup refresh...');
    withRetry('startup-frequent', refreshFrequentData);
    withRetry('startup-daily', refreshDailyData);
}

module.exports = { startScheduler };
