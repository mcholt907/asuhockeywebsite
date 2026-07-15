// Tests for schedule season auto-detection (server-side Jest)
// Run: npx jest --config jest.server.config.js
//
// The sundevils.com schedule page shows only month/day for each game; the
// year must be inferred. The page's season dropdown (select#games-season)
// declares which season is being displayed, so the scraper should trust
// that over the configured season year — otherwise every game gets stamped
// with a stale year after the site rolls over to a new season.

jest.mock("../src/scripts/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../utils/request-helper", () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  captureMessage: jest.fn(),
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

jest.mock("../config/scraper-config", () => ({
  CURRENT_SEASON: "2025-2026",
  FUTURE_SEASONS: [],
  seasons: { current: 2025, stats: "20252026" },
  http: {
    userAgent: "test-agent",
    timeout: 5000,
    retry: { maxRetries: 1, initialDelay: 0, maxDelay: 0 },
    rateLimiting: { delayBetweenRequests: 0 },
  },
  cache: { news: 60000, schedule: 86400000, stats: 21600000, roster: 86400000 },
  seasonBoundary: { boundaryMonth: 7 },
  urls: {
    chnStats: () => "http://test/stats",
    chnNews: "http://test/chn-news",
    sunDevilsNews: "http://test/sd-news",
    sunDevilsSchedule: () => "http://test/schedule",
    uscho: "http://test/uscho",
    chnSchedule: "http://test/chn-schedule",
  },
}));

const Sentry = require("@sentry/node");
const { requestWithRetry } = require("../utils/request-helper");
const { scrapeSunDevilsSchedule } = require("../scraper");

const gameItem = (month, day) => `
  <div class="schedule-event-item">
    <div class="schedule-event-item__date-desktop">
      <strong class="schedule-event-grid-date__box">
        <time>${month}</time>
        <time>${day}</time>
      </strong>
    </div>
    <div class="schedule-event-grid-date__footer">
      <strong class="schedule-event-grid-date__time">7:00 PM</strong>
    </div>
    <div class="schedule-event-item__location">Mullett Arena, Tempe, AZ</div>
    <strong class="schedule-default-event__name">vs. Penn State</strong>
    <strong class="schedule-default-event__divider">vs.</strong>
  </div>`;

const seasonSelect = (selectedSeason) => `
  <select id="games-season" class="dropdown__select" name="games-season">
    <option value="${selectedSeason}" selected>${selectedSeason}</option>
    <option value="2025-26">2025-26</option>
  </select>
  <select id="games-dropdown" class="dropdown__select" name="games-dropdown">
    <option selected>All Games</option>
    <option value="home">Home</option>
  </select>`;

const page = (body) => `<html><body>${body}</body></html>`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("scrapeSunDevilsSchedule — season auto-detection", () => {
  test("stamps game year from the page's selected season, not the caller's year", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: page(seasonSelect("2026-27") + gameItem("Oct", "2")),
    });

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games).toHaveLength(1);
    expect(games[0].date).toBe("2026-10-02");
  });

  test("assigns Jan–Jul games to the end year of the detected season", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: page(seasonSelect("2026-27") + gameItem("Jan", "2")),
    });

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games).toHaveLength(1);
    expect(games[0].date).toBe("2027-01-02");
  });

  test("falls back to the caller's year when the page has no season dropdown", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: page(gameItem("Oct", "2")),
    });

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games).toHaveLength(1);
    expect(games[0].date).toBe("2025-10-02");
  });

  test("reports a Sentry warning when the page season disagrees with the configured year", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: page(seasonSelect("2026-27") + gameItem("Oct", "2")),
    });

    await scrapeSunDevilsSchedule(2025);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("2026-27"),
      "warning",
    );
  });

  test("does not report to Sentry when the page season matches the configured year", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: page(seasonSelect("2025-26") + gameItem("Oct", "2")),
    });

    await scrapeSunDevilsSchedule(2025);

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  test("reports a Sentry warning when the season dropdown exists but has no selected option", async () => {
    const body =
      `
      <select id="games-season" class="dropdown__select">
        <option value="2026-27">2026-27</option>
        <option value="2025-26">2025-26</option>
      </select>` + gameItem("Oct", "2");
    requestWithRetry.mockResolvedValueOnce({ data: page(body) });

    const games = await scrapeSunDevilsSchedule(2025);

    // Falls back to configured year, but loudly — this silent-degradation
    // path is exactly what caused the 2026 "No upcoming games" outage.
    expect(games[0].date).toBe("2025-10-02");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("games-season"),
      "warning",
    );
  });

  test("ignores selected options that are not season-shaped (e.g. 'All Games')", async () => {
    // Only the games-dropdown has a selected option; season select has none.
    const body =
      `
      <select id="games-dropdown" class="dropdown__select">
        <option selected>All Games</option>
      </select>` + gameItem("Oct", "2");
    requestWithRetry.mockResolvedValueOnce({ data: page(body) });

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games).toHaveLength(1);
    expect(games[0].date).toBe("2025-10-02");
  });
});
