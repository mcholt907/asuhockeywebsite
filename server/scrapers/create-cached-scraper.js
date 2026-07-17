// create-cached-scraper.js
// Shared scrape pipeline: fresh-cache check → fallback-only short-circuit →
// SWR (serve stale, refresh in background) → request-coalesced blocking
// scrape → validate/health-guard → save → error recovery (stale → fallback).
// Replaces the four hand-rolled copies that lived in scraper.js,
// transfer-scraper.js, alumni-scraper.js and recruiting-scraper.js.

const Sentry = require("@sentry/node");
const { saveToCache, getFromCache } = require("../cache/caching-system");

function createCachedScraper({
  name,
  cacheKey,
  ttl,
  scrape,
  validate = () => true,
  fallback = null,
  fallbackOnly = () => false,
  swr = true,
  normalizeCached = (data) => data,
  onScrapeError = null,
}) {
  // Coalescing: one in-flight scrape per scraper, shared by concurrent callers.
  let inFlight = null;

  const resolveKey = () =>
    typeof cacheKey === "function" ? cacheKey() : cacheKey;

  function recoverWithStaleOrFallback(key) {
    const stale = getFromCache(key, true);
    if (stale) {
      console.log(`[${name}] Recovering with stale cache`);
      return normalizeCached(stale);
    }
    const bundled = fallback && fallback();
    if (bundled) {
      console.log(`[${name}] Recovering with bundled fallback`);
      return bundled;
    }
    return undefined;
  }

  async function runScrape(key, scrapeArgs) {
    const start = Date.now();
    try {
      const data = await scrape(scrapeArgs);
      if (validate(data)) {
        await saveToCache(data, key, ttl);
        return data;
      }
      console.warn(`[${name}] Scrape result failed validation; not caching`);
      const recovered = recoverWithStaleOrFallback(key);
      return recovered !== undefined ? recovered : data;
    } catch (error) {
      console.error(`[${name}] Scrape failed:`, error.message);
      const recovered = recoverWithStaleOrFallback(key);
      if (recovered !== undefined) return recovered;
      if (onScrapeError) return onScrapeError(error);
      throw error;
    } finally {
      Sentry.metrics.distribution(
        `scraper.${name}.duration`,
        Date.now() - start,
        { unit: "millisecond" },
      );
    }
  }

  function startCoalescedScrape(key, scrapeArgs) {
    if (!inFlight) {
      inFlight = runScrape(key, scrapeArgs).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  return async function fetchData(options = {}) {
    const { force = false, bypassCache = false, scrapeArgs } = options;
    const key = resolveKey();

    if (!bypassCache) {
      // force skips only this fresh-cache check; the SWR branch below still
      // serves current data and refreshes in the background, matching the
      // pre-refactor force-refresh semantics (post-game cron relies on this).
      if (!force) {
        try {
          const fresh = getFromCache(key);
          if (fresh) {
            console.log(`[${name}] Returning fresh cached data`);
            return normalizeCached(fresh);
          }
        } catch (error) {
          console.error(`[${name}] Cache read failed:`, error.message);
        }
      }

      // EP scrapers run fallback-only in production/prerender (cloud IPs 403).
      if (fallbackOnly()) {
        const bundled = fallback && fallback();
        if (bundled) {
          console.log(`[${name}] Fallback-only mode; returning bundled data`);
          return bundled;
        }
      }

      if (swr) {
        try {
          const stale = getFromCache(key, true);
          if (stale) {
            console.log(
              `[${name}] Serving stale cache; refreshing in background`,
            );
            startCoalescedScrape(key, scrapeArgs).catch((error) =>
              console.error(
                `[${name}] Background refresh failed:`,
                error.message,
              ),
            );
            return normalizeCached(stale);
          }
        } catch (error) {
          console.error(`[${name}] Stale cache read failed:`, error.message);
        }
      }
    }

    console.log(`[${name}] No usable cache; scraping live`);
    return startCoalescedScrape(key, scrapeArgs);
  };
}

module.exports = { createCachedScraper };
