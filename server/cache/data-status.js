// data-status.js
// Read-only introspection over the file cache and bundled fallback data.
// Powers /api/status and the scheduler's staleness alerting. The site's
// failure mode is not crashing â€” it's silently serving old data when an
// upstream site changes markup; this module makes data age observable.

const fs = require('fs');
const path = require('path');
const config = require('../../config/scraper-config');
const { getCacheMeta, CACHE_DIR } = require('./caching-system');
const {
  validateStandingsSnapshot,
} = require('../services/standings-snapshot');
const { validateRecruitingSnapshot, unwrapRecruitingSnapshot } = require('../services/recruiting-snapshot');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ROOT_DIR = path.join(__dirname, '..', '..');
const COOLDOWN_TTL_MS = 24 * HOUR_MS; // mirrors server/lib/request-helper.js

// Frequent datasets use 24 hours; daily runner/scheduler datasets get 48 hours.
const DATASETS = [
  { name: 'news', cacheKey: 'asu_hockey_news', staleAfterMs: DAY_MS, alert: true },
  { name: 'schedule', cacheKey: () => `asu_hockey_schedule_${config.seasons.current}`, staleAfterMs: DAY_MS, alert: true },
  { name: 'stats', cacheKey: 'asu_hockey_stats', staleAfterMs: DAY_MS, alert: true },
  {
    name: "standings",
    cacheKey: () => `nchc_standings_${config.CURRENT_SEASON}`,
    fallbackFile: "data/nchc_standings_fallback.json",
    validateStandings: true,
    staleAfterMs: DAY_MS,
    alert: true,
  },
  { name: 'roster', cacheKey: 'asu_hockey_roster', staleAfterMs: 2 * DAY_MS, alert: true },
  { name: 'transfers', cacheKey: 'asu_transfers', fallbackFile: 'data/asu_transfers_fallback.json', staleAfterMs: 2 * DAY_MS, alert: true },
  { name: 'alumni', cacheKey: 'asu_alumni', fallbackFile: 'data/asu_alumni_fallback.json', staleAfterMs: 2 * DAY_MS, alert: true },
  { name: 'recruiting', cacheKey: 'asu_hockey_recruiting', fallbackFile: 'data/asu_recruiting_fallback.json', staleAfterMs: 2 * DAY_MS, alert: true },
];

function resolveCacheKey(dataset) {
  if (!dataset.cacheKey) return null;
  return typeof dataset.cacheKey === 'function' ? dataset.cacheKey() : dataset.cacheKey;
}

// File times change at checkout/deploy and cannot prove a successful scrape.
function timestampMeta(timestamp) {
  const parsed = typeof timestamp === 'string' && timestamp.trim() ? Date.parse(timestamp) : NaN;
  const ageMs = Date.now() - parsed;
  return {
    timestamp: typeof timestamp === 'string' && timestamp.trim() ? timestamp : null,
    ageMs: Number.isFinite(ageMs) && ageMs >= 0 ? ageMs : null,
  };
}

function readFallbackMeta(relPath, { rootDir = ROOT_DIR, fileSystem = fs } = {}) {
  const filePath = path.join(rootDir, relPath);
  try {
    if (!fileSystem.existsSync(filePath)) return null;
    const parsed = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
    if (relPath.includes('recruiting') && !validateRecruitingSnapshot(unwrapRecruitingSnapshot(parsed), config.FUTURE_SEASONS)) return null;
    if (relPath.includes('transfers') && (!Array.isArray(parsed.incoming) || !Array.isArray(parsed.outgoing))) return null;
    if (relPath.includes('alumni') && (!Array.isArray(parsed.skaters) || !Array.isArray(parsed.goalies))) return null;
    return { file: relPath, ...timestampMeta(parsed.lastUpdated) };
  } catch (_) {
    return null;
  }
}

function readStaticFileMeta(
  relPath,
  { rootDir = ROOT_DIR, fileSystem = fs } = {},
) {
  const filePath = path.join(rootDir, relPath);
  try {
    if (!fileSystem.existsSync(filePath)) return null;
    const stat = fileSystem.statSync(filePath);
    return {
      file: relPath,
      timestamp: new Date(stat.mtimeMs).toISOString(),
      ageMs: Date.now() - stat.mtimeMs,
    };
  } catch (error) {
    return null;
  }
}

function readStandingsCacheMeta(
  cacheKey,
  { cacheDir = CACHE_DIR, fileSystem = fs } = {},
) {
  const cacheFile = path.join(cacheDir, cacheKey);
  try {
    if (!fileSystem.existsSync(cacheFile)) return null;
    const stat = fileSystem.statSync(cacheFile);
    const parsed = JSON.parse(fileSystem.readFileSync(cacheFile, 'utf8'));
    if (
      parsed?.data?.season !== config.CURRENT_SEASON ||
      !validateStandingsSnapshot(parsed.data)
    ) {
      return null;
    }

    return {
      key: cacheKey,
      ...timestampMeta(parsed.timestamp),
      cacheDuration: parsed.cacheDuration,
      sizeBytes: stat.size,
    };
  } catch (_) {
    return null;
  }
}

function readStandingsFallbackMeta(
  relPath,
  { rootDir = ROOT_DIR, fileSystem = fs } = {},
) {
  const fallbackFile = path.join(rootDir, relPath);
  try {
    if (!fileSystem.existsSync(fallbackFile)) return null;
    const snapshot = JSON.parse(fileSystem.readFileSync(fallbackFile, 'utf8'));
    if (!validateStandingsSnapshot(snapshot)) return null;

    return {
      file: relPath,
      ...timestampMeta(snapshot.lastUpdated),
    };
  } catch (_) {
    return null;
  }
}

function statusFor(ageMs, staleAfterMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (staleAfterMs && ageMs > staleAfterMs) return 'stale';
  return 'ok';
}

/**
 * Returns one entry per known dataset:
 * { name, source: 'cache'|'fallback'|'static'|'none', key/file, timestamp,
 *   ageMs, staleAfterMs, status: 'ok'|'stale'|'missing'|'unknown', alert }
 */
function getDataStatus({
  rootDir = ROOT_DIR,
  cacheDir = CACHE_DIR,
  fileSystem = fs,
  environment = process.env,
} = {}) {
  return DATASETS.map((dataset) => {
    const base = { name: dataset.name, staleAfterMs: dataset.staleAfterMs, alert: dataset.alert };

    if (dataset.staticFile) {
      const meta = readStaticFileMeta(dataset.staticFile, {
        rootDir,
        fileSystem,
      });
      if (!meta) return { ...base, source: 'none', status: 'missing' };
      return { ...base, source: 'static', file: meta.file, timestamp: meta.timestamp, ageMs: meta.ageMs, status: statusFor(meta.ageMs, dataset.staleAfterMs) };
    }

    const cacheKey = resolveCacheKey(dataset);
    let cacheMeta = cacheKey
      ? dataset.validateStandings
        ? readStandingsCacheMeta(cacheKey, { cacheDir, fileSystem })
        : getCacheMeta(cacheKey)
      : null;
    if (cacheMeta) cacheMeta = { ...cacheMeta, ...timestampMeta(cacheMeta.timestamp) };
    const fallbackMeta = dataset.fallbackFile
      ? dataset.validateStandings
        ? readStandingsFallbackMeta(dataset.fallbackFile, {
            rootDir,
            fileSystem,
          })
        : readFallbackMeta(dataset.fallbackFile, { rootDir, fileSystem })
      : null;

    // Mirror serving precedence, rather than selecting the newest file.
    // Recruiting short-circuits to fallback in production; alumni/transfers
    // check fresh cache before the fallback-only branch of the shared pipeline.
    const cloudMode = environment.NODE_ENV === 'production' || environment.IS_PRERENDER === 'true';
    const fallbackOnly = cloudMode && (
      dataset.name === 'recruiting' ||
      (dataset.name === 'transfers' && environment.TRANSFER_SCRAPE_LIVE !== 'true') ||
      (dataset.name === 'alumni' && environment.ALUMNI_SCRAPE_LIVE !== 'true')
    );
    const freshCache = cacheMeta && (cacheMeta.ageMs === null || cacheMeta.ageMs <= cacheMeta.cacheDuration);
    const useCache = cacheMeta && (
      dataset.name === 'recruiting' && cloudMode ? false :
      !fallbackOnly || freshCache || !fallbackMeta
    );
    let source = null;
    let meta = null;
    if (useCache) {
      source = 'cache';
      meta = { key: cacheMeta.key, timestamp: cacheMeta.timestamp, ageMs: cacheMeta.ageMs };
    } else if (fallbackMeta) {
      source = 'fallback';
      meta = { key: cacheKey, file: fallbackMeta.file, timestamp: fallbackMeta.timestamp, ageMs: fallbackMeta.ageMs };
    }

    if (!meta) return { ...base, source: 'none', status: 'missing' };
    return { ...base, source, ...meta, status: statusFor(meta.ageMs, dataset.staleAfterMs) };
  });
}

/**
 * Lists 403-cooldown markers written by server/lib/request-helper.js:
 * { host, since, active } â€” active markers mean live scraping of that host
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

module.exports = {
  getDataStatus,
  getCooldownStatus,
  DATASETS,
  resolveCacheKey,
  readStandingsCacheMeta,
  readStandingsFallbackMeta,
};
