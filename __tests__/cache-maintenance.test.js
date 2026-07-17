// Tests for server/cache/cache-maintenance.js (server-side Jest)
// Run: npx jest --config jest.server.config.js

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
let maintenance;
let Sentry;

function writeCacheEntry(key, ageMs, cacheDuration = DAY_MS) {
  const entry = {
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    data: { some: 'data' },
    cacheDuration,
  };
  fs.writeFileSync(path.join(tmpDir, key), JSON.stringify(entry));
}

function ageFile(name, ageMs) {
  const old = new Date(Date.now() - ageMs);
  fs.utimesSync(path.join(tmpDir, name), old, old);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-maint-test-'));
  process.env.CACHE_DIR = tmpDir;
  jest.resetModules();
  jest.clearAllMocks();
  Sentry = require('@sentry/node');
  maintenance = require('../server/cache/cache-maintenance');
});

afterEach(() => {
  delete process.env.CACHE_DIR;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('pruneCache', () => {
  test('never removes current dataset keys, even when long expired', () => {
    writeCacheEntry('asu_hockey_news', 30 * DAY_MS);
    writeCacheEntry('asu_hockey_roster', 30 * DAY_MS);
    const removed = maintenance.pruneCache();
    expect(removed).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'asu_hockey_news'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'asu_hockey_roster'))).toBe(true);
  });

  test('removes abandoned keys older than 3x their TTL (old season schedules)', () => {
    writeCacheEntry('asu_hockey_schedule_2023', 30 * DAY_MS, 2 * HOUR_MS);
    const removed = maintenance.pruneCache();
    expect(removed).toContain('asu_hockey_schedule_2023');
    expect(fs.existsSync(path.join(tmpDir, 'asu_hockey_schedule_2023'))).toBe(false);
  });

  test('keeps abandoned keys still within 3x their TTL', () => {
    writeCacheEntry('asu_hockey_schedule_2023', 1 * HOUR_MS, 2 * HOUR_MS);
    const removed = maintenance.pruneCache();
    expect(removed).toEqual([]);
  });

  test('removes orphaned tmp files older than a day, keeps fresh ones', () => {
    fs.writeFileSync(path.join(tmpDir, 'asu_hockey_news.tmp.123.456'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'asu_hockey_stats.tmp.123.789'), '{}');
    ageFile('asu_hockey_news.tmp.123.456', 2 * DAY_MS);

    const removed = maintenance.pruneCache();
    expect(removed).toEqual(['asu_hockey_news.tmp.123.456']);
    expect(fs.existsSync(path.join(tmpDir, 'asu_hockey_stats.tmp.123.789'))).toBe(true);
  });

  test('removes expired 403-cooldown markers, keeps active ones', () => {
    fs.writeFileSync(path.join(tmpDir, '.403-cooldown-active.example.com'), '');
    fs.writeFileSync(path.join(tmpDir, '.403-cooldown-expired.example.com'), '');
    ageFile('.403-cooldown-expired.example.com', 2 * DAY_MS);

    const removed = maintenance.pruneCache();
    expect(removed).toEqual(['.403-cooldown-expired.example.com']);
    expect(fs.existsSync(path.join(tmpDir, '.403-cooldown-active.example.com'))).toBe(true);
  });

  test('returns empty when cache dir does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(maintenance.pruneCache()).toEqual([]);
  });
});

describe('checkDataStaleness', () => {
  test('warns to Sentry for stale alerting datasets', () => {
    writeCacheEntry('asu_hockey_roster', 4 * DAY_MS); // threshold 3 days
    const alerts = maintenance.checkDataStaleness();

    const rosterAlert = alerts.find((a) => a.name === 'roster');
    expect(rosterAlert).toBeDefined();
    expect(rosterAlert.status).toBe('stale');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("'roster' is stale"),
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ component: 'cache-maintenance', dataset: 'roster' }),
      })
    );
  });

  test('alerts missing for cache-only datasets with no data at all', () => {
    const alerts = maintenance.checkDataStaleness();
    const names = alerts.map((a) => a.name);
    expect(names).toContain('news');
    expect(names).toContain('stats');
  });

  test('does not alert for fresh datasets', () => {
    writeCacheEntry('asu_hockey_roster', 1 * HOUR_MS);
    const alerts = maintenance.checkDataStaleness();
    expect(alerts.find((a) => a.name === 'roster')).toBeUndefined();
  });

  test('never alerts for non-alerting (hand-maintained) datasets', () => {
    const alerts = maintenance.checkDataStaleness();
    expect(alerts.find((a) => a.name === 'recruiting')).toBeUndefined();
  });
});
