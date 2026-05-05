// scrape-health.js
// Detects empty/degraded scrape results before they overwrite a good cache.
// When a scraper's selectors break (e.g. a target site redeploys hashed CSS
// classes), the network request still succeeds but results come back empty.
// Without this guard saveToCache would happily overwrite the last-known-good
// cache with [], pushing the failure all the way to the UI.

const Sentry = require('@sentry/node');

/**
 * Report scrape health to Sentry and return whether the result is healthy.
 *
 * @param {string} scraperName - identifier used in Sentry tags (e.g. 'alumni').
 * @param {Record<string, number>} counts - counts of items per result section
 *   (e.g. { skaters: 42, goalies: 7 }). Any zero count flags the scrape as
 *   unhealthy.
 * @returns {boolean} true if all counts are > 0.
 */
function reportScrapeHealth(scraperName, counts) {
    const emptySections = Object.entries(counts)
        .filter(([, n]) => !n || n === 0)
        .map(([k]) => k);

    if (emptySections.length === 0) return true;

    const message = `[scrape-health] ${scraperName} returned empty: ${emptySections.join(', ')}`;
    console.warn(message, counts);
    Sentry.captureMessage(message, {
        level: 'warning',
        tags: { component: 'scrape-health', scraper: scraperName },
        extra: { counts },
    });
    return false;
}

module.exports = { reportScrapeHealth };
