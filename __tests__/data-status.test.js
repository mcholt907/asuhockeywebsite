// Tests for src/scripts/data-status.js (server-side Jest)
// Run: npx jest --config jest.server.config.js
//
// Same strategy as caching-system.test.js: point CACHE_DIR at a temp dir
// before requiring the module, use real filesystem I/O.

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  metrics: { count: jest.fn() },
}));

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let tmpDir;
let dataStatus;

function writeCacheEntry(key, ageMs, cacheDuration = DAY_MS) {
  const entry = {
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    data: { some: 'data' },
    cacheDuration,
  };
  fs.writeFileSync(path.join(tmpDir, key), JSON.stringify(entry));
}

function datasetByName(name) {
  return dataStatus.getDataStatus().find((d) => d.name === name);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-status-test-'));
  process.env.CACHE_DIR = tmpDir;
  jest.resetModules();
  jest.clearAllMocks();
  dataStatus = require('../src/scripts/data-status');
});

afterEach(() => {
  delete process.env.CACHE_DIR;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('getDataStatus', () => {
  test('reports a fresh cache entry as ok with source cache', () => {
    writeCacheEntry('asu_hockey_news', 1 * HOUR_MS);
    const news = datasetByName('news');
    expect(news.source).toBe('cache');
    expect(news.status).toBe('ok');
    expect(news.ageMs).toBeGreaterThanOrEqual(1 * HOUR_MS - 1000);
  });

  test('reports an entry older than its threshold as stale', () => {
    writeCacheEntry('asu_hockey_roster', 4 * DAY_MS); // threshold is 3 days
    const roster = datasetByName('roster');
    expect(roster.source).toBe('cache');
    expect(roster.status).toBe('stale');
  });

  test('reports a missing cache-only dataset as missing', () => {
    const stats = datasetByName('stats');
    expect(stats.source).toBe('none');
    expect(stats.status).toBe('missing');
  });

  test('uses the season-scoped key for the schedule dataset', () => {
    const config = require('../config/scraper-config');
    writeCacheEntry(`asu_hockey_schedule_${config.seasons.current}`, 1 * HOUR_MS);
    const schedule = datasetByName('schedule');
    expect(schedule.status).toBe('ok');
    expect(schedule.key).toBe(`asu_hockey_schedule_${config.seasons.current}`);
  });

  test('falls back to bundled fallback JSON when no cache exists', () => {
    // No asu_transfers cache written — the committed fallback file is used.
    const transfers = datasetByName('transfers');
    expect(transfers.source).toBe('fallback');
    expect(transfers.file).toBe('data/asu_transfers_fallback.json');
    expect(typeof transfers.ageMs).toBe('number');
  });

  test('prefers the fresher of cache vs fallback', () => {
    // Cache much fresher than the committed fallback's lastUpdated.
    writeCacheEntry('asu_transfers', 1 * HOUR_MS);
    const transfers = datasetByName('transfers');
    expect(transfers.source).toBe('cache');
    expect(transfers.status).toBe('ok');
  });

  test('reports the hand-maintained recruiting file as static and never alerting', () => {
    const recruiting = datasetByName('recruiting');
    expect(recruiting.source).toBe('static');
    expect(recruiting.alert).toBe(false);
    expect(recruiting.status).toBe('ok');
  });
});

describe('getCooldownStatus', () => {
  test('lists active and expired cooldown markers', () => {
    const activePath = path.join(tmpDir, '.403-cooldown-www.example.com');
    const expiredPath = path.join(tmpDir, '.403-cooldown-old.example.com');
    fs.writeFileSync(activePath, '');
    fs.writeFileSync(expiredPath, '');
    const old = new Date(Date.now() - 2 * DAY_MS);
    fs.utimesSync(expiredPath, old, old);

    const cooldowns = dataStatus.getCooldownStatus();
    const active = cooldowns.find((c) => c.host === 'www.example.com');
    const expired = cooldowns.find((c) => c.host === 'old.example.com');
    expect(active.active).toBe(true);
    expect(expired.active).toBe(false);
  });

  test('returns empty array when cache dir does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(dataStatus.getCooldownStatus()).toEqual([]);
  });
});
