// caching-system.js
const fs = require('fs');
const path = require('path');
const Sentry = require('@sentry/node');

// Default cache duration, can be overridden if needed by specific scrapers
const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
// CACHE_DIR env override exists so server-side tests can isolate to a tmp dir
// without touching the real cache. Unset in production.
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'cache');

function saveToCache(data, filename, duration = DEFAULT_CACHE_DURATION) {
  if (!filename) {
    console.error('Filename not provided to saveToCache');
    return;
  }
  const cacheFilePath = path.join(CACHE_DIR, filename);
  // Unique tmp path keeps concurrent writers from clobbering each other.
  const tmpPath = `${cacheFilePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    const cacheData = {
      timestamp: new Date().toISOString(),
      data: data,
      cacheDuration: duration, // Store duration for potential future use
    };

    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // Write to a temp file then rename — rename is atomic when src and dst are
    // on the same filesystem, so a crash mid-write can't leave a half-written
    // cache file at the canonical path.
    fs.writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2));
    fs.renameSync(tmpPath, cacheFilePath);
    console.log(`Data saved to cache at ${cacheFilePath}`);
  } catch (error) {
    console.error(`[Cache System] Failed to save cache for ${filename}:`, error.message);
    Sentry.captureException(error, { tags: { component: 'caching-system', filename } });
    // Best-effort cleanup of the orphaned tmp file.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {
      // Ignore — Sentry already has the original failure.
    }
  }
}

function getFromCache(filename, ignoreExpiration = false) {
  if (!filename) {
    console.error('Filename not provided to getFromCache');
    return null;
  }
  const cacheFilePath = path.join(CACHE_DIR, filename);

  try {
    if (!fs.existsSync(cacheFilePath)) {
      console.log(`Cache file not found: ${cacheFilePath}`);
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: filename, reason: 'missing' } });
      return null;
    }

    const fileContents = fs.readFileSync(cacheFilePath, 'utf8');
    if (!fileContents) {
      console.log(`Cache file is empty: ${cacheFilePath}`);
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: filename, reason: 'empty' } });
      return null;
    }

    const cacheData = JSON.parse(fileContents);
    const cacheTime = new Date(cacheData.timestamp).getTime();
    const currentTime = new Date().getTime();
    const cacheDuration = cacheData.cacheDuration || DEFAULT_CACHE_DURATION;

    // Check if cache is still valid
    if (currentTime - cacheTime > cacheDuration) {
      if (ignoreExpiration) {
        console.log(`Cache expired for ${filename} but returning stale data (ignoreExpiration=true)`);
        Sentry.metrics.count('cache.stale_used', 1, { attributes: { key: filename } });
        return cacheData.data;
      }

      console.log(`Cache expired for ${filename}`);
      // Don't delete expired cache — let SWR serve stale data while refreshing
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: filename, reason: 'expired' } });
      return null;
    }

    console.log(`Cache hit for ${filename}`);
    Sentry.metrics.count('cache.hit', 1, { attributes: { key: filename } });
    return cacheData.data; // Return only the data part, as scraper.js expects
  } catch (error) {
    console.error(`Error reading cache for ${filename}:`, error);
    Sentry.metrics.count('cache.error', 1, { attributes: { key: filename } });

    // If there's an error (e.g., corrupted JSON), treat it as a cache miss
    if (fs.existsSync(cacheFilePath)) {
      try {
        fs.unlinkSync(cacheFilePath); // Attempt to delete corrupted cache file
        console.log(`Deleted corrupted cache file: ${cacheFilePath}`);
      } catch (delError) {
        console.error(`Error deleting corrupted cache file ${cacheFilePath}:`, delError);
      }
    }
    return null;
  }
}

module.exports = { saveToCache, getFromCache };
