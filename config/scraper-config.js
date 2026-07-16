// Scraper Configuration
// Centralized configuration for all scraper functions

const CURRENT_SEASON = process.env.CURRENT_SEASON || "2026-2027";
const FUTURE_SEASONS = ["2027-2028", "2028-2029", "2029-2030"];

module.exports = {
  // Season constants
  CURRENT_SEASON,
  FUTURE_SEASONS,

  // Legacy season configuration for backward compatibility
  seasons: {
    current: parseInt(process.env.CURRENT_SEASON_YEAR) || 2026,
    stats: process.env.STATS_SEASON || "20262027",
  },

  // HTTP Configuration
  http: {
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    timeout: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000, // 30 seconds
    retry: {
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY_MS) || 1000,
      maxDelay: parseInt(process.env.RETRY_MAX_DELAY_MS) || 10000,
    },
    rateLimiting: {
      delayBetweenRequests: parseInt(process.env.REQUEST_DELAY_MS) || 1000, // 1 second between requests
    },
  },

  // Cache durations (in milliseconds)
  cache: {
    news: parseInt(process.env.CACHE_DURATION_NEWS_MS) || 60 * 60 * 1000, // 1 hour
    schedule:
      parseInt(process.env.CACHE_DURATION_SCHEDULE_MS) || 2 * 60 * 60 * 1000, // 2 hours
    stats: parseInt(process.env.CACHE_DURATION_STATS_MS) || 2 * 60 * 60 * 1000, // 2 hours
    standings:
      parseInt(process.env.CACHE_DURATION_STANDINGS_MS) || 2 * 60 * 60 * 1000, // 2 hours
    roster:
      parseInt(process.env.CACHE_DURATION_ROSTER_MS) || 24 * 60 * 60 * 1000, // 24 hours
  },

  // URLs
  urls: {
    // thesundevils.com website-api (WMT/Nuxt platform JSON API).
    // filter[sport.id]=7 / filter[sports.id]=7 — 7 is men's ice hockey.
    sunDevilsArticles:
      "https://thesundevils.com/website-api/articles?filter%5Bsports.id%5D=7&sort=-published_at&per_page=25",
    sunDevilsSchedules:
      "https://thesundevils.com/website-api/schedules?filter%5Bsport.id%5D=7&include=season&per_page=50",
    sunDevilsScheduleEvents: (scheduleId) =>
      `https://thesundevils.com/website-api/schedule-events?filter%5Bschedule_id%5D=${scheduleId}&include=opponent,scheduleEventResult,scheduleEventLinks,tournament&per_page=100&sort=datetime`,
    chnNews: "https://www.collegehockeynews.com/reports/team/Arizona-State/61",
    chnStats: (season) =>
      `https://www.collegehockeynews.com/stats/team/Arizona-State/61/overall,${season}`,
    chnSchedule:
      "https://www.collegehockeynews.com/schedules/team/Arizona-State/61",
    nchcStandings: "https://www.uscho.com/standings/division-i-men",
    uscho: "https://www.uscho.com/team/arizona-state/mens-hockey/",
  },
};
