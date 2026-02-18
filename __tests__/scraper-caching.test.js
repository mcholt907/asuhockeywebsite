// Tests for scraper caching behaviour (server-side Jest)
// Run: npx jest --config jest.server.config.js

jest.mock('../src/scripts/caching-system', () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/request-helper', () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

jest.mock('../config/scraper-config', () => ({
  CURRENT_SEASON: '2025-2026',
  FUTURE_SEASONS: [],
  seasons: { current: 2025, stats: '20252026' },
  http: {
    userAgent: 'test-agent',
    timeout: 5000,
    retry: { maxRetries: 1, initialDelay: 0, maxDelay: 0 },
    rateLimiting: { delayBetweenRequests: 0 },
  },
  cache: { news: 60000, schedule: 86400000, stats: 21600000 },
  seasonBoundary: { boundaryMonth: 7 },
  urls: {
    chnStats: () => 'http://test/stats',
    chnNews: 'http://test/chn-news',
    sunDevilsNews: 'http://test/sd-news',
    sunDevilsSchedule: () => 'http://test/schedule',
    uscho: 'http://test/uscho',
  },
}));

const { getFromCache, saveToCache } = require('../src/scripts/caching-system');
const { requestWithRetry } = require('../utils/request-helper');
const { scrapeCHNRoster } = require('../scraper');

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockResolvedValue(undefined);
  requestWithRetry.mockResolvedValue({ data: '<html></html>' });
});

describe('scrapeCHNRoster — SWR caching', () => {
  test('returns fresh cached roster without hitting the network', async () => {
    const freshRoster = [
      { Player: 'Jane Smith', '#': '99', Pos: 'G', Ht: '5-10', Wt: '165', DOB: '2001-05-10', Hometown: 'Scottsdale, AZ' },
    ];
    getFromCache.mockReturnValueOnce(freshRoster);

    const result = await scrapeCHNRoster();

    expect(result).toEqual(freshRoster);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test('returns stale roster immediately when cache is expired, without blocking on live scrape', async () => {
    const staleRoster = [
      { Player: 'John Doe', '#': '1', Pos: 'F', Ht: '6-0', Wt: '185', DOB: '2000-01-01', Hometown: 'Phoenix, AZ' },
    ];
    // First call (fresh): miss. Second call (ignoreExpiration=true): stale hit.
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(staleRoster);

    const result = await scrapeCHNRoster();

    // Must return stale data, not wait for the background live scrape
    expect(result).toEqual(staleRoster);
  });
});
