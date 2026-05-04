const fs = require('fs');
const os = require('os');
const path = require('path');

const { getSitemapPages, toSitemapDate } = require('../services/sitemap-metadata');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('sitemap metadata', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-metadata-'));

    writeJson(path.join(rootDir, 'asu_hockey_data.json'), {
      last_updated: '2026-02-06T09:47:13.849Z',
      manual_news: [
        { title: 'Older', date: 'March 25, 2026' },
        { title: 'Newest', date: 'April 30, 2026' },
      ],
    });

    writeJson(path.join(rootDir, 'src', 'scripts', 'cache', 'asu_hockey_news'), {
      timestamp: '2026-05-01T12:00:00.000Z',
      data: [],
    });
    writeJson(path.join(rootDir, 'src', 'scripts', 'cache', 'asu_hockey_schedule_2025'), {
      timestamp: '2026-05-02T12:00:00.000Z',
      data: {},
    });
    writeJson(path.join(rootDir, 'src', 'scripts', 'cache', 'asu_hockey_roster'), {
      timestamp: '2026-03-01T12:00:00.000Z',
      data: [],
    });
    writeJson(path.join(rootDir, 'src', 'scripts', 'cache', 'asu_hockey_stats'), {
      timestamp: '2026-04-15T12:00:00.000Z',
      data: {},
    });
    writeJson(path.join(rootDir, 'src', 'scripts', 'cache', 'asu_transfers'), {
      timestamp: '2026-04-20T12:00:00.000Z',
      data: {},
    });
    writeJson(path.join(rootDir, 'data', 'asu_transfers_fallback.json'), {
      lastUpdated: '2026-04-30T15:49:08.191Z',
    });
    writeJson(path.join(rootDir, 'data', 'asu_alumni_fallback.json'), {
      lastUpdated: '2026-04-30T15:49:45.279Z',
    });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('formats valid dates for sitemap lastmod', () => {
    expect(toSitemapDate('2026-04-30T15:49:45.279Z')).toBe('2026-04-30');
    expect(toSitemapDate('not a date')).toBeNull();
  });

  test('returns public routes with content-derived lastmod values', () => {
    const pages = getSitemapPages({
      rootDir,
      fallbackDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(pages.map(page => page.url)).toEqual([
      '/',
      '/news',
      '/schedule',
      '/roster',
      '/stats',
      '/recruiting',
      '/alumni',
    ]);

    expect(pages.find(page => page.url === '/news').lastmod).toBe('2026-05-01');
    expect(pages.find(page => page.url === '/schedule').lastmod).toBe('2026-05-02');
    expect(pages.find(page => page.url === '/roster').lastmod).toBe('2026-03-01');
    expect(pages.find(page => page.url === '/stats').lastmod).toBe('2026-04-15');
    expect(pages.find(page => page.url === '/recruiting').lastmod).toBe('2026-04-30');
    expect(pages.find(page => page.url === '/alumni').lastmod).toBe('2026-04-30');
    expect(pages.find(page => page.url === '/').lastmod).toBe('2026-05-02');
    expect(pages.some(page => page.url === '/about')).toBe(false);
    expect(pages.some(page => page.url === '/contact')).toBe(false);
  });
});
