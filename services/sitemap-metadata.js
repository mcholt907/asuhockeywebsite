const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : date;
}

function toSitemapDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function maxDate(values) {
  const times = values
    .map(parseDate)
    .filter(Boolean)
    .map(date => date.getTime());

  if (times.length === 0) return null;
  return new Date(Math.max(...times));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

function readCacheTimestamp(cacheKey, rootDir) {
  const filePath = path.join(rootDir, 'src', 'scripts', 'cache', cacheKey);
  const cache = readJson(filePath);
  return cache?.timestamp || fileMtime(filePath);
}

function readCacheTimestampsByPrefix(prefix, rootDir) {
  const cacheDir = path.join(rootDir, 'src', 'scripts', 'cache');
  try {
    return fs.readdirSync(cacheDir)
      .filter(fileName => fileName.startsWith(prefix))
      .map(fileName => readCacheTimestamp(fileName, rootDir));
  } catch {
    return [];
  }
}

function readJsonDate(relativePath, keys, rootDir) {
  const filePath = path.join(rootDir, relativePath);
  const data = readJson(filePath);
  let value = data;

  for (const key of keys) {
    value = value?.[key];
  }

  return value || fileMtime(filePath);
}

function latestManualNewsDate(staticData) {
  const dates = (staticData?.manual_news || []).map(article => article.date);
  return maxDate(dates);
}

function getSitemapPages(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const fallbackDate = options.fallbackDate || new Date();
  const staticDataPath = path.join(rootDir, 'asu_hockey_data.json');
  const staticData = readJson(staticDataPath) || {};
  const staticDataDate = staticData.last_updated || fileMtime(staticDataPath);

  const newsDate = maxDate([
    readCacheTimestamp('asu_hockey_news', rootDir),
    latestManualNewsDate(staticData),
    staticDataDate,
  ]);

  const scheduleDate = maxDate([
    ...readCacheTimestampsByPrefix('asu_hockey_schedule_', rootDir),
    staticDataDate,
  ]);

  const rosterDate = maxDate([
    readCacheTimestamp('asu_hockey_roster', rootDir),
    staticDataDate,
  ]);

  const statsDate = maxDate([
    readCacheTimestamp('asu_hockey_stats', rootDir),
    ...readCacheTimestampsByPrefix('chn_stats_', rootDir),
    staticDataDate,
  ]);

  const recruitingDate = maxDate([
    staticDataDate,
    readCacheTimestamp('asu_transfers', rootDir),
    readJsonDate(path.join('data', 'asu_transfers_fallback.json'), ['lastUpdated'], rootDir),
  ]);

  const alumniDate = maxDate([
    readCacheTimestamp('asu_alumni', rootDir),
    readJsonDate(path.join('data', 'asu_alumni_fallback.json'), ['lastUpdated'], rootDir),
  ]);

  const sectionDates = {
    news: newsDate,
    schedule: scheduleDate,
    roster: rosterDate,
    stats: statsDate,
    recruiting: recruitingDate,
    alumni: alumniDate,
  };

  const homeDate = maxDate(Object.values(sectionDates));

  const pageConfig = [
    { url: '/', priority: '1.0', changefreq: 'daily', lastmod: homeDate },
    { url: '/news', priority: '0.9', changefreq: 'daily', lastmod: newsDate },
    { url: '/schedule', priority: '0.9', changefreq: 'daily', lastmod: scheduleDate },
    { url: '/roster', priority: '0.8', changefreq: 'weekly', lastmod: rosterDate },
    { url: '/stats', priority: '0.8', changefreq: 'daily', lastmod: statsDate },
    { url: '/recruiting', priority: '0.7', changefreq: 'weekly', lastmod: recruitingDate },
    { url: '/alumni', priority: '0.6', changefreq: 'monthly', lastmod: alumniDate },
  ];

  return pageConfig.map(page => ({
    ...page,
    lastmod: toSitemapDate(page.lastmod) || toSitemapDate(fallbackDate),
  }));
}

module.exports = {
  getSitemapPages,
  toSitemapDate,
};
