// cache-maintenance.js
// Daily scheduler job (see scheduler.js): alert on stale datasets and prune
// dead files from the cache directory.
//
// Pruning never touches the cache keys of current datasets â€” SWR serves
// stale data indefinitely when scrapes keep failing, and that is the last
// line of defense. Only abandoned files are removed: orphaned atomic-write
// tmp files, expired 403-cooldown markers, and keys no longer produced by
// any scraper (e.g. previous seasons' schedule caches).

const fs = require('fs');
const path = require('path');
const Sentry = require('@sentry/node');
const { CACHE_DIR, DEFAULT_CACHE_DURATION } = require('./caching-system');
const { getDataStatus, getCooldownStatus, DATASETS, resolveCacheKey } = require('./data-status');

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_TTL_MS = DAY_MS; // mirrors server/lib/request-helper.js
const TMP_FILE_MAX_AGE_MS = DAY_MS;
const UNKNOWN_FILE_MAX_AGE_MS = 7 * DAY_MS;
const ABANDONED_TTL_MULTIPLIER = 3;

// Keys legitimately written by current scrapers â€” never pruned.
// asu_hockey_recruiting is only written by local curation scripts but is
// cheap to protect.
function getProtectedKeys() {
  const keys = DATASETS.map(resolveCacheKey).filter(Boolean);
  keys.push('asu_hockey_recruiting');
  return new Set(keys);
}

function fileAgeMs(filePath) {
  return Date.now() - fs.statSync(filePath).mtimeMs;
}

// Age of a cache entry by its embedded timestamp; falls back to mtime when
// the file isn't a {timestamp, data} wrapper.
function entryAgeAndTtl(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const ts = new Date(parsed.timestamp).getTime();
    return {
      ageMs: Number.isFinite(ts) ? Date.now() - ts : fileAgeMs(filePath),
      ttlMs: parsed.cacheDuration || DEFAULT_CACHE_DURATION,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Delete abandoned files from CACHE_DIR. Returns the removed filenames.
 */
function pruneCache() {
  const removed = [];
  if (!fs.existsSync(CACHE_DIR)) return removed;

  const protectedKeys = getProtectedKeys();

  for (const name of fs.readdirSync(CACHE_DIR)) {
    const filePath = path.join(CACHE_DIR, name);
    try {
      if (!fs.statSync(filePath).isFile()) continue;

      let shouldRemove = false;
      if (name.includes('.tmp.')) {
        // Orphaned atomic-write temp file â€” a completed write renames it away.
        shouldRemove = fileAgeMs(filePath) > TMP_FILE_MAX_AGE_MS;
      } else if (name.startsWith('.403-cooldown-')) {
        shouldRemove = fileAgeMs(filePath) > COOLDOWN_TTL_MS;
      } else if (!protectedKeys.has(name)) {
        const entry = entryAgeAndTtl(filePath);
        shouldRemove = entry
          ? entry.ageMs > entry.ttlMs * ABANDONED_TTL_MULTIPLIER
          : fileAgeMs(filePath) > UNKNOWN_FILE_MAX_AGE_MS;
      }

      if (shouldRemove) {
        fs.unlinkSync(filePath);
        removed.push(name);
        console.log(`[Cache Maintenance] Pruned ${name}`);
      }
    } catch (error) {
      console.error(`[Cache Maintenance] Failed to inspect/prune ${name}:`, error.message);
    }
  }
  return removed;
}

/**
 * Sentry-warn for every alerting dataset that is stale or missing, so
 * selector breakage and dead refresh jobs surface instead of silently
 * freezing the site's data. Returns the alerts raised.
 */
function checkDataStaleness() {
  const alerts = [];
  for (const dataset of getDataStatus()) {
    if (!dataset.alert) continue;
    if (dataset.status !== 'stale' && dataset.status !== 'missing') continue;

    const ageDays = dataset.ageMs != null ? (dataset.ageMs / DAY_MS).toFixed(1) : 'unknown';
    const message = `[cache-maintenance] dataset '${dataset.name}' is ${dataset.status} (age: ${ageDays} days, source: ${dataset.source})`;
    console.warn(message);
    Sentry.captureMessage(message, {
      level: 'warning',
      tags: { component: 'cache-maintenance', dataset: dataset.name, status: dataset.status },
      extra: { dataset, cooldowns: getCooldownStatus() },
    });
    alerts.push({ name: dataset.name, status: dataset.status, ageMs: dataset.ageMs ?? null });
  }
  if (alerts.length === 0) {
    console.log('[Cache Maintenance] All datasets fresh.');
  }
  return alerts;
}

async function runCacheMaintenance() {
  const removed = pruneCache();
  const alerts = checkDataStaleness();
  console.log(`[Cache Maintenance] Done â€” pruned ${removed.length} file(s), ${alerts.length} staleness alert(s).`);
  return { removed, alerts };
}

module.exports = { pruneCache, checkDataStaleness, runCacheMaintenance };
