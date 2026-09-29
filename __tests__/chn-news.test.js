// Tests for the CollegeHockeyNews team news scrape (server-side Jest)
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

const { requestWithRetry } = require("../server/lib/request-helper");
const { scrapeCHN } = require("../server/scrapers/news");

// Mirrors CHN's markup: the list shows "Sep. 28" with no year; the year only
// appears in the article URL.
function chnPage(items) {
  const lis = items
    .map(
      ({ date, href, title }) =>
        `<li>${date} — <a href="${href}">${title}</a><span class="aside"> 4&nbsp;comments</span></li>`,
    )
    .join("\n");
  return `<div class="newslist"><h3>Recent CHN Articles</h3><ul>${lis}</ul></div>`;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("scrapeCHN — article dates", () => {
  test("takes the full date from the article URL", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: chnPage([
        {
          date: "Sep. 28",
          href: "/news/2026/09/28_7-ASU-Players-Request-Powers.php",
          title: "7 ASU Players Request Powers Be Put on Leave",
        },
        {
          date: "Sep. 04",
          href: "/news/2026/09/04_ASU-Continues-Prep-For-Season.php",
          title: "ASU Continues Prep For Season While Investigation Continues",
        },
      ]),
    });

    const articles = await scrapeCHN();

    expect(articles.map((a) => a.date)).toEqual([
      "September 28, 2026",
      "September 04, 2026",
    ]);
    expect(articles[0]).toEqual({
      title: "7 ASU Players Request Powers Be Put on Leave",
      link: "https://www.collegehockeynews.com/news/2026/09/28_7-ASU-Players-Request-Powers.php",
      date: "September 28, 2026",
      source: "CollegeHockeyNews.com",
    });
  });

  test("dates sort against other sources instead of parsing as 2001", async () => {
    requestWithRetry.mockResolvedValueOnce({
      data: chnPage([
        {
          date: "Sep. 28",
          href: "/news/2026/09/28_story.php",
          title: "CHN story",
        },
      ]),
    });

    const [article] = await scrapeCHN();

    expect(new Date(article.date).getFullYear()).toBe(2026);
    expect(new Date(article.date) > new Date("September 24, 2026")).toBe(
      true,
    );
  });

  test("infers the year from the list text when the URL has no date", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-29T18:00:00Z") });
    requestWithRetry.mockResolvedValueOnce({
      data: chnPage([
        { date: "Sep. 28", href: "/news/story-a.php", title: "This year" },
        // A December date seen in September belongs to last season
        { date: "Dec. 12", href: "/news/story-b.php", title: "Last year" },
      ]),
    });

    const articles = await scrapeCHN();

    expect(articles.map((a) => a.date)).toEqual([
      "September 28, 2026",
      "December 12, 2025",
    ]);
  });
});
