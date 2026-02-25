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
    chnSchedule: 'http://test/chn-schedule',
  },
}));

const { getFromCache, saveToCache } = require('../src/scripts/caching-system');
const { requestWithRetry } = require('../utils/request-helper');
const { scrapeCHNRoster, scrapeCHNScheduleLinks, scrapeUSCHORecord } = require('../scraper');

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


describe('scrapeCHNScheduleLinks', () => {
  test('returns date-keyed map of box and metrics links', async () => {
    const html = [
      '<html><body><table>',
      '  <tr>',
      '    <td><a href=\"/box/final/20251003/psu/asu/\">Box</a></td>',
      '    <td><a href=\"/box/metrics.php?gd=110368\">Metrics</a></td>',
      '  </tr>',
      '  <tr>',
      '    <td><a href=\"/box/final/20251010/ndm/asu/\">Box</a></td>',
      '    <td><a href=\"/box/metrics.php?gd=110371\">Metrics</a></td>',
      '  </tr>',
      '</table></body></html>',
    ].join('\n');

    requestWithRetry.mockResolvedValueOnce({ data: html });

    const result = await scrapeCHNScheduleLinks();

    expect(result).toEqual({
      '2025-10-03': {
        box_link: 'https://www.collegehockeynews.com/box/final/20251003/psu/asu/',
        metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=110368',
      },
      '2025-10-10': {
        box_link: 'https://www.collegehockeynews.com/box/final/20251010/ndm/asu/',
        metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=110371',
      },
    });
  });

  test('returns empty object when request fails', async () => {
    requestWithRetry.mockRejectedValueOnce(new Error('network error'));

    const result = await scrapeCHNScheduleLinks();

    expect(result).toEqual({});
  });

  test('skips rows without a box link', async () => {
    const html = [
      '<html><body><table>',
      '  <tr>',
      '    <td>No links here</td>',
      '  </tr>',
      '  <tr>',
      '    <td><a href=\"/box/final/20251003/psu/asu/\">Box</a></td>',
      '    <td><a href=\"/box/metrics.php?gd=110368\">Metrics</a></td>',
      '  </tr>',
      '</table></body></html>',
    ].join('\n');

    requestWithRetry.mockResolvedValueOnce({ data: html });

    const result = await scrapeCHNScheduleLinks();

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['2025-10-03']).toBeDefined();
  });
});

describe('scrapeUSCHORecord', () => {
  const makeInertiaHtml = (record) => {
    const page = { props: { content: { record } } };
    return `<html><body><div id="app" data-page='${JSON.stringify(page)}'></div></body></html>`;
  };

  test('returns overall, conf, home, and away records from Inertia JSON', async () => {
    const record = {
      total: { wins: 14, losses: 19, ties: 1 },
      conf:  { total: { wins: 7, losses: 14, ties: 1 } },
      home:  { wins: 9,  losses: 10, ties: 1 },
      road:  { wins: 5,  losses: 9,  ties: 0 },
    };
    requestWithRetry.mockResolvedValueOnce({ data: makeInertiaHtml(record) });

    const result = await scrapeUSCHORecord();

    expect(result).toEqual({
      overall: { wins: 14, losses: 19, ties: 1 },
      conf:    { wins: 7,  losses: 14, ties: 1 },
      home:    { wins: 9,  losses: 10, ties: 1 },
      away:    { wins: 5,  losses: 9,  ties: 0 },
    });
  });

  test('returns null when the request fails', async () => {
    requestWithRetry.mockRejectedValueOnce(new Error('network error'));

    const result = await scrapeUSCHORecord();

    expect(result).toBeNull();
  });

  test('returns null when the page has no Inertia JSON', async () => {
    requestWithRetry.mockResolvedValueOnce({ data: '<html><body><div id="app"></div></body></html>' });

    const result = await scrapeUSCHORecord();

    expect(result).toBeNull();
  });

  test('returns null when Inertia JSON is missing expected record sub-fields', async () => {
    const page = { props: { content: { record: { total: { wins: 5, losses: 3, ties: 0 } } } } }; // conf/home/road absent
    requestWithRetry.mockResolvedValueOnce({
      data: `<html><body><div id="app" data-page='${JSON.stringify(page)}'></div></body></html>`
    });

    const result = await scrapeUSCHORecord();

    expect(result).toBeNull();
  });
});
