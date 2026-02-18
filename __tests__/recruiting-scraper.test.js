jest.mock('../src/scripts/caching-system', () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
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
  FUTURE_SEASONS: ['2026-2027'],
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
  },
}));

const { getFromCache, saveToCache } = require('../src/scripts/caching-system');
const { requestWithRetry } = require('../utils/request-helper');
const { fetchRecruitingData } = require('../recruiting-scraper');

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockReturnValue(undefined);
  requestWithRetry.mockResolvedValue({ data: '<html></html>' });
});

describe('fetchRecruitingData — SWR caching', () => {
  test('returns fresh cached data without hitting the network', async () => {
    const freshData = { '2026-2027': [{ name: 'Jane Smith' }] };
    getFromCache.mockReturnValueOnce(freshData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(freshData);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test('returns stale data immediately when cache is expired', async () => {
    const staleData = { '2026-2027': [{ name: 'John Doe' }] };
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(staleData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(staleData);
  });
});
