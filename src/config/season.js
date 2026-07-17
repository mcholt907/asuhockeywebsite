// Display strings for the active season. Keep in sync with CURRENT_SEASON
// in config/scraper-config.js when the season changes.
export const SEASON_FULL = "2026-2027"; // e.g. page titles: "(2026-2027 Season)"
export const SEASON_SHORT = "2026-27"; // e.g. meta descriptions: "2026-27 roster"

// Previous season in short form ("2025-26"), derived so it stays in sync.
const startYear = parseInt(SEASON_FULL.slice(0, 4), 10);
export const PRIOR_SEASON_SHORT = `${startYear - 1}-${String(startYear).slice(-2)}`;
