// Scraper Configuration
// Centralized configuration for all scraper functions

const CURRENT_SEASON = process.env.CURRENT_SEASON || '2025-2026';
const FUTURE_SEASONS = [
  '2026-2027',
  '2027-2028',
  '2028-2029'
];

module.exports = {
  // Season constants
  CURRENT_SEASON,
  FUTURE_SEASONS,

  // Legacy season configuration for backward compatibility
  seasons: {
    current: parseInt(process.env.CURRENT_SEASON_YEAR) || 2025,
    stats: process.env.STATS_SEASON || '20252026'
  },

  // HTTP Configuration
  http: {
    userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36',
    timeout: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000, // 30 seconds
    retry: {
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY_MS) || 1000,
      maxDelay: parseInt(process.env.RETRY_MAX_DELAY_MS) || 10000
    },
    rateLimiting: {
      delayBetweenRequests: parseInt(process.env.REQUEST_DELAY_MS) || 1000 // 1 second between requests
    }
  },

  // Cache durations (in milliseconds)
  cache: {
    news: parseInt(process.env.CACHE_DURATION_NEWS_MS) || 3 * 60 * 1000, // 3 minutes
    schedule: parseInt(process.env.CACHE_DURATION_SCHEDULE_MS) || 24 * 60 * 60 * 1000, // 24 hours
    stats: parseInt(process.env.CACHE_DURATION_STATS_MS) || 6 * 60 * 60 * 1000 // 6 hours
  },

  // Season boundary logic
  seasonBoundary: {
    // Months 0-6 (Jan-Jul) are part of the end year of the season
    boundaryMonth: 7 // July (0-indexed)
  },

  // URLs
  urls: {
    sunDevilsNews: 'https://thesundevils.com/sports/ice-hockey/news?view=list',
    sunDevilsRSS: 'http://thesundevils.com/rss.aspx?path=mhockey',
    sunDevilsSchedule: (year) => {
      // User requested static URL for schedule
      return 'https://thesundevils.com/sports/ice-hockey/schedule';
    },
    chnNews: 'https://www.collegehockeynews.com/reports/team/Arizona-State/61',
    chnStats: (season) => `https://www.collegehockeynews.com/stats/team/Arizona-State/61/overall,${season}`,
    chnSchedule: 'https://www.collegehockeynews.com/schedules/team/Arizona-State/61',
    uscho: 'https://www.uscho.com/team/arizona-state/mens-hockey/'
  }
};

