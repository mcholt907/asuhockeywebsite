// Tests for the thesundevils.com website-api scrapers (server-side Jest)
// Fixtures in __tests__/fixtures/ are trimmed real API responses captured
// 2026-07-09 â€” see docs/plans/2026-07-09-sundevils-website-api-migration.md.
// Run: npx jest --config jest.server.config.js

jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

const articlesFixture = require("./fixtures/sundevils-articles.json");
const schedulesFixture = require("./fixtures/sundevils-schedules.json");
const eventsFixture = require("./fixtures/sundevils-schedule-events.json");

const { requestWithRetry } = require("../server/lib/request-helper");
const { scrapeSunDevilsNewsList } = require("../server/scrapers/news");
const { scrapeSunDevilsSchedule } = require("../server/scrapers/schedule");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("scrapeSunDevilsNewsList â€” articles API", () => {
  test("maps articles to the news shape with Phoenix-local display dates", async () => {
    requestWithRetry.mockResolvedValueOnce({ data: articlesFixture });

    const articles = await scrapeSunDevilsNewsList();

    expect(articles).toHaveLength(3);
    expect(articles[0]).toEqual({
      title: "Four-Week Road Stretch For Hockey Begins at #14 Providence",
      link: "https://thesundevils.com/news/2024/10/17/four-week-road-stretch-for-hockey-begins-at-14-providence",
      // 2024-10-17T05:05Z is 2024-10-16 22:05 in Phoenix (UTC-7)
      date: "October 16, 2024",
      source: "TheSunDevils.com",
    });
    // Display-date format must parse for the news feed's date sort
    for (const a of articles) {
      expect(isNaN(new Date(a.date))).toBe(false);
    }
  });

  test("skips items missing title or permalink", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: {
        data: [
          {
            title: "",
            permalink: "https://x",
            published_at: "2026-01-01T00:00:00Z",
          },
          {
            title: "No link",
            permalink: null,
            published_at: "2026-01-01T00:00:00Z",
          },
          {
            title: "Good",
            permalink: "https://good",
            published_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });

    const articles = await scrapeSunDevilsNewsList();

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Good");
  });

  test("returns [] when the request fails", async () => {
    requestWithRetry.mockRejectedValueOnce(new Error("network error"));

    await expect(scrapeSunDevilsNewsList()).resolves.toEqual([]);
  });

  test("parses a JSON string body (Puppeteer fallback path)", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: JSON.stringify(articlesFixture),
    });

    const articles = await scrapeSunDevilsNewsList();

    expect(articles).toHaveLength(3);
  });
});

describe("scrapeSunDevilsSchedule â€” schedules + schedule-events API", () => {
  function mockScheduleRequests(events = eventsFixture) {
    requestWithRetry
      .mockResolvedValueOnce({ data: schedulesFixture }) // season â†’ schedule id
      .mockResolvedValueOnce({ data: events }); // events for that schedule
  }

  test("resolves the season slug to a schedule id and fetches its events", async () => {
    mockScheduleRequests();

    const games = await scrapeSunDevilsSchedule(2025);

    // 2025 â†’ slug "2025-26" â†’ schedule id 223 in the fixture
    expect(requestWithRetry.mock.calls[1][0]).toContain("223");
    expect(games).toHaveLength(4);
  });

  test("converts UTC datetimes to Phoenix-local date and time", async () => {
    mockScheduleRequests();

    const games = await scrapeSunDevilsSchedule(2025);
    const notreDame = games.find((g) => g.opponent === "Notre Dame");

    // 2025-10-11T02:00Z is 2025-10-10 7:00 PM in Phoenix â€” the UTC date
    // would be off by one, which is exactly the box-score matching bug
    // the old year-guessing scraper had.
    expect(notreDame.date).toBe("2025-10-10");
    expect(notreDame.time).toBe("7:00 PM");
  });

  test('formats results as "W 5-3" / "L 3-6" / "T 3-3" with ASU score first', async () => {
    mockScheduleRequests();

    const games = await scrapeSunDevilsSchedule(2025);
    const byOpponent = Object.fromEntries(games.map((g) => [g.opponent, g]));

    expect(byOpponent["Notre Dame"].result).toBe("W 5-3");
    // Penn State won 6-3, so ASU's score (3) comes first
    expect(byOpponent["#6 Penn State"].result).toBe("L 3-6");
    expect(byOpponent["#20 Colorado College"].result).toBe("T 3-3");
    // Upcoming game: result object exists but result is null â†’ no key at all
    expect(byOpponent["Lindenwood"]).not.toHaveProperty("result");
  });

  test("maps venue/status/links and honors the tba flag", async () => {
    mockScheduleRequests();

    const games = await scrapeSunDevilsSchedule(2025);
    const notreDame = games.find((g) => g.opponent === "Notre Dame");
    const lindenwood = games.find((g) => g.opponent === "Lindenwood");

    expect(notreDame.status).toBe("Home");
    expect(notreDame.location).toBe("Mullett Arena, Tempe, AZ");
    expect(notreDame.links).toEqual([
      { text: "Live stats", url: "http://statb.us/b/608987" },
      {
        text: "Game notes",
        url: "https://thesundevils.com/documents/884ef0ad-939e-4b0a-adb1-bdc723f267de.pdf",
      },
    ]);

    expect(lindenwood.status).toBe("Away");
    expect(lindenwood.time).toBe("TBA"); // tba: "time_tba"
    expect(lindenwood.date).toBe("2026-10-02");
  });

  test("flags exhibitions in notes", async () => {
    const events = JSON.parse(JSON.stringify(eventsFixture));
    events.data[0].is_exhibition = true;
    mockScheduleRequests(events);

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games[0].notes).toBe("Exhibition");
    expect(games[1].notes).toBe("");
  });

  test("skips events without an opponent or parseable datetime", async () => {
    const events = JSON.parse(JSON.stringify(eventsFixture));
    events.data[0].opponent_name = "";
    events.data[0].opponent = null;
    events.data[1].datetime = "not-a-date";
    mockScheduleRequests(events);

    const games = await scrapeSunDevilsSchedule(2025);

    expect(games).toHaveLength(2);
  });

  test("throws when no schedule exists for the requested season", async () => {
    requestWithRetry.mockResolvedValueOnce({ data: schedulesFixture });

    await expect(scrapeSunDevilsSchedule(2030)).rejects.toThrow(
      /no schedule for season 2030-31/,
    );
  });
});
