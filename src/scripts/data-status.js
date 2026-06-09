// data-status.js
// Read-only introspection over the file cache and bundled fallback data.
// Powers /api/status and the scheduler's staleness alerting. The site's
// failure mode is not crashing — it's silently serving old data when an
// upstream site changes markup; this module makes data age observable.

const fs = require('fs');
const path = require('path');
const config = require('../../config/scraper-config');
const { getCacheMeta, CACHE_DIR } = require('./caching-system');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ROOT_DIR = path.join(__dirname, '..', '..');
const COOLDOWN_TTL_MS = 24 * HOUR_MS; // mirrors utils/request-helper.js

// staleAfterMs ≈ 2–3× each dataset's refresh cadence (see scheduler.js).
// Transfers/alumni run from bundled fallback JSON in production (EP 403s
// cloud IPs); that JSON refreshes weekly via scripts/refresh-and-push.cmd,
// so its threshold is 3 weeks. `alert: false` datasets are hand-maintained
// and reported for visibility only.
const DATASETS = [
  { name: 'news', cacheKey: 'asu_hockey_news', staleAfterMs: DAY_MS, alert: true },
  { name: 'schedule', cacheKey: () => `asu_hockey_schedule_${config.seasons.current}`, staleAfterMs: DAY_MS, alert: true },
  { name: 'stats', cacheKey: 'asu_hockey_stats', staleAfterMs: DAY_MS, alert: true },
  { name: 'standings', cacheKey: 'nchc_standings', staleAfterMs: DAY_MS, alert: true },
  { name: 'roster', cacheKey: 'asu_hockey_roster', staleAfterMs: 3 * DAY_MS, alert: true },
  { name: 'transfers', cacheKey: 'asu_transfers', fallbackFile: 'data/asu_transfers_fallback.json', staleAfterMs: 21 * DAY_MS, alert: true },
  { name: 'alumni', cacheKey: 'asu_alumni', fallbackFile: 'data/asu_alumni_fallback.json', staleAfterMs: 21 * DAY_MS, alert: true },
  { name: 'recruiting', staticFile: 'asu_hockey_data.json', staleAfterMs: null, alert: false },
];

function resolveCacheKey(dataset) {
  if (!dataset.cacheKey) return null;
  return typeof dataset.cacheKey === 'function' ? dataset.cacheKey() : dataset.cacheKey;
}

// Fallback JSON freshness: prefer the embedded lastUpdated written by the
// refresh scripts; fall back to file mtime for files without one.
function readFallbackMeta(relPath) {
  const filePath = path.join(ROOT_DIR, relPath);
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    let lastUpdated = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      lastUpdated = parsed.lastUpdated || null;
    } catch (_) {
      // Unparseable fallback — report mtime-based age below.
    }
    const ts = lastUpdated ? new Date(lastUpdated).getTime() : stat.mtimeMs;
    return {
      file: relPath,
      timestamp: lastUpdated || new Date(stat.mtimeMs).toISOString(),
      ageMs: Number.isFinite(ts) ? Date.now() - ts : null,
    };
  } catch (error) {
    console.error(`[Data Status] Failed to read fallback meta for ${relPath}:`, error.message);
    return null;
  }
}

function readStaticFileMeta(relPath) {
  const filePath = path.join(ROOT_DIR, relPath);
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    return {
      file: relPath,
      timestamp: new Date(stat.mtimeMs).toISOString(),
      ageMs: Date.now() - stat.mtimeMs,
    };
  } catch (error) {
    return null;
  }
}

function statusFor(ageMs, staleAfterMs) {
  if (ageMs === null || ageMs === undefined) return 'unknown';
  if (staleAfterMs && ageMs > staleAfterMs) return 'stale';
  return 'ok';
}

/**
 * Returns one entry per known dataset:
 * { name, source: 'cache'|'fallback'|'static'|'none', key/file, timestamp,
 *   ageMs, staleAfterMs, status: 'ok'|'stale'|'missing'|'unknown', alert }
 */
function getDataStatus() {
  return DATASETS.map((dataset) => {
    const base = { name: dataset.name, staleAfterMs: dataset.staleAfterMs, alert: dataset.alert };

    if (dataset.staticFile) {
      const meta = readStaticFileMeta(dataset.staticFile);
      if (!meta) return { ...base, source: 'none', status: 'missing' };
      return { ...base, source: 'static', file: meta.file, timestamp: meta.timestamp, ageMs: meta.ageMs, status: statusFor(meta.ageMs, dataset.staleAfterMs) };
    }

    const cacheKey = resolveCacheKey(dataset);
    const cacheMeta = cacheKey ? getCacheMeta(cacheKey) : null;
    const fallbackMeta = dataset.fallbackFile ? readFallbackMeta(dataset.fallbackFile) : null;

    // Report whichever source is fresher — in production the EP scrapers
    // never write cache (fallback-only mode), so fallback is the live source.
    let source = null;
    let meta = null;
    if (cacheMeta && (!fallbackMeta || (cacheMeta.ageMs ?? Infinity) <= (fallbackMeta.ageMs ?? Infinity))) {
      source = 'cache';
      meta = { key: cacheMeta.key, timestamp: cacheMeta.timestamp, ageMs: cacheMeta.ageMs };
    } else if (fallbackMeta) {
      source = 'fallback';
      meta = { file: fallbackMeta.file, timestamp: fallbackMeta.timestamp, ageMs: fallbackMeta.ageMs };
    }

    if (!meta) return { ...base, source: 'none', status: 'missing' };
    return { ...base, source, ...meta, status: statusFor(meta.ageMs, dataset.staleAfterMs) };
  });
}

/**
 * Lists 403-cooldown markers written by utils/request-helper.js:
 * { host, since, active } — active markers mean live scraping of that host
 * is currently skipped.
 */
function getCooldownStatus() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return [];
    return fs.readdirSync(CACHE_DIR)
      .filter((name) => name.startsWith('.403-cooldown-'))
      .map((name) => {
        const stat = fs.statSync(path.join(CACHE_DIR, name));
        return {
          host: name.replace('.403-cooldown-', ''),
          since: new Date(stat.mtimeMs).toISOString(),
          active: Date.now() - stat.mtimeMs < COOLDOWN_TTL_MS,
        };
      });
  } catch (error) {
    console.error('[Data Status] Failed to list cooldown markers:', error.message);
    return [];
  }
}

module.exports = { getDataStatus, getCooldownStatus, DATASETS, resolveCacheKey };
