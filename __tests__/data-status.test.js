// Tests for server/cache/data-status.js (server-side Jest)
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

function writeCacheEntry(
  key,
  ageMs,
  cacheDuration = DAY_MS,
  data = { some: 'data' },
) {
  const entry = {
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    data,
    cacheDuration,
  };
  fs.writeFileSync(path.join(tmpDir, key), JSON.stringify(entry));
}

function datasetByName(name, options) {
  return dataStatus.getDataStatus(options).find((d) => d.name === name);
}

function standingsSnapshot({
  season = '2025-2026',
  overallRecord = '1-0-0',
  teams = 9,
} = {}) {
  const names = [
    'North Dakota',
    'Denver',
    'Western Michigan',
    'Minnesota Duluth',
    'St. Cloud State',
    'Colorado College',
    'Miami',
    'Omaha',
    'Arizona State',
  ];
  return {
    season,
    lastUpdated: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    teams: names.slice(0, teams).map((team, index) => ({
      rank: String(index + 1),
      team,
      pts: '3',
      confRecord: overallRecord,
      overallRecord,
      isASU: team === 'Arizona State',
    })),
  };
}

function createStandingsRoot(contents) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-status-root-'));
  const fallbackFile = path.join(rootDir, 'data', 'nchc_standings_fallback.json');
  fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
  fs.writeFileSync(
    fallbackFile,
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
  return rootDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-status-test-'));
  process.env.CACHE_DIR = tmpDir;
  jest.resetModules();
  jest.clearAllMocks();
  dataStatus = require('../server/cache/data-status');
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
    // No asu_transfers cache written Ã¢â‚¬â€ the committed fallback file is used.
    const transfers = datasetByName('transfers');
    expect(transfers.source).toBe('fallback');
    expect(transfers.file).toBe('data/asu_transfers_fallback.json');
    expect(typeof transfers.ageMs).toBe('number');
  });

  test('prefers the fresher of cache vs fallback', () => {
    // Cache much fresher than the committed fallback's lastUpdated.
    // Keep the synthetic cache newer than a fallback generated immediately
    // before this validation suite runs.
    writeCacheEntry('asu_transfers', 0);
    const transfers = datasetByName('transfers');
    expect(transfers.source).toBe('cache');
    expect(transfers.status).toBe('ok');
  });

  test('reports the bundled recruiting roster as an alerting fallback dataset', () => {
    const recruiting = datasetByName('recruiting');
    expect(recruiting.source).toBe('fallback');
    expect(recruiting.file).toBe('data/asu_recruiting_fallback.json');
    expect(recruiting.alert).toBe(true);
    expect(recruiting.status).toBe('ok');
  });

  test('uses the season-scoped standings cache key and bundled fallback', () => {
    const config = require('../config/scraper-config');
    const standings = datasetByName('standings');
    expect(standings.key).toBe(`nchc_standings_${config.CURRENT_SEASON}`);
    expect(standings.source).toBe('fallback');
    expect(standings.file).toBe('data/nchc_standings_fallback.json');
  });

  test.each([
    ['malformed shape', { season: '2026-2027', teams: [] }],
    ['all-zero table', standingsSnapshot({ season: '2026-2027', overallRecord: '0-0-0' })],
    ['incomplete table', standingsSnapshot({ season: '2026-2027', teams: 8 })],
    ['wrong season', standingsSnapshot({ season: '2025-2026' })],
  ])('ignores a standings cache with %s and reports the valid prior-season fallback', (_, cachePayload) => {
    const config = require('../config/scraper-config');
    const rootDir = createStandingsRoot(standingsSnapshot());
    writeCacheEntry(
      `nchc_standings_${config.CURRENT_SEASON}`,
      1 * HOUR_MS,
      DAY_MS,
      cachePayload,
    );

    try {
      const standings = datasetByName('standings', { rootDir });
      expect(standings.source).toBe('fallback');
      expect(standings.file).toBe('data/nchc_standings_fallback.json');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('ignores invalid JSON in the standings cache', () => {
    const config = require('../config/scraper-config');
    const rootDir = createStandingsRoot(standingsSnapshot());
    fs.writeFileSync(
      path.join(tmpDir, `nchc_standings_${config.CURRENT_SEASON}`),
      '{not valid JSON',
    );

    try {
      expect(datasetByName('standings', { rootDir }).source).toBe('fallback');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test.each([
    ['invalid JSON', '{not valid JSON'],
    ['malformed shape', JSON.stringify({ season: '2025-2026', teams: [] })],
    ['all-zero table', JSON.stringify(standingsSnapshot({ overallRecord: '0-0-0' }))],
    ['incomplete table', JSON.stringify(standingsSnapshot({ teams: 8 }))],
  ])('reports standings missing when cache is absent and fallback has %s', (_, fallbackContents) => {
    const rootDir = createStandingsRoot(fallbackContents);

    try {
      const standings = datasetByName('standings', { rootDir });
      expect(standings.source).toBe('none');
      expect(standings.status).toBe('missing');
      expect(standings.file).toBeUndefined();
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('accepts a complete played prior-season standings fallback', () => {
    const rootDir = createStandingsRoot(standingsSnapshot({ season: '2024-2025' }));

    try {
      const standings = datasetByName('standings', { rootDir });
      expect(standings.source).toBe('fallback');
      expect(standings.status).toBe('ok');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
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
